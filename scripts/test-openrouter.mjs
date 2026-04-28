/**
 * One minimal OpenRouter call using backend/.env — proves the key, network, and limits.
 * Run from repo root: npm run test:openrouter
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", "backend", ".env");

if (!existsSync(envPath)) {
  console.error("Missing backend/.env — copy from backend/.env.example and set OPENROUTER_API_KEY");
  process.exit(1);
}

let apiKey;
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  const v = t
    .slice(eq + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (k === "OPENROUTER_API_KEY") {
    apiKey = v;
    break;
  }
}

if (!apiKey) {
  console.error("No OPENROUTER_API_KEY in backend/.env");
  process.exit(1);
}

console.log("Using key starting with:", apiKey.slice(0, 15) + "…" + " (len=" + apiKey.length + ")");
if (apiKey.length < 20) {
  console.error("Key looks too short — check for quotes or a broken .env line.");
  process.exit(1);
}

const body = {
  model: "openrouter/free",
  messages: [{ role: "user", content: "Reply with exactly: ok" }],
  max_tokens: 8,
  temperature: 0,
};

const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "MumzGift test",
  },
  body: JSON.stringify(body),
});

const text = await r.text();
console.log("\nHTTP status:", r.status, r.statusText);
if (r.status === 200) {
  try {
    const j = JSON.parse(text);
    const c = j?.choices?.[0]?.message?.content;
    const m = j?.model;
    console.log("Model used:", m);
    console.log("Reply snippet:", (c || "(empty)").slice(0, 200));
    console.log("\nIf you see 200 and a reply, OpenRouter is OK. Refresh OpenRouter key page — Last used should update soon.");
  } catch {
    console.log("Body (raw):", text.slice(0, 800));
  }
} else {
  try {
    const j = JSON.parse(text);
    console.log("Error JSON:", JSON.stringify(j, null, 2).slice(0, 2000));
  } catch {
    console.log("Body (raw):", text.slice(0, 2000));
  }
  if (r.status === 429) {
    console.log(
      "\n429 = rate limit. Wait 15–60 min or next day, add a few $ credits, or use a new OpenRouter key."
    );
  }
  if (r.status === 401) {
    console.log("\n401 = key wrong or revoked. Create a new key on OpenRouter and replace backend/.env");
  }
}
process.exit(r.status === 200 ? 0 : 1);
