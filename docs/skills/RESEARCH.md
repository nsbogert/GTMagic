# Research skill (`gtm-research`)

The second GTMagic skill. After intake, it goes out to the communities and products closest to the owner's customer groups, collects recent real quotes, sentiment and demographic signals, and keeps looping (with the owner in the loop) until the target market and ICP are well supported or honestly unsupported. It ends by handing back learnings, quotes and statistics, and one recommendation: **refine** specific things, **generate creatives**, or **evaluate an existing set of creatives**.

> **Status:** design spec v0.1, 2026-10-25, not yet reviewed. No code yet. **Today** marks the hackathon slice; **full** is the target after. Numbers quoted in this spec describe tools and limits; they are never evidence, and the skill must not copy them into a brief.

**Principles.** Intake's four carry over: code computes every number (the model labels; scripts count, weight, rank, gate and decide); evidence comes only from logged tool results or the owner's words and files (verbatim, ≤ 25 words, personal details removed); "not supported yet" is a valid result; every claim traces to evidence through `findings[]`. **New:** scripts write the research log. Every web call goes through a bundled script that records the request and response itself, so the model can't add a source by saying it saw one.

## 1. Purpose, inputs, outputs, handback

| | |
|---|---|
| **Runs after** | `gtm-intake` hands off `intake.json` with any readiness status (`needs-more` included; research is how gaps close) |
| **Inputs** | `gtm-workspace/<slug>/intake.json`, the existing `research-log.jsonl`, `sources/`, optional owner files: exported reviews of their own product, a Google Trends CSV, a `creatives/` folder |
| **Outputs** | The same `intake.json`, grown (new evidence, revised findings, segments, lexicon, a new optional `research` block); the append-only log, grown; `research/` working files; `research-brief.md` for the owner |
| **Handback** | A plain-words summary: what changed, the strongest recent quotes and script-computed statistics, confidence per customer group, and the recommendation with its reasons. The owner picks the next step |

Intake's own capped research turn stays as it is. It draws the first picture; `gtm-research` deepens and tests it.

## 2. Where the growing body of research lives

**Decision:** one append-only log plus the existing save file. No separate research database.

| File | Writer | Role |
|---|---|---|
| `research-log.jsonl` | Scripts only (in research runs) | **The ledger.** One JSON line per event: `run`, `search`, `fetch`, `source`, `reject`, `loop`. Each line carries `seq`, `at`, `runId`, `pass`, `writer` (script@version), `prev` (SHA-256 of the previous line). Never edited |
| `intake.json` | Scripts merge; model writes labels | The current picture. `evidence[]` only grows (stable IDs `ev_<n>` assigned by script, `runId` on each); `findings[]` are revised in place, with `runId` and `supersedes` |
| `research/state.json` | `loop.py` | Run, pass and loop counters, open tasks, credits used, status |
| `research/owner-questions.json` | `loop.py` + addendum | The owner-question queue (section 7) |
| `research/runs/<runId>.json` | `loop.py` | Snapshot at the end of each pass: gates, sentiment, decision. Lets the owner see how confidence moved |
| `research/cache/` | `tavily_search.py` | Result text kept only to verify quotes; deleted when the run closes (only hashes stay in the log) |

**Why this shape:**
- **The intake validator already reads this log.** `provenance.load_log` builds sources from `kind:"source"` lines and skeptic queries from `kind:"search"` lines, and ignores other kinds and extra fields. Research lines add fields but never change those two kinds. **Rule:** after every merge, `validate_research.py` first runs `validate_intake.py --log research-log.jsonl --write`, which must exit 0; research never weakens an intake check.
- **One save file** for the owner and for the simulation skill, which already reads `segments`, `lexicon` and `constraints` from it.
- **Append-only with a hash chain** gives "growing body" and auditability for free: any pass can be replayed from the log, and an edited line breaks the chain.

**Re-confirmation:** when a pass changes anything the owner confirmed (segments, hypothesis status, ICP), the merge script flips the "Owner confirmed the brief" check to `pass: false` with a note saying what changed. The brief can't read `ready` again until the owner re-confirms at handback.

## 3. Provenance made real

**Scripts, not self-reports.** The model never writes a `search` or `source` line. It runs:

```
python3 scripts/tavily_search.py search --plan research/plan.json    # or: extract --urls ... --query ...
python3 scripts/add_evidence.py research/candidates.jsonl            # model-proposed quotes → verified evidence
```

