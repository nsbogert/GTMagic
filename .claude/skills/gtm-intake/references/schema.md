# Intake Brief schema (`intake.json`, schema v1)

This is the schema's single source of truth (spec v1.1; `docs/skills/INTAKE.md` links here).

```ts
type Bucket = "locked" | "preference" | "hypothesis" | "unknown";
type Confidence = "low" | "medium" | "high";
type CoreAttribute = "role" | "currentSolution" | "priceSensitivity" | "urgency" | "skepticism" | "buyingStage";

interface IntakeBrief {
  schemaVersion: 1;
  mode: "live" | "demo";
  business: { name: string; description: string; websiteUrl?: string; stage: "idea" | "launched" | "established";
              pricing?: { amount: number; currency: string; period: "one-time" | "month" | "year"; purchasesPerYear: number };
              revenueGoal12mo?: number;          // minimum revenue needed in a year to sustain or grow the business
              targetCpa?: number;                // owner-stated max cost per paying sign-up; omit if they don't know
              costToServeShare?: number;         // 0–1, owner-confirmed share of a customer's revenue spent serving them; sets the break-even
              acquisitionShare?: number;         // 0–1, owner-confirmed share of first-year revenue they'll spend to win a customer
              unitEconomics?: { annualRevenuePerCustomer: number | null; maxCac: number | null; breakEvenCac: number | null;
                               firstYearMarginShare: number | null; firstYearMargin: number | null;
                               targetCpaUsed: number | null; targetCpaSource: "owner" | "derived" | "none" } };  // script-computed
                                                 // money fields use the same currency as pricing
  baseline: { ownerFirstDescription: string; promptVersion: string; icps: string[]; taglines: string[]; frozenAt: string };
  priorExperiments: PriorExperiment[];
  constraints: Constraint[];
  interests: InterestGroup[];                                             // ≤ 5 (today ≤ 3)
  overlaps: InterestOverlap[];
  hypotheses: Hypothesis[];                                               // 1 primary + ≤ 2 alternates
  concerns: Array<{ id: string; label: string; definition: string }>;     // con_
  segments: Segment[];
  icp: { statement: string; mustHaves: string[]; disqualifiers: string[]; segmentId: string } | null;
  roughMessaging: Array<{ angle: string; headline: string; subheadline: string; segmentId: string; lexiconIds: string[] }>;
  lexicon: Array<{ id: string; phrase: string; segmentIds: string[]; evidenceId: string }>;   // phrase verbatim in the excerpt
  evidence: Evidence[];
  findings: Finding[];
  skeptic: Array<{ claim: string; queries: string[]; result: "unresolved" | "resolved" | "nothing-found"; evidenceIds: string[] }>;
  readiness: { status: "ready" | "no-supported-segment" | "needs-more"; checks: Array<{ check: string; pass: boolean; note?: string }> };
  openQuestions: string[];
}

interface Evidence {                    // from tool results or owner files only
  id: string;                           // ev_
  origin: "web" | "owner-file" | "owner-text";
  sourceType: "first-party" | "official-stats" | "survey" | "news-report" | "review-aggregate" | "review" | "forum-post" | "competitor-site";
  url?: string; title?: string;
  excerpt: string;                      // verbatim, ≤ 25 words, personal details removed
  sampleSize?: number;                  // survey n, review count, ad clicks
  segmentIds: string[]; concernIds: string[];      // tags the script counts
  confidence: Confidence; limitations?: string; retrievedAt: string;
}

interface Finding {
  id: string; claim: string; segmentId?: string;
  kind: "observed" | "estimated" | "inferred";
  derivation: string;                   // the calculation or reasoning from evidence to claim
  evidenceIds: string[]; confidence: Confidence; limitations?: string;
}

interface Constraint {
  dimension: "geography" | "age" | "sex" | "income" | "lifeStage" | "healthCondition" | "audienceType"
           | "price" | "channel" | "language" | "regulatory" | "ethics" | "interest";
  bucket: Bucket;
  rule: { op: "include" | "exclude" | "range"; values?: string[]; min?: number; max?: number };  // e.g. range 35–54; include ["US-WA"]
  appliesTo: "research" | "targeting" | "messaging" | "all";
  source: "stated" | "website" | "file" | "inferred";
  pushback?: { evidenceIds: string[]; ownerKept: boolean };   // at most one, ever
}

interface Hypothesis {
  id: string; kind: "primary" | "alternate";
  segment: string; action: "buy" | "switch"; motivation: string; insteadOf: string; price: string;
  wrongIf: string; confidence: 1 | 2 | 3 | 4 | 5;
  status: "untested" | "supported" | "weakened" | "refuted"; evidenceIds: string[];
}

interface InterestGroup {
  id: string; name: string;
  researchDefinition: string;           // may name a health condition (research only)
  targetableProxies: string[];          // never names a condition; "verify platform policy before use"
  demographics: Array<{ attribute: string; distribution: Array<{ value: string; share: number }>;
                        evidenceIds: string[]; isEstimate: boolean; logic?: string }>;
}

interface InterestOverlap {
  groupIds: [string, string];
  summary: string;
  strongest: Array<{ attribute: string; value: string; shareLow: number; shareHigh: number }>;
  isEstimate: boolean; logic: string; evidenceIds: string[];
}

interface Segment {
  id: string; name: string; description: string; isOwnerGuess: boolean; ownerRank?: number;
  sampleShare?: number;                 // share of the synthetic audience; default = equal; rough relative numbers are fine (script normalizes)
  attributes: Array<{ name: CoreAttribute | string; values: Array<{ value: string; weight: number }> }>;
                                        // all 6 CoreAttributes required; locks already applied; weights normalized by the script
  needs: string[]; barriers: string[]; decisionCriteria: string[];
  channels: string[];                   // where they gather and could be reached
  concernBundles: Array<{ concernIds: string[]; observedCount: number; weight: number; confidence: Confidence }>;  // script-computed
  serviceability: {
    incumbents: Array<{ name: string; rating?: number; reviewCount?: number; evidenceIds: string[] }>;
    unresolvedConcernIds: string[]; switchingEvidenceIds: string[];
    size: { population: number | null; isEstimate: boolean; logic: string; evidenceIds: string[] };
    sizeMath: { customersNeeded: number; adoptionRate: number; minPopulation: number };   // script-computed
    motivation: string;
    verdict: "serviceable" | "marginal" | "not-serviceable" | "insufficient-evidence";
    confidence: Confidence; reasoning: string;
  };
}

interface PriorExperiment {
  id: string;                           // px_
  channel: "meta" | "google" | "reddit" | "tiktok" | "email" | "other";
  hypothesis?: string; audience: string;
  message: { headline?: string; body?: string };
  spend?: number;
  metrics: { impressions?: number; clicks?: number; conversions?: number };   // cost per sign-up is computed by the script
                                        // "sign-ups" in an ad export may be free trials, not paying customers: ask the owner which
  verdict: "worked" | "didnt-work" | "inconclusive";                         // script-computed vs unitEconomics.targetCpaUsed
  verdictReason?: string;                                                    // script-computed: why, in plain words
  sourceFile: string;
}
```

