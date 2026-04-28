/**
 * One-shot CI-style check: eval JSON shape, Zod schema smoke test, Vite build.
 * Exits 1 on any failure. No network (no API key) required.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function fail(msg) {
  console.error(`[check] FAIL: ${msg}`);
  process.exit(1);
}

// --- 1) evals/testCases.json: 12 cases, required keys
const evalPath = join(root, "evals", "testCases.json");
if (!existsSync(evalPath)) {
  fail(`Missing ${evalPath}`);
}
let evalCases;
try {
  evalCases = JSON.parse(readFileSync(evalPath, "utf8"));
} catch (e) {
  fail(`Invalid JSON in testCases.json: ${e?.message ?? e}`);
}
if (!Array.isArray(evalCases) || evalCases.length !== 12) {
  fail(`testCases.json must be an array of length 12, got ${Array.isArray(evalCases) ? evalCases.length : typeof evalCases}`);
}
const needKeys = ["id", "input", "description", "expected_behavior", "pass", "actual_output", "notes"];
for (let i = 0; i < evalCases.length; i++) {
  const c = evalCases[i];
  for (const k of needKeys) {
    if (!(k in c)) {
      fail(`testCases[${i}] missing key: ${k}`);
    }
  }
}
console.log("[check] evals/testCases.json: 12 cases OK");

// --- 1b) Node syntax: backend entry and route
for (const rel of ["backend/index.js", "backend/routes/giftFinder.js"]) {
  const p = join(root, rel);
  try {
    execSync(`node --check "${p}"`, { stdio: "pipe" });
  } catch {
    fail(`node --check failed: ${rel}`);
  }
}
console.log("[check] backend JS syntax OK");

// --- 2) Zod giftResponseSchema: import and validate a golden object
const schemaPath = join(root, "backend", "validators", "giftSchema.js");
if (!existsSync(schemaPath)) {
  fail("backend/validators/giftSchema.js not found");
}
const { giftResponseSchema } = await import(new URL(`../backend/validators/giftSchema.js`, import.meta.url).href);
const sample = {
  query_understood: true,
  reason_if_not_understood: null,
  recipient: "friend",
  age_months: 6,
  budget_aed: 200,
  occasion: null,
  recommendations: [
    {
      product_name_en: "Soft swaddle",
      product_name_ar: "لفاف قطني ناعم",
      reason_en: "Practical for sleep.",
      reason_ar: "عملي يساعد على النوم.",
      estimated_price_aed: 80,
      age_appropriate: true,
      confidence: 0.8,
    },
  ],
  overall_confidence: 0.75,
  out_of_scope: false,
  out_of_scope_reason: null,
};
const zr = giftResponseSchema.safeParse(sample);
if (!zr.success) {
  fail(`Zod sample validation: ${JSON.stringify(zr.error.issues, null, 2)}`);
}
const oosBad = giftResponseSchema.safeParse({
  ...sample,
  out_of_scope: true,
  out_of_scope_reason: "x",
  recommendations: [sample.recommendations[0]],
  overall_confidence: 0,
});
if (oosBad.success) {
  fail("Zod should reject out_of_scope with non-empty recommendations");
}
const oosGood = giftResponseSchema.safeParse({
  query_understood: true,
  reason_if_not_understood: null,
  recipient: null,
  age_months: null,
  budget_aed: null,
  occasion: null,
  recommendations: [],
  overall_confidence: 0,
  out_of_scope: true,
  out_of_scope_reason: "Out of domain",
});
if (!oosGood.success) {
  fail(`Valid OOS payload should parse: ${JSON.stringify(oosGood.error?.issues)}`);
}
console.log("[check] giftResponseSchema: golden + out_of_scope rules OK");

// --- 3) Vite production build
try {
  execSync("npm run build -w frontend", { cwd: root, stdio: "inherit", env: { ...process.env, CI: "1" } });
} catch {
  fail("npm run build -w frontend failed");
}
console.log("[check] frontend build OK");
console.log("[check] all checks passed — no errors");