- `tavily_search.py` sends each call, logs a `search`/`fetch` line with the parameters (never the key), Tavily's `request_id` and the credits Tavily reports (`include_usage: true`), caches result text under a `fetchId`, and prints a numbered digest (`fetchId:resultIdx`, URL, date, text) for the model to read.
- The model proposes quotes as `{fetchId, resultIdx, quote, segmentIds, concernIds, sentiment, stances, demographicCues}`.
- `add_evidence.py` accepts a candidate only if: the quote is verbatim in that cached result (each `[removed]` may stand in for at most 4 words of the original), it's ≤ 25 words, it passes the intake personal-details regex, and every enum is valid. It then assigns `ev_<n>`, writes the `source` line (excerpt = the verified quote), and merges the record into `intake.json` atomically. Rejections are logged as `reject` lines with the reason; the rejection rate is a quality metric in the run summary.
- `validate_research.py` adds: research-run evidence must cite a `source` line whose `writer` is a script and whose `fetchId` maps to a logged `request_id`; the hash chain is intact; no file in the workspace matches `tvly-[A-Za-z0-9_-]+`.
- **Threat model, stated honestly:** this stops habitual or hallucinated sourcing, not a deliberately adversarial operator. Tavily `request_id`s let a human audit a run against Tavily's usage logs.

**API key.** `tavily_client.py` reads `TAVILY_API_KEY` from the environment, else the macOS Keychain (`security find-generic-password -s gtmagic-tavily -a "$USER" -w`, captured through a pipe, never through argv). It never prints, logs or caches the key; every exception message and log line passes a `tvly-…` redactor. No key → exit code 3 with "No Tavily key found; run the GTMagic key setup script." The setup script exists separately and isn't part of this spec. Standard library only (`urllib`), like the intake scripts.

**Tavily facts the scripts rely on** [T1–T5]: `POST https://api.tavily.com/search`, `/extract`, `/map` with `Authorization: Bearer tvly-…`.
- **Search** params used: `search_depth` (`basic` 1 credit, `advanced` 2), `max_results` ≤ 20, `chunks_per_source` 1–3, `include_domains` (≤ 300) with `include_domains_mode` (`restrict`/`prefer`), `exact_match` (quoted customer phrases), `country` (from a geography lock), `topic`, recency via `time_range` (`day`…`year`) or `start_date`/`end_date`, `include_published_date` (beta), and `filter_by_published_date` (drops undated results, so recent-only queries only). `days` isn't in the current docs; `auto_parameters` stays off (2 credits).
- **Extract:** ≤ 20 URLs per call; with `query` it returns the top `chunks_per_source` (1–5) chunks, not whole pages: right for quotes, and we store less. 1 credit per 5 successful URLs (basic); failures are free and arrive in `failed_results` even on HTTP 200. **Map** (competitor sites): 1 credit per 10 pages; map + targeted extract, never crawl.
- **Limits:** 100 requests/min on development keys, 1,000 on production; HTTP 429 with `Retry-After`; the script throttles to 30/min and retries once. `include_raw_content` with `include_domains` has returned empty results [T6], so search snippets first, extract second. Nebius acquired Tavily in 2026 [T7]; keeping Tavily behind `tavily_client.py` makes a provider swap one file.

## 4. Sources: access, limits and terms

