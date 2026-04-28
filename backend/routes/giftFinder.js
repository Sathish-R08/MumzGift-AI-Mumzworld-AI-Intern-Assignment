import { Router } from "express";
import { z } from "zod";
import { SYSTEM_PROMPT } from "../prompts/systemPrompt.js";
import { formatZodError, giftResponseSchema } from "../validators/giftSchema.js";

const router = Router();

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Comma-separated list; first healthy response wins. Helps when a free endpoint is temporarily down (502). */
const MODEL_CHAIN = (process.env.OPENROUTER_MODELS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
/**
 * Tried in order. `openrouter/free` first = one request often succeeds (fewer round-trips → less 429).
 * For the take-home model name, set OPENROUTER_MODELS=meta-llama/llama-3.3-70b-instruct:free
 * See https://openrouter.ai/models?pricing=free
 */
const DEFAULT_MODELS = [
  "openrouter/free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
];
function getModelsToTry() {
  return MODEL_CHAIN.length ? MODEL_CHAIN : DEFAULT_MODELS;
}

/**
 * Extract a human-readable message from OpenRouter error JSON body.
 * @param {string} text
 * @returns {string}
 */
function openRouterErrorMessage(text) {
  try {
    const j = JSON.parse(text);
    return j.error?.message || j.message || j.error || text.slice(0, 500);
  } catch {
    return text.slice(0, 500);
  }
}
/** OpenRouter call timeout (ms) — stops hung requests; override via env for slow networks. */
const OPENROUTER_TIMEOUT_MS = Math.min(
  Math.max(Number(process.env.OPENROUTER_TIMEOUT_MS) || 120_000, 10_000),
  300_000
);

const MAX_QUERY_LEN = 8_000;

const requestBodySchema = z.object({
  query: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z
      .string({ required_error: "query is required" })
      .min(1, "query must be a non-empty string")
      .max(
        MAX_QUERY_LEN,
        `query must be at most ${MAX_QUERY_LEN} characters`
      )
  ),
});

/**
 * Strips optional markdown code fences and trims so JSON.parse is reliable.
 * @param {string} text
 * @returns {string}
 */