## Who writes each field

- **Script:** `scripts/validate_intake.py --write` computes it. You leave a placeholder and never type the value.
- **Model:** you write it, but only from evidence (tool results, the owner's text and files) and the rules in SKILL.md.
- **Owner:** you draft it, the owner confirms it in plain words, and you record what they said.

| Field | Written by | Notes |
|---|---|---|
| `segments[].concernBundles` | Script | Leave `[]`. Counts and weights come from evidence tags. |
| `segments[].serviceability.sizeMath` | Script | Leave zeros. Uses `revenueGoal12mo` (the minimum revenue needed in a year), `pricing`, adoption rate (default 0.01). |
| `business.unitEconomics` | Script | Leave it out. `annualRevenuePerCustomer` = price × purchases per year; `breakEvenCac` = that × (1 − `costToServeShare`), the most a new customer can cost before year one loses money; `maxCac` = that × `acquisitionShare`; `firstYearMarginShare` = 1 − `costToServeShare` − `acquisitionShare` (and `firstYearMargin` in dollars; the script warns at zero or below); `targetCpaUsed` = the owner's `targetCpa` if stated, else `maxCac`, with `targetCpaSource` saying which. Nulls where an input is missing; never a default. |
| `priorExperiments[].verdict`, `verdictReason` | Script | Leave `"inconclusive"`. Judged against `unitEconomics.targetCpaUsed`; the reason says why. Ask the owner whether ad "sign-ups" are free trials or paying customers. |
| `segments[].attributes[].values[].weight` | Script normalizes | You give rough relative weights; the script makes them sum to 1. |
| `segments[].sampleShare` | Model (rough) + script normalizes | Default equal across segments. You may set rough relative numbers from the owner's ranking (e.g. 7 and 3); the script normalizes them. |
| `readiness.checks` | Script + model | The script fills the checks it can compute; you add the rest (including owner confirmation). |
| `readiness.status` | Script | Set from all checks. Never `ready` while a check fails or before the owner's confirmation is recorded. |
| `baseline` | Fixed prompt | Frozen in step 2 from `prompts/baseline.md`; never edited. |
| `business.*` (name, description, stage, pricing, `revenueGoal12mo`, `websiteUrl`) | Owner | Drafted from the pre-read, marked "please confirm". |
| `business.targetCpa` | Owner | Only when the owner states a number. Never derived or guessed. |
| `business.costToServeShare`, `acquisitionShare` | Owner | From the cost-per-sign-up walk-through, confirmed as fractions. Ask cost to serve first (help the owner estimate it from their own cost lines); it sets the break-even. Then the owner picks `acquisitionShare` knowing the break-even. Never suggest a benchmark share. |
| `constraints[]` (bucket, rule, `pushback.ownerKept`) | Owner | You sort answers into buckets; the owner confirms must-haves and decides on pushback. A `hypothesis`-bucket constraint carries no "wrong if" or confidence; those live on `hypotheses[]`. |
| `segments[].ownerRank`, `isOwnerGuess` | Owner | Ranked in session 2. |
| `hypotheses[]` wording | Owner | Converged with the owner; `status` and `evidenceIds` are model-written from research. |
| `icp` | Owner | Final statement confirmed at handoff; `null` with `no-supported-segment`. |
| `priorExperiments[]` metrics, `message`, `audience`, `spend` | Owner file | Copied from the upload, campaign level only. |
| `evidence[]` | Model (copied) | From the research log or the owner's text and files only. Excerpts verbatim, at most 25 words, personal details removed. |
| `lexicon[]` | Model (copied) | Each `phrase` appears word for word in its evidence excerpt. |
| `concerns[]`, evidence `segmentIds` / `concernIds` tags | Model | Stable IDs; the script does the counting. |
| `findings[]`, `skeptic[]` | Model | Every claim cites evidence; skeptic queries match the log. |
| `interests[]`, `overlaps[]` | Model | Estimates marked `isEstimate` with `logic`; proxies never name a condition. |
| `segments[]` descriptions, needs, barriers, criteria, channels, other attributes | Model | From evidence and owner answers. |
| `serviceability` (incumbents, unresolved concerns, switching evidence, size, motivation, verdict, confidence, reasoning) | Model | Incumbent ratings copied from sources; verdict written after the script fills `sizeMath`. |
| `roughMessaging[]` | Model | Uses `lexiconIds`; passes the messaging check. |
| `openQuestions[]` | Model | Unresolved unknowns and research tasks. |
| `schemaVersion`, `mode` | Model | `1`; `"demo"` only in demo mode. |
