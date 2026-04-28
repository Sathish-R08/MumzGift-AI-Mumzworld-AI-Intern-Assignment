import { z } from "zod";

/** Single product recommendation from the model — types must match the API contract. */
const recommendationSchema = z.object({
  product_name_en: z.string().min(1, "recommendations[].product_name_en must be a non-empty string"),
  product_name_ar: z.string().min(1, "recommendations[].product_name_ar must be a non-empty string"),
  reason_en: z.string().min(1, "recommendations[].reason_en must be a non-empty string"),
  reason_ar: z.string().min(1, "recommendations[].reason_ar must be a non-empty string"),
  estimated_price_aed: z.number().nonnegative("recommendations[].estimated_price_aed must be a non-negative number"),
  age_appropriate: z.boolean(),
  confidence: z
    .number()
    .min(0, "recommendations[].confidence must be between 0 and 1")
    .max(1, "recommendations[].confidence must be between 0 and 1"),
});

/**
 * Full response shape for POST /api/gift-finder.
 * superrefine enforces: out_of_scope => empty recs, zero overall confidence, etc.
 */
export const giftResponseSchema = z
  .object({
    query_understood: z.boolean(),
    reason_if_not_understood: z.string().nullable(),
    recipient: z.string().nullable(),
    age_months: z.number().nonnegative().nullable(),
    budget_aed: z.number().nonnegative().nullable(),
    occasion: z.string().nullable(),
    recommendations: z
      .array(recommendationSchema)
      .max(3, "recommendations must have at most 3 items"),
    overall_confidence: z
      .number()
      .min(0, "overall_confidence must be between 0 and 1")
      .max(1, "overall_confidence must be between 0 and 1"),
    out_of_scope: z.boolean(),
    out_of_scope_reason: z.string().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.out_of_scope) {
      if (data.recommendations.length !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "When out_of_scope is true, recommendations must be an empty array",
          path: ["recommendations"],
        });
      }
      if (data.overall_confidence !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "When out_of_scope is true, overall_confidence must be 0",
          path: ["overall_confidence"],
        });
      }
    }
  });

/**
 * Formats Zod errors so the API never returns a silent failure.
 * @param {z.ZodError} error
 * @returns {{ message: string, fields: { path: string, message: string }[] }}
 */
export function formatZodError(error) {
  const fields = error.issues.map((e) => ({
    path: e.path.length ? e.path.join(".") : "root",
    message: e.message,
  }));
  const message = fields.map((f) => `${f.path}: ${f.message}`).join("; ");
  return { message, fields };
}