function extractJsonString(text) {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "");
    t = t.replace(/\s*```\s*$/, "");
  }
  return t.trim();
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseModelJson(text) {
  const cleaned = extractJsonString(text);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const err = new Error("Model did not return valid JSON");
    err.cause = e;
    throw err;
  }
}

router.post("/gift-finder", async (req, res) => {
  // Validate incoming request — never call the LLM with bad input
  const parsed = requestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request",
      details: formatZodError(parsed.error).fields,
    });
  }

  const { query } = parsed.data;
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({
      error: "Server misconfiguration",
      message: "OPENROUTER_API_KEY is not set",
    });
  }

  // OpenRouter uses this as app URL; use first CORS origin or override for production
  const referer =
    process.env.OPENROUTER_REFERER?.trim() ||
    process.env.CORS_ORIGIN?.split(",")[0]?.trim() ||
    "http://localhost:3000";
  const appTitle = process.env.OPENROUTER_APP_TITLE || "MumzGift AI";

  /**
   * Single-model body — no `response_format` (it often causes "Provider returned error" on free tiers),
   * no `models`/`route` (avoids 400s on some accounts). JSON is enforced in the system prompt.
   * @param {string} modelId
   * @param {boolean} [useJsonObject] — only if env OPENROUTER_USE_JSON_MODE=1
   */
  const buildBody = (modelId, useJsonObject = false) => {
    const body = {
      model: modelId,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query },
      ],
      temperature: 0.3,
      max_tokens: 2_048,
    };
    if (useJsonObject) {
      body.response_format = { type: "json_object" };
    }
    if (process.env.OPENROUTER_USE_HEALING === "1") {
      body.plugins = [{ id: "response-healing", enabled: true }];
    }
    return body;
  };

  const requestSignal = () => AbortSignal.timeout(OPENROUTER_TIMEOUT_MS);

  const postOpenRouter = (payload) =>
    fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": appTitle,
        "X-OpenRouter-Title": appTitle,
      },
      body: JSON.stringify(payload),
      signal: requestSignal(),
    });

  const useJsonMode = process.env.OPENROUTER_USE_JSON_MODE === "1";

  try {
    const models = getModelsToTry();
    let lastHttpErrText = "";
    let lastHttpStatus = 0;
    let lastChoiceError = "";
    const tried = [];

    for (const modelId of models) {
      tried.push(modelId);
      // Primary: no structured output
      let orResponse = await postOpenRouter(
        buildBody(modelId, useJsonMode)
      );
      if (!orResponse.ok && (orResponse.status === 400 || orResponse.status === 422) && !useJsonMode) {
        orResponse = await postOpenRouter(buildBody(modelId, true));
      }

      if (!orResponse.ok) {
        const errText = await orResponse.text();
        lastHttpErrText = errText;
        lastHttpStatus = orResponse.status;
        if (orResponse.status === 401 || orResponse.status === 402 || orResponse.status === 403) {
          const outStatus =
            orResponse.status === 403 ? 403 : orResponse.status === 402 ? 402 : 401;
          return res.status(outStatus).json({
            error: "OpenRouter rejected the request",
            message: openRouterErrorMessage(errText),
            body: errText.slice(0, 2000),
          });
        }
        if (orResponse.status === 429) {
          return res.status(429).json({
            error: "rate_limit",
            code: "OPENROUTER_RATE_LIMIT",
            // Never surface generic provider strings as the only UX — the UI shows a full explanation
            message:
              "The free OpenRouter limit was reached (requests per minute or per day). Wait a few minutes, refresh the page, and try again.",
            provider_debug: openRouterErrorMessage(errText).slice(0, 500),
          });
        }
        console.warn(
          `OpenRouter ${modelId} HTTP ${orResponse.status}: ${openRouterErrorMessage(errText).slice(0, 200)} — trying next…`
        );
        continue;
      }

      const orData = await orResponse.json();
      const choice0 = orData?.choices?.[0];

      if (choice0?.error) {
        const em = choice0.error?.message || "Provider model error";
        lastChoiceError = em;
        console.warn(
          `OpenRouter ${modelId} choice error, trying next: ${em.slice(0, 200)}`
        );
        continue;
      }
      if (choice0?.finish_reason === "error") {
        lastChoiceError = "finish_reason error";
        console.warn(`OpenRouter ${modelId} finish_reason=error, trying next…`);
        continue;
      }

      const content = choice0?.message?.content;
      if (typeof content !== "string" || !content.length) {
        lastChoiceError = "empty content";
        continue;
      }

      let rawJson;
      try {
        rawJson = parseModelJson(content);
      } catch (e) {
        lastChoiceError = e?.message || "json parse";
        console.warn(
          `OpenRouter ${modelId} bad JSON, trying next: ${(e && e.message) || e}`
        );
        continue;
      }

      const validated = giftResponseSchema.safeParse(rawJson);
      if (!validated.success) {
        const fe = formatZodError(validated.error);
        lastChoiceError = fe.message;
        console.warn(`OpenRouter ${modelId} Zod fail, trying next…`);
        continue;
      }

      return res.json(validated.data);
    }

    // All models failed
    const human =
      lastChoiceError ||
      (lastHttpErrText ? openRouterErrorMessage(lastHttpErrText) : "All free models failed");
    return res.status(502).json({
      error: "OpenRouter request failed",
      message: human,
      status: lastHttpStatus || undefined,
      body: (lastHttpErrText || "").slice(0, 2000),
      models_tried: tried,
    });
  } catch (err) {
    // AbortError: timeout; surface clearly for clients/retries
    const isAbort = err?.name === "AbortError" || err?.name === "TimeoutError";
    if (isAbort) {
      return res.status(504).json({
        error: "OpenRouter request timed out",
        message: `No response within ${OPENROUTER_TIMEOUT_MS}ms`,
      });
    }
    console.error("gift-finder error:", err);
    // Never leak stack traces to clients in production
    return res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" && err instanceof Error ? err.message : "An unexpected error occurred",
    });
  }
});

export default router;
