import { z } from "zod";

export const BriefSchema = z.object({
  description: z.string().min(1),
  businessName: z.string().optional(),
  websiteUrl: z.string().optional(),
  pricing: z.string().optional(),
  stage: z.enum(["idea", "launched", "established"]).optional(),
  idealCustomerGuess: z.string().optional(),
  currentMessage: z
    .object({ headline: z.string(), subheadline: z.string().optional() })
    .optional(),
  customerLanguage: z.string().optional(),
});
export type Brief = z.infer<typeof BriefSchema>;

export const CaseInputSchema = z.object({
  id: z.string(),
  note: z.string().optional(),
  brief: BriefSchema,
  blockedDomains: z.array(z.string()),
});
export type CaseInput = z.infer<typeof CaseInputSchema>;

export const RubricItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  groundTruth: z.string(),
  full: z.string(),
  partial: z.string(),
  sourceKeys: z.array(z.string()),
  confidence: z.enum(["public-site", "founder-confirmed", "inferred"]),
});
export type RubricItem = z.infer<typeof RubricItemSchema>;

export const AnswerKeySchema = z.object({
  id: z.string(),
  note: z.string().optional(),
  leakTerms: z.array(z.string()),
  sources: z.array(z.object({ key: z.string(), url: z.string() })),
  items: z.array(RubricItemSchema).min(1),
});
export type AnswerKey = z.infer<typeof AnswerKeySchema>;

export const VariantSchema = z.enum(["plain", "search", "import"]);
export type Variant = z.infer<typeof VariantSchema>;

export const RunRecordSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  variant: VariantSchema,
  /** Groups runs on the scoreboard, e.g. "plain · claude-opus-5-5" or "gtmagic". */
  label: z.string(),
  model: z.string().optional(),
  createdAt: z.string(),
  prompt: z.string().optional(),
  output: z.string(),
  citations: z.array(z.string()),
  inputTokens: z.number(),
  outputTokens: z.number(),
  durationMs: z.number(),
  warnings: z.array(z.string()),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

const Score = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type ItemScoreValue = z.infer<typeof Score>;

/** What the judge model must return. Code checks it before anything is trusted. */
export const JudgeDraftSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      score: Score,
      evidence: z.string(),
      reason: z.string(),
    }),
  ),
});
export type JudgeDraft = z.infer<typeof JudgeDraftSchema>;

export const ItemScoreSchema = z.object({
  id: z.string(),
  label: z.string(),
  judgeScore: Score,
  /** judgeScore, or 0 when the quoted evidence isn't found word for word in the output. */
  score: Score,
  evidence: z.string(),
  evidenceVerified: z.boolean(),
  reason: z.string(),
});
export type ItemScore = z.infer<typeof ItemScoreSchema>;

export const CrossCheckSchema = z.object({
  model: z.string(),
  items: z.array(z.object({ id: z.string(), expected: z.number() })),
  total: z.number(),
});
export type CrossCheck = z.infer<typeof CrossCheckSchema>;

export const ScoreRecordSchema = z.object({
  runId: z.string(),
  caseId: z.string(),
  label: z.string(),
  judgeModel: z.string(),
  scoredAt: z.string(),
  items: z.array(ItemScoreSchema),
  total: z.number(),
  judgeTotal: z.number(),
  max: z.number(),
  warnings: z.array(z.string()),
  /** Independent expected score from the decision model, when its key is available. */
  crossCheck: CrossCheckSchema.optional(),
});
export type ScoreRecord = z.infer<typeof ScoreRecordSchema>;