| Source | Access path | What we take | Terms and limits that shape the design |
|---|---|---|---|
| **Reddit threads** | Tavily search, `include_domains: ["reddit.com"]`, snippets + query-focused extract | ≤ 25-word quotes, thread date, community name | Official Data API: self-service closed in Nov 2025; new access needs approval under the Responsible Builder Policy [R2]; commercial use needs a separate agreement; AI training needs rightsholder permission; data must be deleted when no longer needed [R1]. Rate limits are reported as 100 QPM per OAuth client (one source says 60) [R1, R6]. robots.txt has blocked most non-Google crawlers since July 2024 [R3], so Tavily's Reddit coverage may be partial: measure it in the spike. Reddit sued SerpApi, Oxylabs, AWMProxy and Perplexity in Oct 2025 over Reddit content obtained through search results [R4]. **So:** snippets and short quotes only, never usernames, never `/user/` URLs (the script blocks them), no bulk storage; get legal sign-off and Reddit approval before the paid hosted product (grill Q2) |
| **Subreddit metadata** | Tavily extract of the community page, if rendered | Weekly visitors and contributions, copied with an evidence ID | Reddit replaced public member counts with 7-day visitors (28-day rolling average) and contributions in 2025 [R5]; the API's `about` data needs approved OAuth. Without it, community activity is **observed-in-search** (dated threads found, computed by code), labeled as such, never as size |
| **Google Trends** | Owner uploads a Trends CSV (`trends_csv.py`); official API later | Relative interest over time, script-computed change | The official Trends API is an application-only alpha (since July 2025): consistently scaled data, 5-year rolling window, daily to yearly, country and sub-region [G1, G2]. `pytrends` was archived on 2025-04-17 [G3]. Tavily can find articles that cite Trends but not the series itself. Never scrape Trends |
| **App-store reviews** | Tavily search/extract of store pages; owner exports for their own app | Rating and review count as printed, a few visible reviews | App Store Connect and Play Developer APIs cover **your own apps only** [A2, A3]. Apple's legacy public reviews RSS (~500 recent per storefront) is undocumented [A1]; adapter only after a terms check |
| **Google Maps reviews** (local businesses) | Places API (New), full version only | Rating, `userRatingCount`, ≤ 5 reviews | Returns at most 5 reviews, sorted by relevance [P1]; policies forbid caching Places content beyond exceptions (place IDs are exempt) and require author attribution when displaying reviews [P2]. **So:** `retention: run` (excerpts dropped at run end), or prefer the owner's own Business Profile reviews as an owner file |
| **Trustpilot, G2 and similar** | Tavily search snippets only; no extract or crawl | Short quotes, aggregate rating | Secondary sources say Trustpilot's terms ban text and data mining without permission; G2 unconfirmed [TP]. Treat both as snippet-only until checked |
| **Platform demographics** | Tavily search of Pew and similar | Copied survey figures with n and date | Pew publishes Reddit use by age, gender, income and education (2026 survey, n = 5,511) [D1]. It reports use *within* each group, not the age mix *of* users; converting needs a sourced population mix, done by code |

Every adapter declares `access`, `retention` (`log` or `run`) and `snippetOnly` in `references/source-policy.md`; the scripts enforce them.

## 5. Discovery, extraction and labeling

**Seeds come from intake:** segment names and descriptions, needs and barriers, `lexicon[]` phrases (real customer words make the best queries), `interests[].researchDefinition` (may name a condition), `targetableProxies`, incumbents, `channels`, and locks (geography → `country`; age → query terms).

**Discovery (pass 1, and whenever a diversity gate fails).**
1. The model writes `research/plan.json`: queries with an `intent` (`discover-community`, `voice-of-customer`, `incumbent-reviews`, `demographics`, `skeptic`, `momentum`) and the segment they serve. Recipes live in `references/query-recipes.md`.
2. `communities.py` parses source keys from result URLs (`reddit:r/<name>`, `appstore:<id>`, `play:<package>`, `trustpilot:<domain>`, else the domain) and computes, per candidate: `breadth` (share of seed queries that hit it), mean Tavily `score`, distinct threads, and `recentShare` (dated in the last 12 months). **Rank = breadth × meanScore × (0.5 + 0.5 × recentShare)**, a versioned ranking heuristic, not a business assumption.
3. The model may exclude an off-topic candidate with a one-line reason (logged). The top 5 communities and top 5 products go forward.

**Extraction (each pass).** Per selected source, `voice-of-customer` queries built from needs, barriers, lexicon and switching language ("switched from", "cancelled", "gave up on"), restricted to that source, with `time_range: "year"` first. If that returns fewer than 5 usable results, the script widens to 3 years and logs the widening.

**Labels per excerpt** (model, using the versioned rubric in `prompts/label-rubric.md`):
- `segmentIds`, `concernIds` (stable `con_` IDs, as in intake).
- `sentiment: {label: "negative" | "mixed" | "neutral" | "positive", target}`, where `target` is `problem`, `category`, `incumbent:<name>` or `offer-concept`.
- `stances: [{hypothesisId, stance: "supports" | "contradicts"}]`.
- `demographicCues`: verbatim cue phrases (for example "52F", "my grandkids"), checked against the cached text by `add_evidence.py`.

**Aggregation (code).** `confidence.py` computes per segment × target: n, counts per label, net sentiment = (positive − negative) ÷ n, and the recency-weighted versions. **Label agreement:** in Claude Code, a separate subagent re-labels a 20% sample (minimum 10); code reports percent agreement. If it isn't checked, the segment's confidence is capped at medium.

**Recency.** `publishedAt` comes from Tavily's `published_date` only; otherwise `undated`. The weight is 0.5^(age in months ÷ 12) (12-month half-life). Undated excerpts get a fixed 0.25, count toward themes, and never count toward the recency gate. Customer voice older than 36 months isn't added; official statistics up to 5 years (grill Q5). Recency weighting applies to gates and sentiment, not to intake's `concernBundles` (grill Q12).

