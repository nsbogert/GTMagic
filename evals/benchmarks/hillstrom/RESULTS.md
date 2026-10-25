# Hillstrom email benchmark: which segment responds to which campaign

64,000 customers, 43 segments (n ≥ 1,500). Visit rate: no email 10.62%, Men's email 18.28% (+7.66pp), Women's email 15.14% (+4.52pp).

- **(a) Better email:** share of segments where the arm names the email with more visits, scored only on the 34 segments where Men's vs Women's is significant at 95% (34 Men's, 0 Women's; 27 survive Holm). Answering "mens" everywhere scores 100.0%. CI: bootstrap over segments.
- **(b) Spearman:** predicted segment ranking vs true visit uplift, for each email. CI: 500 customer-level bootstrap replicates of the truth (the oracle's CI is the noise ceiling).
- **(c) Women's top 3:** how many of the true top-3 segments for the Women's email are in the arm's top 3, and the share of the possible uplift gain over the average segment its top 3 captures (100% = best, 0% = random). True top 3, Women's: S35 buyer=both & channel=multichannel (+9.5pp); S25 buyer=both & tenure=new (+9.0pp); S31 buyer=womens-only & channel=web (+7.5pp). Men's: S33 buyer=both & channel=phone (+15.2pp); S26 buyer=both & tenure=returning (+13.5pp); S03 buyer=both (+13.4pp).

| Arm | (a) Better email | (a) Holm subset | (b) Spearman, Women's | (b) Spearman, Men's | (c) Women's top-3 hits | (c) Women's top-3 gain | Men's top-3 gain | Invalid |
|---|---|---|---|---|---|---|---|---|
| *chance* | 50.0% | 50.0% | 0.000 | 0.000 | 7.0% | 0.0% | 0.0% | |
| oracle | 100.0% <sub>[100.0%, 100.0%]</sub> | 100.0% <sub>[100.0%, 100.0%]</sub> | 1.000 <sub>[0.769, 0.953]</sub> | 1.000 <sub>[0.629, 0.897]</sub> | 100.0% <sub>[0.0%, 100.0%]</sub> | 100.0% <sub>[53.2%, 100.0%]</sub> | 100.0% <sub>[62.6%, 100.0%]</sub> | 0 |
| random | 47.1% <sub>[29.4%, 64.7%]</sub> | 44.4% <sub>[25.9%, 63.0%]</sub> | -0.011 <sub>[-0.122, 0.148]</sub> | -0.330 <sub>[-0.493, -0.163]</sub> | 0.0% <sub>[0.0%, 33.3%]</sub> | 5.3% <sub>[-28.8%, 36.8%]</sub> | -19.5% <sub>[-25.1%, -10.4%]</sub> | 0 |

Invalid = segments with a missing/unreadable better_email, plus rankings that needed repair (missing or duplicate ids).
