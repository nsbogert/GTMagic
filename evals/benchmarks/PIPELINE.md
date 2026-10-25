# Pipeline under test: contract, versions and provenance

The same contract applies to every benchmark and to the vanilla baseline. Any change gets a new version (`pipeline-v2`); nothing here is edited after a run uses it.

## Rules

1. **Autonomous:** no human input between the start of a run and the output. No follow-up questions to the owner.
2. **Claude only:** ICP inference and reasoning use `claude-opus-5.5`; simulated customers use `claude-haiku-5.5`.
3. **Fair comparison:** vanilla gets the identical input and returns the same output format; both are scored by the same code against real outcomes. No LLM judge.
4. **Blind:** models never see outcomes, test ids that link to sources, or which option is the original or control.
5. **Recorded:** every prompt is a versioned file; every agent's wrapper text, inputs and outputs are on disk and listed in [RUNLOG.md](RUNLOG.md).

## Input (one format for every benchmark)

```ts
interface PipelineInput {
  request: string;                       // the owner's words, e.g. "Compare these images, which would work better for Refactor Fitness?"
  brief?: string;                        // product or article description, if the benchmark provides one
  channel?: string;                      // where the ads run, e.g. "Upworthy on Facebook, 2013–2015"
  audience: "infer" | Array<{ segmentId: string; description: string; weight: number; personas?: string[] }>;
  candidates: Array<{ id: string; text?: string; imagePath?: string }>;
  control?: boolean;                     // adds a "nothing shown" option (Hillstrom)
}
```

## Output (one format for every benchmark, pipeline and vanilla)

```ts
interface PipelineOutput {
  icp: Array<{ segmentId: string; description: string; weight: number }>;
  perAd: Array<{
    id: string;                          // candidate id or "control"
    pickShare: number;                   // share who'd pick it when shown all (pick one or none)
    clickRate: number;                   // share who'd click it when shown alone
    meanRating: number;                  // 1–7 appeal
    bySegment: Array<{ segmentId: string; pickShare: number; clickRate: number; meanRating: number; n: number }>;
  }>;
  noneShare: number;
  ranking: string[];                     // pickShare, then clickRate, then meanRating
}
```

## Pipeline stages

| Stage | Model | What happens |
|---|---|---|
| S1 Intake | — | Not run: the benchmark supplies `request`/`brief`, the same text vanilla gets |
| S2–S3 Research → ICP | Opus 5.5 (1 agent) | Only when `audience = "infer"`: writes the ICP mix (segments × weights) and 30 short persona summaries, counts proportional to weights |
| S5 Simulate | Haiku 5.5 (30 agents) | Agent *k* plays persona *k*. For each test it sees the options under neutral ids (`h1…`) in **its own seeded random order**, then rates each 1–7, says click yes/no to each, and picks one or none |
| S6 Decide | Code | Maps ids back, tallies `pickShare`, `clickRate`, `meanRating` (overall and per segment), ranks |

## Which output field each benchmark scores

| Benchmark | Output field | Real truth |
|---|---|---|
| Refactor ads | `ranking[0]` | Real CTR of each image |
| Upworthy | `ranking` | Real CTR per headline |
| Mega-Study | `perAd[].bySegment[].meanRating` | Held-out people's mean 1–7 ratings |
| Hillstrom | `clickRate(email) − clickRate(control)` per segment | Real visit uplift |

## Versions

| Version | S2–S3 ICP | S4 ad wording | S5 simulate | S6 decide | Status |
|---|---|---|---|---|---|
| `pipeline-v1` | Opus infers the ICP mix + 30 personas (`icp-infer-v1`) | Candidates passed through unchanged | 30 Haiku persona-agents (`sim-agent-v1`), pick / click / rate | Code: rank by pickShare | Ran on Upworthy val: **at chance** (τ −0.03 vs vanilla 0.21) |
| `pipeline-v2` | Same as v1 (reuses `sim/pipeline-v1/icp.json`) | **`gtm-ad-wording` screen:** Opus applies the 12 learned principles and the 3-step procedure (`screen-v1`) → ranking | Same crowd as v1 (reused outputs) | Code: one of three pre-registered rules, chosen on **val** by Kendall τ: (a) S4 ranking only, (b) S5 crowd only, (c) mean rank of S4 and S5 | Defined; val run pending |

The rule chosen on val is frozen before the test split runs. The test split runs once per arm.

## Provenance: what comes from the team repo, and what was built for the benchmark

| Piece | Source | Used in pipeline-v1/v2? |
|---|---|---|
| Planning docs, contracts, 8-step pipeline design (`docs/`) | Nick, `main` (#2 planning commit) | Design only: v1/v2 follow the same stages, simplified |
| `gtm-intake` skill (owner interview, capped research, validator, creatives import) | Nick, `main` (#2, #3, #6) | **No.** Benchmarks have no owner to interview, and runs must be autonomous |
| `gtm-research` skill spec v0.2 (Tavily, owner-in-the-loop research loop) | Nick, `main` (#5) | **No.** Spec only (no code), needs a Tavily key and owner answers |
| UI prototype with live crowd (`prototype/`) | Shimin, `main` (#4) | **No.** Its simulation is a labeled placeholder with hand-set counts |
| Simulation step | Not built on `main` | v1/v2 use the benchmark's own implementation (`icp-infer-v1`, `sim-agent-v1`, `src/upworthy/sim.ts`) |
| `gtm-ad-wording` skill + 12 learned principles | Built here; branch `sean/ad-wording-principles` | **v2:** S4 screen |
| Benchmarks, scorers, run log (`evals/`) | Built here; branch `sean/evals-known-answer` (not yet pushed) | Measurement only |
