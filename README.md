# MumzGift AI 🎁

## What It Does

MumzGift AI is a small full-stack app for **Mumzworld-style** mom and baby gifting. You type a natural request (for example, a budget and the baby’s age), and a **large language model** returns a **short, structured** list of gift ideas with **English and Arabic** explanations and **confidence scores**. The API **validates every model response with Zod** so the UI never silently shows broken JSON, and the system is instructed to stay **honest** on unclear, empty, or out-of-domain requests (pets, general electronics, gibberish).

## Demo

Watch the 5-minute walkthrough: https://www.loom.com/share/da058f4a589a41f68717b2c7f1212795

Paste any prompt below into the search box at http://localhost:3000 (after `npm run dev`) and click **Find Gifts**. The video walks through these same **five samples**; prompt **#5** is intentionally **out of scope** (pets aren’t mum/baby gifting) so you can see an honest refusal, not fake product picks.

1. `Thoughtful gift for a friend with a 6-month-old, under 200 AED`
2. `Birthday gift for a 2-year-old girl, around 150 AED`
3. `Gift for pregnant friend, no budget limit`
4. `Gift for a newborn baby under 100 AED`
5. `Gift for my cat` — **expected:** **out of scope** (pets aren’t mum/baby gifting). The model should **refuse** honestly (`out_of_scope: true`, empty recommendations), not return a pretend “baby” list.

## Setup & Run (Under 5 Minutes)

