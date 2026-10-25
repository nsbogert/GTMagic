# Known-answer scoreboard: refactor-fitness

Scored against 9 answer-key items, 0–2 points each (max 18). Points count only when the judge's quoted evidence is found word for word in the output. The cross-check is an independent expected score from a different model, with no quotes.

| Approach | Runs | Mean | Min–max | Mean % | Cross-check (decision model) |
|---|---|---|---|---|---|
| positive control · refactorfitness.app/llms.txt | 1 | 15 / 18 | 15–15 | 83% | 9.4 / 18 |
| one prompt · deepseek-v4.1-flash-1017 | 3 | 7 / 18 | 5–8 | 39% | 4.1 / 18 |

## Per item (mean score, 0–2)

| Item | positive control · refactorfitness.app/llms.txt | one prompt · deepseek-v4.1-flash-1017 |
|---|---|---|
| Who to target first | 2 | 0.3 |
| Second segment worth a test | 2 | 0 |
| Verdict on the founder's starting guess *(inferred)* | 1 | 1 |
| What to say | 2 | 0.7 |
| The pain and the moment people buy | 1 | 1 |
| Top objections to handle | 2 | 1.3 |
| What they use today | 2 | 1.3 |
| Claims to avoid | 2 | 0.3 |
| Where to reach them | 1 | 1 |

## Warnings

- `import-positive-control-refactorfitness.app-llm-2026-10-25t192309357z`: possible answer leak: output mentions "Refactor Fitness", "refactorfitness", "Nick Bogert"

Synthetic and model outputs are hypotheses to test, not proof. Items marked *inferred* still need founder confirmation.
