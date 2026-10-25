# Refactor Fitness ad tests

Two real Meta ad tests run by Refactor Fitness. Each compares two image ads, and the winner is the one with the higher real CTR.

- `tests.json`: the full pipeline input: the owner's exact request plus the two images, with the audience inferred. This is all any model gets.
- `images/refactor-N/image-{1,2}.png`: the creatives. File names must not hint at the winner.
- `truth.json`: impressions, clicks, CTR and CPC per image. One teammate keeps it and adds it only at scoring time (template: `truth.template.json`).

Scored field: `ranking[0]` of the PipelineOutput (see [../PIPELINE.md](../PIPELINE.md)). With 2 tests the result is 0/2, 1/2 or 2/2, so it's a demo, not a statistic.
