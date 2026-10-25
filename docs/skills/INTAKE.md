# Intake + Research skill (`gtm-intake`)

The first GTMagic skill. It interviews a small-business owner, researches their market between questions, and loops until the go-to-market hypothesis is sharp enough to build synthetic customers from. It hands off one JSON file, the **Intake Brief** (the owner sees it as "your GTMagic save file"), plus a readable summary, `brief.md`.

> **Status:** design spec v1.1, 2026-10-25. Revised after a devil's-advocate review and a GPT cross-check. **Today** marks the hackathon slice; the full version is the target after the event.

## Principles

1. **Code computes every number.** The model tags evidence; a bundled script counts, weights and validates. The model never types a count, a percentage or a weight that a script could compute.
2. **Evidence is built from tool results or the owner's files,** never written freehand. Each quote is verbatim, ≤ 25 words, and has personal details removed.
3. **"No supported segment yet" is a valid result.** Nothing pressures the skill to bless a segment.
4. **Every claim traces to evidence** through `findings[]`: observed, estimated or inferred, with its derivation.

## Where it runs

| Surface | How the owner gets it | Research | Files |
|---|---|---|---|
| **Claude chat** (Claude.ai / desktop) | Adds the downloaded skill; needs web search and code execution turned on (install guide: TODO) | Inline, in one capped research turn | Uploads in, downloads out. **Not stored by GTMagic** (Claude itself processes the uploads) |
| **Claude Code** | Clones the repo; the skill lives at `.claude/skills/gtm-intake/` | Same, and can run the skeptic pass separately | `gtm-workspace/<business-slug>/` (gitignored) |
| **Hosted web agent** (later, behind a paywall) | Our site | Same skill, server-side | Per account |

## Inputs

| Input | Today | Full version | What we extract |
|---|---|---|---|
| One-line description | ✅ | ✅ | Frozen first, for the baseline |
| Conversation answers | ✅ | ✅ | The question bank |
| Website URL | ✅ | ✅ | Current headline (tested later as the control), pricing, claims |
| Prior ad results | One **Meta CSV** | CSV/XLSX from Meta, Google, Reddit; screenshots | `PriorExperiment`s, campaign level only; customer names and emails are never kept |
| Pasted customer language | ✅ | ✅ | Founder-text evidence for the lexicon |
| Decks, guardrail docs | — | ✅ | Product facts, locked claim and targeting rules |
| A previous save file | — (deferred) | ✅ resume | Picks up at the first failing readiness check |

## Session flow (same sitting)

```
1. One-liner      owner describes the business in one line
2. Baseline       FROZEN NOW, before reading anything else: a fixed prompt (prompts/baseline.md)
                  produces plain-Claude ICPs + taglines, the "before." Optional for real owners
3. Pre-read       website + uploads → draft facts, each flagged "please confirm"
4. Session 1      2–3 rounds of 2–4 questions (~15 min)
5. Research turn  one capped turn (Today ≤ 15 searches/fetches · full ≤ 40). Each result is appended
                  to research-log.jsonl as it lands, so context loss can't erase evidence
6. Session 2      findings vs hypotheses, the skeptic's counter-case, one pushback per locked
                  constraint, owner ranks segments (~15 min)
7. Validate       scripts/validate_intake.py computes counts and checks references → readiness
8. Handoff        intake.json + brief.md (generated from the JSON; the page the demo shows)
```

**Send-back:** when research finds the target crowded or vague, the skill asks a specific narrowing question with the evidence. For example: "Five well-rated apps already target GLP-1 fitness. Is your user mainly protecting muscle, or mainly losing weight?"

## Interview rules

1. **Buckets:** every targeting fact is *locked*, *preference*, *hypothesis* (with "wrong if" and confidence 1–5), or *unknown*.
2. **Vagueness check:** an answer with no number, no named group or place, and no observable behavior gets one concrete follow-up. Still vague → hypothesis at confidence 1, plus a research question.
3. **"I don't know"** becomes an *unknown*, never a blocker.
4. **Locked constraints:**
   - **One pushback:** research may challenge a locked constraint once, citing evidence.
   - **Then gospel:** if the owner keeps it, it stands and is never raised again.
5. **Converge:** one primary hypothesis + up to 2 alternates, each in this form:
   > **[segment]** will **[buy | switch]** because **[motivation]**, instead of **[current alternative]**, at **[price]**.
6. **Plain words with the owner:** "customer group," not "segment"; "must-haves," not "locked." No ICP jargon on screen.
7. **Questions asked today:** geography, age, price, channel, health/regulatory limits, interests. Every other dimension defaults to *unknown* without asking (full version: all dimensions).

## Sensitive topics (health conditions such as GLP-1 use)

- **Two separate fields:**
  - `researchDefinition` may name the condition; the customers are synthetic, so research can study the group.
  - `targetableProxies` never names it, and never infers anyone's health status at the person level.
- **Proxies are research leads, not ad targeting.** Each proxy is labeled "verify the ad platform's policy before using it for targeting."
- **Messaging check:** no line assumes the reader's condition ("Are you on Ozempic?"), no medical claims, and no drug brand names unless the owner has permission to use them.
- **Demo video:** no health-related quotes shown next to their source links.

## Research protocol

**Sources (today):** competitor sites, app-store reviews, Reddit/forums, public statistics and surveys. (Full version adds Google Trends, YouTube, Yelp/Google reviews.) Before relying on Reddit and app-store pages, test that they can be fetched from Claude chat.

