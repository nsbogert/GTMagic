# Hillstrom email benchmark: which segment responds to which campaign

Source: Kevin Hillstrom's [MineThatData E-Mail Analytics challenge](http://www.minethatdata.com/Kevin_Hillstrom_MineThatData_E-MailAnalytics_DataMiningChallenge_2008.03.20.csv) (2008). It covers 64,000 customers who bought in the last 12 months. They were randomized into thirds: "Mens E-Mail", "Womens E-Mail" and "No E-Mail". The outcomes are website visit, conversion and spend in the next two weeks. The raw CSV is downloaded to `evals/data/hillstrom/` (gitignored).

| File | What it is | Who may read it |
|---|---|---|
| `task.json` | Blind task: business, the two campaigns in plain words, 43 segment descriptions and sizes. No outcomes | Predictors |
| `prompts/vanilla-v1.md` | Exact plain-Claude prompt; `{{...}}` placeholders are filled from `task.json` (`npm run hillstrom -- prompt`) | Operator |
| `truth.json` | Per segment: arm counts, visit and conversion rates, uplifts (Men's vs none, Women's vs none, Men's vs Women's, and uplift vs the rest of customers) with 95% Wald CIs and p-values; significant winner, unadjusted and Holm | **Scorer only** |
| `truth.bootstrap.json` | 500 customer-level bootstrap replicates of each segment's visit uplift (seeded) | **Scorer only** |
| `predictions/<arm>.json` | `{"better_email": {...}, "rank_mens": [...], "rank_womens": [...]}` | Scorer |
| `RESULTS.md` | Scores (`npm run hillstrom -- report`) | Anyone |

Segments are single attributes (buyer type, new vs returning, recency band, purchase channel, area, past-year spend band), plus buyer×tenure, buyer×channel and tenure×recency. Every segment has n ≥ 1,500. Segments overlap.

**Items**

- (a) The email with more visits, scored only where Men's vs Women's is significant.
- (b) Spearman of each email's segment ranking against the true visit uplift.
- (c) The top 3 segments for the Women's email: hits, and the share of the possible gain captured.

```bash
npm run hillstrom -- prep        # download + truth/task files (deterministic)
npm run hillstrom -- baselines   # code-generated oracle + random arms (no model calls)
npm run hillstrom -- prompt      # print the filled-in vanilla-v1 prompt
npm run hillstrom -- report      # score all arms → RESULTS.md
```

## Caveats

- **The campaign text is not in the data.** The dataset records only "Mens E-Mail" or "Womens E-Mail". The descriptions ("An email featuring our men's/women's merchandise") are paraphrases. Any prediction can rest only on the merchandise focus, not on copy, offer or creative.
- **Item (a) is lopsided.** All 34 significant segments favour the Men's email (27 after Holm). Answering "mens" everywhere scores 100%. So (a) only checks whether a predictor knows the overall winner; (b) and (c) are where predictors differ.
- **The rankings are noisy.** The oracle's CI is the noise ceiling: Spearman 0.77–0.95 (Women's) and 0.63–0.90 (Men's) against bootstrap replicates. Women's top-3 *hits* are unstable (oracle CI 0–100%), because the top segments are small. Prefer top-3 *gain*.
- Rankings and items use visits only. Conversion uplifts are in `truth.json`, but most segment-level conversion differences are too noisy to score.
- The data is from 2008, and this is one retailer's customer file.
