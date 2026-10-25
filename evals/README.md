# Known-answer evals

Does GTMagic reach the conclusions a real founder reached the hard way, and does it beat asking a chat assistant one question? This folder measures that.

A **case** has two halves:

| File | What it is | Who may read it |
|---|---|---|
| `cases/<id>/input.json` | The *before* state: what the founder knew before customer research (a `BusinessBriefInput`), anonymized, plus domains to block from web search | Pipelines and baselines |
| `cases/<id>/answer-key.json` | The *after* state: where the founder landed, as 0–2-point rubric items with sources | **Only the scorer.** Never put it in a prompt or a fixture |

The first case is **Refactor Fitness** (Nick's app). Its public site moved from "self-led lifters who track both" to "**Lose the weight, not your strength**" for people losing weight, especially on GLP-1 medications, with men over 40 as a second segment. Items marked `inferred` (the starting guess) need Nick to confirm.

## The ladder

Each approach answers the same three questions (who to target, what to say, what to try this week) and is scored by the same blind judge:

1. `plain`: one prompt to a chat model, no tools: what most owners do today
2. `search`: the same prompt with web search (the business's own domains blocked)
3. `gtmagic`: a GTMagic report, imported with `import`

## Results so far

See [results/refactor-fitness/SCOREBOARD.md](results/refactor-fitness/SCOREBOARD.md). One prompt scores **5–8 / 18** (3 runs); Refactor's own site text, as a positive control, scores **15 / 18**. The one-prompt answers keep "lifters" as the lead customer and never reach weight loss or GLP-1.

## Run it

Keys come from the team vault; nothing is stored in files. Install `vault-run` per the vault guide, and export `VAULT_IDENTITY` without printing it. From this folder:

```bash
npm install
npm test                                                           # offline, no keys
npm run eval -- prompt   --case refactor-fitness                   # see the one-prompt baseline
vault-run aliyun -- npm run eval -- baseline --case refactor-fitness --n 3
npm run eval -- import   --case refactor-fitness --label gtmagic path/to/report.md
vault-run aliyun -- npm run eval -- score --case refactor-fitness
npm run eval -- board    --case refactor-fitness                   # writes results/refactor-fitness/SCOREBOARD.md
```

**Models** are `provider:model`:

| Provider | Keys (env vars) | Notes |
|---|---|---|
| `dashscope:deepseek-v4.1-flash-1017` | `deepseek_model_api_key` + `openai_api_endpoint` (vault folder `aliyun`) | **Default** when no Anthropic key. The only chat model the team key allows |
| `anthropic:claude-opus-5-5` | `ANTHROPIC_API_KEY` | Default when set. Needed for the `search` variant (`blocked_domains`) |
| `openai:<model>` | `OPENAI_API_KEY`, optional `OPENAI_BASE_URL` | Any OpenAI-compatible endpoint |

Override with `--model` / `--judge`, or `EVAL_GEN_MODEL` / `EVAL_JUDGE_MODEL`.

**Cross-check:** when `decision_model_key` is present (vault folder `aliyun`), `score` also asks `decision-model-preview` to grade each item. It returns a probability for full / partial / none, giving an expected score from a second, independent model. It can't quote evidence, so it's a sanity check next to the main judge, not a replacement.

No working key? `prompt` prints the exact baseline text: paste it into claude.ai, save the answer to a file, and `import` it.

## Why the numbers can be trusted

- **Blind judge:** the judge sees the answer key and the output, never the approach's name or model.
- **Positive control:** the business's real positioning text scores 15 / 18, so the rubric rewards the right answer and isn't just hard.
- **Quotes or it didn't happen:** for every point it awards, the judge must quote the output word for word. Code checks each quote; an unverified point becomes 0. The scoreboard shows only verified points.
- **No answer in the input:** the case input has no business name or URL, and a test fails if the baseline prompt contains the answer's key terms.
- **Leak check:** any output that names the real business is flagged on the scoreboard.
- **Repeats:** run `--n 3` or more. Model output varies, so report the range, not a single best run.
- **Self-grading caveat:** with only DeepSeek available, the same model generates and judges the baseline. The quote check and the decision-model cross-check limit this; use a Claude judge when a key is available.

## Rules for tuning the pipeline against a case

- Tune prompts on the **method**, never the answer. "Look for what makes people stop" is fine; "mention GLP-1" is cheating.
- Ideally the person tuning prompts isn't the person holding the answer key.
- Check that improvements generalize: add a second case (another founder, or a company with a public pivot) before claiming a win.

## Add a case

Copy `cases/refactor-fitness/`, write the founder's *starting* brief in `input.json` (no name, no URL), and write 6–10 rubric items in `answer-key.json`, each with `full` and `partial` criteria and a source. Mark anything not confirmed by the founder as `inferred`.

## Audience-conditioned message benchmark (Mega-Study infotainment)

`benchmarks/megastudy/` checks whether a model can say which message variant a demographic segment prefers, and how segments differ. The ground truth is 300 real people rating 18 news-post cards (Twin-2K-500 Mega-Study). This step prepares data only; no model is called. See [benchmarks/megastudy/README.md](benchmarks/megastudy/README.md).

```bash
python3 scripts/prep_megastudy.py && npm run megastudy -- prep && npm run megastudy -- fake && npm run megastudy -- report
```