**Demographic signals,** each labeled with its `basis`:
- **`self-disclosed`:** `demographics.py` extracts bands with fixed patterns ("52F" → age 50–54, sex F; "I'm 34" → 30–34), plus model-proposed cues that are verbatim in the text. Only age band, sex, life stage and country or state. Bands are stored on the evidence record, never with a username. In health-topic briefs the exact age token is replaced by `[removed]` in the excerpt.
- **`community-level`:** a sourced figure about the platform or community (a Pew table, a subreddit's own census post), copied with its evidence ID and n.
- **`interpolated`:** computed by code with a named method, inputs and evidence IDs in `logic`. `self-disclosed-sample` (counts of bands); `platform-prior` (a community-level figure applied to one community); `blend` = w × sample + (1 − w) × prior with w = n ÷ (n + 20).
- **Small cells:** any band with n < 5 is suppressed from shares and reports. The model never types a share.

## 6. Confidence model: when "we're confident"

Gates are **validation thresholds** in `confidence.py` (constants, versioned). They measure the evidence, not the market, and owner economics never enter them.

| Gate (per segment) | Pass when (full · Today) | What fails it tells the next pass |
|---|---|---|
| G1 Volume | ≥ 30 · 15 customer-voice excerpts (`review` or `forum-post`) tagged to the segment | Run more voice-of-customer queries |
| G2 Recency | ≥ 50% dated within 24 months, and recency-weighted volume ≥ 15 · 8 | Re-query with `time_range: "year"` |
| G3 Diversity | ≥ 3 · 2 distinct sources, none over 40%, ≥ 2 source types | Discover another community or product |
| G4 Corroboration | Each of the top 3 concerns appears in ≥ 2 distinct sources; each hypothesis's support comes from ≥ 2 sources | Target the uncorroborated concern elsewhere |
| G5 Skeptic | No `unresolved` skeptic claim on the segment, unless the owner has answered it | Owner question or more disconfirming queries |
| G6 Labels | Second-label agreement ≥ 80% (Claude Code) | Revise the rubric; confidence capped at medium |
| G7 Owner alignment | No open `contradiction` question for the segment | Owner question |

**Segment confidence (code):** `high` = all gates pass; `medium` = G1 ≥ 10 excerpts, G3 and G7 pass; else `low`.

**Hypotheses:** code counts distinct-source support and contradiction. The model still writes `status`, but the validator errors on `supported` when contradictions ≥ supports or support comes from fewer than 2 sources, and on `refuted` without ≥ 5 contradicting excerpts from ≥ 2 sources or a cited "wrong if" match.

**How each pass narrows the ICP.** `loop.py` turns failing gates into research tasks and owner questions. The model may directly revise model-owned fields (needs, barriers, decision criteria, attribute weights, concerns), with each diff logged. Structural changes (split a segment whose concern ranking differs by community, merge two that don't, drop a `not-serviceable` one, change a must-have) are **proposals** the owner confirms (grill Q7). **Saturation** (a stop signal, not confidence) is the share of a pass's new excerpts that introduced a new concern ID; below 1 in 10 for two passes running means the web has little more to say.

## 7. Closing the loop with the owner

After every pass, `loop.py evaluate` checks for owner-facing gaps: **contradictions** between research and intake answers (an age lock of 35–64 while most self-disclosed ages are 25–34), **gaps** that block a gate and only the owner can fill (their own reviews, whether a competitor is really an alternative), **low-confidence segments** (narrow, keep researching, or drop?), **unverified locked constraints** that block a gate, and **narrowing** send-backs when a target is crowded or vague.

**Option A: intake gains an `addendum` mode.** Research writes the question queue and stops; `gtm-intake` (same conversation, invoked by name) asks only those questions under its interview rules, records the answers, applies changes to owner-owned fields with `scripts/apply_addendum.py`, re-validates, and hands back.
- **For:** one interviewer and one rulebook (plain words, the vagueness check, one pushback then gospel); the "who writes each field" table holds, since only intake writes owner-owned fields; about 30 lines of SKILL.md plus one script. **Against:** a skill switch mid-conversation (reliable in Claude Code, less certain in chat), and two skills editing one file (handled by turn-taking: research never writes while the queue has `asked` items).

**Option B: a second-pass interviewer inside `gtm-research`.**
- **For:** seamless; the evidence that raised each question is already in context; one skill to install. **Against:** it duplicates the interview rules (they drift), research gains write access to owner-owned fields, and SKILL.md grows past easy reading.

**Recommendation: A.** Field ownership and a single interview rulebook are the integrity rules this product rests on. In Claude Code the switch is invisible to the owner. If `gtm-intake` isn't installed, research stops and says so; it never asks owner questions itself.

**Handoff contract** (`research/owner-questions.json`, `schemaVersion: 1`):

```ts
interface OwnerQuestion {
  id: string;                 // q_<n>, script-assigned
  pass: number;               // which research pass raised it
  kind: "contradiction" | "gap" | "low-confidence" | "locked-unverified" | "narrowing";
  target: string;             // JSON pointer into intake.json, e.g. "/constraints/1" or "/segments/0"
  ask: string;                // plain words, one question; no ICP jargon
  why: string;                // plain words, cites what research found
  evidenceIds: string[]; findingIds: string[];   // at least one; validated
  blocking: boolean;          // blocks a confidence gate
  status: "open" | "asked" | "answered" | "skipped" | "withdrawn";
  answer?: { evidenceId: string; changes: Array<{ path: string; before: string; after: string }> };   // JSON-encoded; apply_addendum.py
}
```

- **Selection (code):** at most 4 per round, blocking first, then by the number of gates a question would unblock. A locked constraint that already has a `pushback` is never raised again; a contradiction on a locked constraint *is* its one pushback.
- **Answers:** each becomes `evidence` with `origin: "owner-text"`, `sourceType: "first-party"`, a verbatim ≤ 25-word excerpt and `questionId` (the full answer goes to `research/answers/q_<n>.txt`). `apply_addendum.py` diffs owner-owned fields before and after, appends a `loop` line (`answers-applied`, with the diff), and runs `validate_intake.py`, which must exit 0.
- **Resume:** `loop.py resume` reads `state.json` and the answers, re-plans only the affected tasks, and starts the next pass. It never restarts discovery unless G3 fails.
- **State in the files:** `state.json` (`runId`, `pass` counted across runs, `loop.count` = passes this run, `loop.max`, credits, `status`); the question lifecycle in `owner-questions.json`; every transition as a `loop` line in the log (`questions-issued`, `answers-applied`, `resumed`, `stopped`); a `research.loop` mirror in `intake.json`.

```
 gtm-research
 ┌──► plan ─► tavily_search.py ─► add_evidence.py ─► validate_research.py (gates)
 │                                                            │
 │                                                    loop.py evaluate
 │            ┌───────────────────────────┬───────────────────┴─────────────────┐
 │   research tasks only           owner questions                     T1–T4 stop gate met
 │            │                (owner-questions.json)                           │
 ├────────────┘                           │                            decide.py ─► owner
 │                 gtm-intake addendum: asks ≤ 4, records answers
 │                                        │
 │                          apply_addendum.py: diff → log
 │                                        │
 └──── loop.py resume ◄───── validate_intake.py exits 0
```

**Termination, computed as validation gates** (`loop.py status`):

| Gate | Pass when | Stops as |
|---|---|---|
| T1 Confident | Primary segment `high` (Today: `medium`), every alternate has a verdict, no blocking question open | `confident` |
| T2 Owner says good enough | The owner accepts; the script records `ownerAccepted` with the gates still failing, so later skills see "accepted at medium" | `owner-accepted` |
| T3 Pass cap | `loop.count` (passes this run) has reached 3 (Today: 2), or credits have reached the run cap | `cap-reached` |
| T4 Saturation | Two passes below the saturation threshold with gates still failing | `saturated` (recommend narrowing or a real-world test) |

The cap limits owner time and credit spend; it says nothing about the market. Reaching it hands off with every failing gate listed in plain words.

## 8. End-of-run decision and handoffs

`decide.py` computes the recommendation; the model explains it and the owner chooses (grill Q11).

| Recommendation | When (code) | What the owner sees | Next skill receives |
|---|---|---|---|
| **Refine** | Primary confidence `low`; or a blocking question open; or an `unresolved` skeptic claim on the primary motivation; or stopped as `saturated`/`cap-reached` with gates failing | Each item to refine with the evidence and the gate it fails, and how: an owner answer, another run, or a cheap real-world test | — (a new `gtm-research` run resumes from `state.json`) |
| **Generate creatives** | Primary ≥ `medium`, intake validator ready, ≥ 10 lexicon phrases for the primary, no creatives supplied | Top concerns, net sentiment toward incumbents (angles), the quotes to borrow | `intake.json` (segments, lexicon, constraints with `appliesTo` messaging/targeting, `roughMessaging` as seeds) plus `research.decision` (`focusSegmentIds`, ranked concerns). Output: text (headline, body) or images (with their on-image text supplied separately so guardrails can check it) |
| **Evaluate existing creatives** | Same gates, and the owner has ≥ 2 creatives in `creatives/` | The same, plus what the test will compare | `intake.json`, `research.decision`, and `creatives/manifest.json`: `{id, kind: "text" or "image", path or text, headline?, body?, onImageText, channel?}` |

The handback shows, in order: what changed this run (findings added, revised, superseded); per segment, the 3 strongest recent quotes with links (no links in `--public` renders) and the script's statistics (excerpts, sources, recency share, net sentiment by target, top concerns, demographic shares with n); confidence with failing gates in plain words; then the recommendation and the other two options.

## 9. Health topics, copyright, compliance and budget

**Health and sensitive topics** (intake's rules carry over unchanged; additions):
- Queries, `researchDefinition` and `research.communities[]` may name a condition: they're research.
- `segments[].channels` lead to targeting, so they get intake's proxy check (no condition terms) and the "verify platform policy" suffix. A community whose name names a condition stays in `research.communities` only.
- Never infer a person's health status; self-disclosed signals exclude health attributes entirely; the community already implies the topic.
- Self-disclosed bands only in aggregate with n ≥ 5; exact ages redacted from health quotes. Findings about drug effects never become messaging claims; intake's messaging check applies to every creative.

**Copyright:** ≤ 25-word excerpts, always with a source link (except `--public`); never whole reviews or threads; cached page text deleted when the run closes. **ToS:** per section 4, enforced by adapter policy: snippet-only domains, blocked `/user/` paths, `retention: run` for Places, no Trends scraping, no CAPTCHA or login bypass.

**Budget per run** (enforced by `tavily_search.py` from `state.json`): per pass ≤ 20 advanced searches (~40 credits) + ≤ 3 extract calls (≤ 12), so ≤ 55 credits; per run 3 passes under a 200-credit cap (≈ USD 1.60 pay-as-you-go at USD 0.008 per credit; the free tier is 1,000 credits a month [T4]). Time: about 5–8 minutes per pass, plus owner rounds.

## 10. Skill layout, schema delta, build plan

```
.claude/skills/gtm-research/            requires gtm-intake installed alongside
  SKILL.md                              the pass loop, labeling rules, handback
  prompts/label-rubric.md               sentiment, concern and stance rubric (versioned)
  references/source-policy.md           per-source access, retention, snippet-only, ToS notes
  references/query-recipes.md           query templates per intent
  scripts/tavily_client.py              key loading (env → Keychain), HTTP, throttle, 429, redaction, --replay
  scripts/tavily_search.py, ledger.py   search / extract / map from a plan → log + cache; hash chain, verify, close-run
  scripts/add_evidence.py               verify candidates → evidence + source lines; IDs; atomic merge
  scripts/communities.py, demographics.py      source keys, metrics, rank; bands, interpolation, small cells
  scripts/confidence.py, loop.py, decide.py    gates, sentiment, saturation; question queue, resume, stop; recommendation
  scripts/trends_csv.py                 owner-uploaded Google Trends CSV → series summary
  scripts/validate_research.py, render_research.py   intake validator + research checks; research-brief.md (--public)
.claude/skills/gtm-intake/scripts/apply_addendum.py   (Option A) answers → owner-owned fields, diff
```

`validate_research.py` imports the intake validator from `../gtm-intake/scripts/` and fails clearly if it's missing; one copy of the rules, no vendoring. Confirm the sibling path in Claude chat's skill layout during the spike.

**Schema delta** (to add to `gtm-intake/references/schema.md`; all optional, so the version stays 1):

```ts
interface Evidence {                    // + optional fields
  runId?: string; questionId?: string; sourceKey?: string;      // e.g. "reddit:r/xyz"
  publishedAt?: string | null; recencyWeight?: number;           // script
  sentiment?: { label: "negative" | "mixed" | "neutral" | "positive"; target: string };   // model
  stances?: Array<{ hypothesisId: string; stance: "supports" | "contradicts" }>;          // model
  demographicSignals?: Array<{ attribute: "age" | "sex" | "lifeStage" | "geography"; value: string; cue: string }>;  // script-verified
}
// sourceType gains "search-trend" (Trends series): a one-line change to provenance.SOURCE_TYPES
interface Finding { runId?: string; supersedes?: string }        // + optional
// InterestGroup.demographics[] + optional: basis: "self-disclosed" | "community-level" | "interpolated"; method?: string; n?: number
interface IntakeBrief { research?: ResearchBlock }               // new optional top-level block

interface ResearchBlock {
  schemaVersion: 1;
  runs: Array<{ runId: string; startedAt: string; endedAt?: string; passes: number; creditsUsed: number }>;   // script
  loop: { count: number; max: number; status: "researching" | "awaiting-owner" | "confident" | "owner-accepted" | "cap-reached" | "saturated";
          ownerAccepted?: { at: string; failingGates: string[] } };                                            // script
  communities: Array<{ id: string; sourceKey: string; segmentIds: string[]; breadth: number; meanScore: number; threads: number;
                       recentShare: number; rank: number; visitorsWeekly?: number; evidenceIds: string[]; excludedReason?: string }>;
  products: Array<{ id: string; name: string; sourceKey: string; rating?: number; reviewCount?: number; evidenceIds: string[] }>;
  confidence: Array<{ subjectId: string; level: "low" | "medium" | "high";
                      gates: Array<{ gate: string; pass: boolean; value: number; threshold: number }> }>;      // script
  sentiment: Array<{ segmentId: string; target: string; n: number; negative: number; mixed: number; neutral: number;
                     positive: number; net: number; weightedNet: number }>;                                    // script
  trends: Array<{ term: string; geo: string; evidenceId: string; change12mo: number | null }>;                 // script
  decision?: { recommendation: "refine" | "generate-creatives" | "evaluate-creatives"; reasons: string[]; focusSegmentIds: string[];
               refineItems: Array<{ what: string; gate?: string; evidenceIds: string[] }>; ownerChoice?: string; decidedAt?: string };
}
```

**Who writes:** script: every number above, IDs, `publishedAt`, `recencyWeight`, `demographicSignals`, `loop`, `decision.recommendation`. Model: labels, findings, skeptic entries, question wording, community exclusions, refine-item wording. Owner: answers, structural segment changes, `ownerAccepted`, `ownerChoice`.

**Build plan** (3 people, tasks ≤ half a day, ~7 person-days, ~2.5 days elapsed):

| # | Task | Done when |
|---|---|---|
| 0 | **Spike:** 10 seed queries on the demo business against Reddit, app stores, Trustpilot; record a replay cassette; check chat sandbox egress to api.tavily.com | Measured hit rate, dated share and credits per query written up; cassette in `fixtures/demo/research/` |
| 1 | `tavily_client.py` + `tavily_search.py` + `ledger.py`, with `--replay` | Unit tests: hash chain, key never in output (grep test), 429 retry, budget refusal |
| 2 | `add_evidence.py` | Tests: verbatim with `[removed]`, ≤ 25 words, personal-detail rejection, cue verification, atomic merge, intake validator still exits 0 |
| 3 | `communities.py` + query recipes | Ranks are deterministic on the cassette |
| 4 | `confidence.py` + `demographics.py` | Gate and sentiment numbers match hand-computed fixtures; n < 5 suppressed |
| 5 | `loop.py` + intake addendum mode + `apply_addendum.py` | A contradiction round-trips: question → answer → diff logged → resume |
| 6 | `decide.py`, `validate_research.py`, `render_research.py` | Fixtures produce each of the three recommendations |
| 7 | SKILL.md, label rubric, source policy | End-to-end demo run from the cassette, offline; senior-engineer and GPT review |

**Today slice:** Tavily only (Reddit, app-store pages, competitor sites), 2 passes, 1 owner round, the Today thresholds, no label-agreement check (confidence capped at medium), demo from the cassette. **Full:** Trends (CSV, then the alpha), Places, label agreement, multi-run growth.

## 11. Questions to grill the product owner on

1. **Owner loop: intake "addendum" mode (A) or an interviewer inside research (B)?** Default **A**: one interviewer and one rulebook, and only intake writes owner-owned fields. B is smoother to build, but it duplicates the interview rules and blurs field ownership.
2. **Reddit in the paid hosted product: keep reading via Tavily, apply for Reddit Data API approval and commercial terms, or drop Reddit there?** Default: Tavily snippets for Claude Code and the demo now; apply under the Responsible Builder Policy and get a legal read before the hosted launch. Reddit has sued over its content being obtained through third-party search, and requires a separate agreement for commercial use.
3. **Which surface ships first: Claude Code only, or Claude chat too?** Default **Claude Code**. The scripts need an env or Keychain key and outbound network; if chat's sandbox blocks api.tavily.com, the model would be writing the log again, which breaks script-written provenance.
4. **Whose Tavily key and credits?** Default: the owner's own key in Claude Code (free tier 1,000 credits a month, about 5 full runs); our key with hard per-run caps only in the hosted product. This changes billing, the setup flow and abuse risk.
5. **How recent is "recent"?** Default: 12-month half-life, a 36-month hard window for customer voice, 5 years for official statistics; undated posts count toward themes, not toward the recency gate. A shorter window gives fresher sentiment but thin evidence for niche and local businesses.
6. **What bar is "confident"?** Default: the gates as written (30 customer-voice excerpts, ≥ 3 independent sources, none over 40%, top concerns corroborated in ≥ 2 sources, skeptic resolved), with 15 for the hackathon slice. A higher bar costs credits and owner time; a lower one risks blessing an echo chamber.
7. **May research change customer groups itself (split, merge, drop), or only propose?** Default: **propose**; the owner confirms in the addendum. Research directly updates only model-owned fields (needs, barriers, weights, concerns), with each diff logged.
8. **Self-disclosed demographics on health topics: allowed?** Default: **yes, narrowly**: age band, sex, life stage, country or state; extracted by code; aggregates with n ≥ 5 only; exact ages redacted from health quotes; never health status per person. "No" loses the best age signal for the GLP-1 demo.
9. **Google Trends: apply for the official alpha, accept owner-uploaded CSVs, or skip?** Default: owner-uploaded CSV now plus an alpha application; never `pytrends` (archived) or scraping. Without Trends, momentum comes from dated post volume, labeled as such.
10. **Review sources beyond Tavily snippets (Apple's public reviews RSS, the Places API)?** Default: snippets plus the owner's exported reviews of their own product; add the RSS and Places adapters only after a terms check (Places forbids caching content; Trustpilot reportedly bans text mining).
11. **End of run: always stop for the owner's choice, or auto-continue when the gates pass?** Default: **always stop**, with the recommendation preselected. The next skills cost money, and the owner must re-confirm a brief that research changed.
12. **Should recency weighting flow into the simulation's concern weights, or stay in confidence and sentiment only?** Default: confidence and sentiment only for v1, so the intake validator stays unchanged and concern counts stay comparable across runs. Revisit once simulations show it matters.

## Sources (checked 2026-10-25)

- **Tavily:** [T1] search https://docs.tavily.com/documentation/api-reference/endpoint/search · [T2] extract https://docs.tavily.com/documentation/api-reference/endpoint/extract · [T3] map https://docs.tavily.com/documentation/api-reference/endpoint/map · [T4] credits and pricing https://docs.tavily.com/documentation/api-credits · [T5] rate limits https://docs.tavily.com/documentation/rate-limits · [T6] raw-content + domains issue https://community.tavily.com/t/combining-include-raw-content-and-include-domains-leads-to-no-results/170 · [T7] Nebius acquisition (Q2 2026 6-K) https://www.sec.gov/Archives/edgar/data/0001513845/000110465926094844/nbis-20260812xex99d2.htm
- **Reddit:** [R1] Data API Terms (rev. 2026-07-20; the page blocks automated fetching, so read via a summary) https://redditinc.com/policies/data-api-terms, https://vorplabs.com/agent-tools/reddit-data-api · [R2] Responsible Builder Policy announcement, r/redditdev 2025-11-11 (mirror) https://r.datuan.dev/r/redditdev/comments/1oug31u/introducing_the_responsible_builder_policy_new/noc31sg · [R3] robots.txt block https://searchengineland.com/microsoft-confirms-reddit-blocked-bing-search-444385 · [R4] Reddit v. Perplexity, SerpApi et al. https://searchengineland.com/reddit-sues-perplexity-serpapi-scraping-google-463681, https://www.sdnyblog.com/files/2025/10/25-Civ-8736-Reddit-Inc.-Complaint.pdf · [R5] visitors and contributions https://www.socialsamosa.com/news-2/reddit-member-count-new-engagement-metrics-10067678 · [R6] rate limits (secondary) https://www.socialcrawl.dev/blog/reddit-api-key-limits-alternatives-2026
- **Google Trends:** [G1] https://developers.google.com/search/apis/trends · [G2] https://developers.google.com/search/blog/2025/07/trends-api · [G3] pytrends (archived) https://github.com/GeneralMills/pytrends
- **Reviews:** [A1] Apple reviews RSS cap (secondary) https://dev.to/quantoracle/the-app-store-review-ceiling-nobody-mentions-and-how-to-get-8x-past-it-484h · [A2] App Store Connect customer reviews https://developer.apple.com/documentation/appstoreconnectapi/customer-reviews · [A3] Play reviews API scope https://aso.dev/google-play/metadata/reviews/ · [P1] Places API (New) Place resource https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places · [P2] Places policies https://developers.google.com/maps/documentation/places/web-service/policies · [TP] Trustpilot terms (secondary, unverified) https://webscraping.ai/faq/trustpilot-scraping/what-are-the-alternatives-to-scraping-trustpilot-directly
- **Demographics:** [D1] Pew social media fact sheet https://www.pewresearch.org/internet/fact-sheet/social-media/