**Weighing evidence.** Each record carries a `sourceType`, `sampleSize`, `confidence` and `limitations`. As a rule of thumb:
- **Large official surveys:** high confidence.
- **Aggregate ratings:** medium.
- **A single post:** low. It counts toward themes, but never stands alone as a claim.
- **First-party ad results** outrank outside data only when conclusive. A $50 test doesn't beat a CDC survey.

**Prior ad results:** the verdict is computed by the script against the owner's target CPA. It's `inconclusive` below 100 clicks or 10 conversions, or when no target was given.

**Serviceability** (a reasoned judgment with a confidence, never a formula). The judgment weighs separate indicators, each cited:
- **Incumbents:** name, rating, review count.
- **Unresolved concerns:** themes that incumbents' reviews show go unaddressed.
- **Switching or quitting language:** evidence IDs.
- **Size:** `customersNeeded = revenueGoal ÷ (price × purchasesPerYear)`; `minPopulation = customersNeeded ÷ adoptionRate` (default 1%, stated). The script computes both.
- **Motivation:** why this person buys now (trigger + job to be done).

Verdict: `serviceable` · `marginal` · `not-serviceable` · `insufficient-evidence`.

**Interest overlaps:**
- **Groups:** up to 5 interest groups (today: up to 3).
- **Deep dive:** today, only the one overlap that matters, shown as a **low–high range** labeled *estimate* with its logic. Public sources almost never publish joint numbers; overlaps are inferred from each group's demographics.
- **Use:** overlaps inform segment attribute weights. They aren't a joint distribution for sampling.

**Concern mining:**
- **Concerns:** stable IDs and one-line definitions.
- **Tagging:** each evidence excerpt is tagged with segment and concern IDs.
- **Counting:** the script counts how often each concern appears and which appear together. Bundles = observed co-occurring sets with their counts.
- **Target:** today, 10–15 real excerpts per target segment (full version: 30). Below 10 → `confidence: "low"`.

**Skeptic pass:** one structured counter-case per key claim. It logs the disconfirming queries it ran, then reports either the unresolved challenge or "found nothing against X after queries A, B." In Claude Code it can run separately to avoid rubber-stamping.

## Readiness

`readiness.status` is one of:
- **`ready`:** every check below passes.
- **`no-supported-segment`:** an honest, useful result; handed off with a warning.
- **`needs-more`:** goes back into the loop as specific questions or research tasks.

Checks:
- [ ] ICP sentence + ≥ 3 must-haves + ≥ 1 disqualifier (or null with `no-supported-segment`)
- [ ] Today's dimensions sorted into buckets; no *unknown* on geography or price
- [ ] Primary hypothesis in the agreed form, with "wrong if"
- [ ] Today: 1 primary + 1 alternative segment, each with a verdict
- [ ] Concern themes per target segment, with counts and confidence from the script
- [ ] 3–5 rough messaging lines using real customer phrases, passing the messaging check
- [ ] Every finding marked observed / estimated / inferred, with evidence; skeptic pass logged
- [ ] The script passes; the owner has confirmed

## Handoff: `intake.json` (schema v1)

```ts
type Bucket = "locked" | "preference" | "hypothesis" | "unknown";
type Confidence = "low" | "medium" | "high";
type CoreAttribute = "role" | "currentSolution" | "priceSensitivity" | "urgency" | "skepticism" | "buyingStage";

interface IntakeBrief {
  schemaVersion: 1;
  mode: "live" | "demo";
  business: { name: string; description: string; websiteUrl?: string; stage: "idea" | "launched" | "established";
              pricing?: { amount: number; currency: string; period: "one-time" | "month" | "year"; purchasesPerYear: number };
              revenueGoal12mo?: number; targetCpa?: number };            // same currency as pricing
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
  sampleShare?: number;                 // share of the synthetic audience; default = equal across segments
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
  metrics: { impressions?: number; clicks?: number; conversions?: number };   // CTR/CPC/CPA computed by the script
  verdict: "worked" | "didnt-work" | "inconclusive";                         // script-computed vs targetCpa
  sourceFile: string;
}
```

**The simulation skill reads:** `segments[]` (sampleShare, attributes, needs, barriers, decisionCriteria, concernBundles), `lexicon` (voice), and `constraints` with `appliesTo` targeting or messaging (guardrails). Sampling settings (seed, audience size, version) belong to the simulation skill. This replaces INTAKE + RESEARCH and the `MarketModel` in [CONTRACTS.md](../CONTRACTS.md); that doc gets updated at integration.

## Skill layout (built after "go")

```
.claude/skills/gtm-intake/          zipped as-is for Claude chat
  SKILL.md                          the interview and loop instructions
  prompts/baseline.md               the fixed baseline prompt (versioned)
  references/question-bank.md
  references/schema.md              this schema
  scripts/validate_intake.py        counts, weights, size math, ad verdicts, reference + verbatim checks
```

## Today's demo plan

1. **By ~1:30:** a hand-checked `fixtures/demo/intake.json` for a fictional GLP-1 strength-training app, so the simulation skill can build against it.
2. **`fixtures/demo/intake-script.md`:** the fictional owner's answers, plus `fixtures/demo/meta-ads.csv`, clearly labeled fictional.
3. **The video shows a cached, inspectable run** (`mode: "demo"`). A live run is a bonus, not a dependency.