1. **Prerequisites:** [Node.js](https://nodejs.org/) 18+ and npm. An [OpenRouter](https://openrouter.ai/) account and API key (free tier includes `meta-llama/llama-3.3-70b-instruct:free`).

2. **Clone and enter the project** (or unzip `mumzgift-ai`).

   ```bash
   cd mumzgift-ai
   ```

3. **Install dependencies** (workspaces install backend and frontend together):

   ```bash
   npm install
   ```

4. **One-command sanity check (no API key, no network to OpenRouter):** validates `evals/testCases.json`, the Zod schema, and a production Vite build.

   ```bash
   npm run check
   ```

5. **Environment:** Copy the example env file and add your key.

   ```bash
   copy backend\.env.example backend\.env
   ```

   On macOS/Linux use `cp backend/.env.example backend/.env`. Edit `backend/.env` and set:

   - `OPENROUTER_API_KEY` = your key from OpenRouter  
   - `PORT=3001` (optional; default is 3001)  
   - Optional: `CORS_ORIGIN` (if the UI is not on `http://localhost:3000`), `OPENROUTER_TIMEOUT_MS` (max wait for the model, default 120000)

6. **Start backend and frontend** in one terminal from the repo root:

   ```bash
   npm run dev
   ```

   This runs the API on **http://localhost:3001** and the React app (Vite) on **http://localhost:3000**.  
   Or run them separately: `npm run dev:backend` and `npm run dev:frontend`.

7. **First output:** Open http://localhost:3000, try a prompt from **Demo** (above), click **Find Gifts**, and you should see up to three cards (if the model and validation succeed).

**Optional:** Set `VITE_API_BASE` in a `frontend/.env` file if the API is not on `http://localhost:3001` (e.g. deployed URL). Set `CORS_ORIGIN` in `backend/.env` to your live site origin (comma-separated if several). Use `GET /api/health` for uptime checks. Set `TRUST_PROXY=1` when the API runs behind a reverse proxy. See `backend/.env.example`.

**Port already in use (`EADDRINUSE` on 3000 or 3001):** Another dev server is still running. From the repo root run `npm run free-ports` (stops whatever is listening on 3000/3001), or close the old terminal and end the `node` processes in Task Manager, then `npm run dev` again.

## Architecture

**How the prompt is structured**  
A single **system** prompt ([`backend/prompts/systemPrompt.js`](backend/prompts/systemPrompt.js)) defines Mumzworld’s domain, the exact **JSON** shape, rules for out-of-scope queries, **budget respect**, max **3** items, **native Arabic** (not literal translation), and **confidence** bands. The user message is the raw `query` string. The backend **avoids** `response_format: json_object` by default (many free providers return *Provider returned error* for it) and **cycles through several free models** (see `OPENROUTER_MODELS` in `.env`) until one returns valid JSON, then **Zod-validates** it. You can set `OPENROUTER_USE_JSON_MODE=1` if you use a model that needs structured output.

**Why structured JSON output**  
The UI and tests need **predictable fields** (names, prices, flags). Free-form text would complicate the React app and make automated checks impossible. JSON also lets the backend **parse once** and then **validate**, instead of hoping for prose.

**How Zod validation works**  
The model’s message content is `JSON.parse`d, then checked with [`backend/validators/giftSchema.js`](backend/validators/giftSchema.js). If parsing or validation fails, the API responds with **4xx/502** and an explicit **`fields`** list—no “half-broken” payloads to the client. A **superrefine** enforces: when `out_of_scope` is `true`, `recommendations` must be `[]` and `overall_confidence` must be `0`.

**Uncertainty and out-of-scope**  
The prompt tells the model to set `out_of_scope: true` for non mom/baby/pregnancy/gifting queries, to use **`query_understood: false`** with a reason when input is nonsense, and to keep **confidence low** when details are missing. The backend does not “fix” dishonest answers; it only guarantees **shape** and type safety. **Empty `query`** is rejected **before** the LLM (HTTP 400).

**Why OpenRouter + Llama 3.3 70B**  
[OpenRouter](https://openrouter.ai/) provides one HTTP API to many models, including a **free** `meta-llama/llama-3.3-70b-instruct:free` endpoint suitable for a take-home. **Llama 3.3 70B Instruct** is strong enough for **English + Arabic** in one response and for following JSON instructions, while keeping cost at zero for evaluation.

## Evals

**Rubric (how to score each case)**  
For each row in `evals/testCases.json`, mark **pass: true** only if the **observed** API JSON matches the **expected_behavior** for that row (allow small variance in wording, but not in safety rules: no invented certainty on gibberish, no out-of-domain “helpful” lists for laptops/pets, budget caps respected when prices are present). If the call fails with 422/502, note whether it was a **model quirk** vs **app bug** (Zod is strict on purpose). **Empty string** to the API should be **400** from the server without calling the model.

| ID | Input (summary) | Pass |
|----|------------------|------|
| 1 | Newborn, under 100 AED | ✅ |
| 2 | 6-month-old friend, under 200 AED | ✅ |
| 3 | 2-year-old birthday ~150 AED | ✅ |
| 4 | Pregnant friend, no budget | ✅ |
| 5 | Baby shower under 300 AED | ✅ |
| 6 | 1-year-old + music | ✅ |
| 7 | Gift for cat | ✅ |
| 8 | Laptop 5000 AED | ✅ |
| 9 | Gibberish | ✅ |
| 10 | Single word “gift” | ✅ |
| 11 | Baby under 5 AED | ✅ |
| 12 | Empty string | ✅ |

**Overall score:** 12 / 12 — 100% ✅

**Honest failure modes**  
- **JSON shape drift:** The free model can occasionally return extra/missing keys or bad types → **HTTP 422**; fix by prompt iteration or a repair step (not in scope here).  
- **Hallucination:** Zod does not check factual truth; only **instructs** the model. Bad product claims still need human or catalog grounding in production.  
- **Rate limits / downtime:** OpenRouter or the free model can throttle or error → **502**; retry or swap model.  
- **Strict out_of_scope co-constraints:** If the model sets `out_of_scope: true` but adds recommendations, validation fails (by design).

## Tradeoffs

**Why a Gift Finder**  
It shows **end-to-end** skills: **prompting**, **structured output**, **validation**, a **real UI**, and **honesty** on edge cases—fits an **AI engineering intern** profile better than a pure CRUD demo.

**What was cut from scope**  
Real **Mumzworld catalog** search, **auth**, **persistence**, **A/B eval harness**, and **i18n** for the whole UI (only the model output is bilingual). Shipped a **dev-only** CORS origin.

**What would be built next**  
**Product index** (embeddings or browse API) so recommendations are **grounded in SKUs**; user sessions; **Arabic** UI strings; **eval runner** that calls `/api/gift-finder` and updates `testCases.json`; **observability** and retries for OpenRouter.

**Known limitations**  
Price **estimates** are not live prices. **Brands** are generic on purpose. **Free** model availability can change on OpenRouter.

## Tooling

- **OpenRouter API** — Gateway for LLM calls; one key, many models.  
- **Llama 3.3 70B Instruct** — Chosen for **free** access and **multilingual** (EN+AR) quality on a take-home.  
- **Cursor** — Used to scaffold, iterate prompts, and keep the stack simple.  
- **Zod** — **Strict** schema validation so malformed model output is **explicitly** rejected.  
- **React + Vite + Node/Express** — Fast to run locally; familiar **MERN-style** split.  
- **`npm run check`** — Eval file + Zod smoke test + production build in one command (no OpenRouter call).  
- **`npm run dev`** — Uses [`scripts/dev.mjs`](scripts/dev.mjs) to start API + Vite in parallel (avoids Windows `spawn cmd.exe ENOENT` when `concurrently` cannot find `cmd.exe` in some IDE terminals).
