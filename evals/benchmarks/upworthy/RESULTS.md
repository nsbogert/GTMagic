# Upworthy headline benchmark: results

Real A/B tests from the [Upworthy Research Archive](https://osf.io/jd64p/) (CC BY 4.0). Each test has 4–8 headlines for one article and a statistically clear winner. Arms see only the article opening and the headlines.

- **Winner = our #1 / in our top 3:** how often the real winner is the arm's first pick / among its top 3 (what you'd put money behind).
- **Gain captured:** how much of the possible CTR gain over the average headline the arm's picks capture (100% = perfect picks, 0% = random).
- **Kendall τ:** rank agreement with real CTR (−1 to 1).

## val split: 231 tests (4.7 headlines on average)

| Arm | Winner = our #1 | Winner in our top 3 | Gain captured (#1) | Gain captured (top 3) | Kendall τ | Missing/invalid |
|---|---|---|---|---|---|---|
| *chance* | 22.0% | 66.0% | 0% | 0% | 0.000 | |
| pipeline-v1 | 22.1% <sub>[16.9%, 27.3%]</sub> | 62.3% <sub>[56.3%, 68.8%]</sub> | -0.7% <sub>[-8.5%, 6.7%]</sub> | -4.4% <sub>[-17.0%, 7.7%]</sub> | -0.027 <sub>[-0.089, 0.033]</sub> | 0 |
| vanilla-opus | 38.1% <sub>[32.0%, 44.6%]</sub> | 76.6% <sub>[71.0%, 82.3%]</sub> | 26.0% <sub>[18.0%, 34.2%]</sub> | 29.5% <sub>[18.5%, 40.4%]</sub> | 0.213 <sub>[0.156, 0.270]</sub> | 0 |

**Paired difference vs `vanilla-opus`** (same tests; 95% bootstrap CI; excludes 0 = significant)

| Arm | Winner = our #1 | Winner in our top 3 | Gain captured (#1) | Gain captured (top 3) | Kendall τ |
|---|---|---|---|---|---|
| pipeline-v1 | -16.0 <sub>[-23.4, -8.2]</sub> **✓** | -14.3 <sub>[-20.8, -7.4]</sub> **✓** | -26.8 <sub>[-37.1, -17.0]</sub> **✓** | -33.9 <sub>[-47.6, -20.5]</sub> **✓** | -0.240 <sub>[-0.311, -0.173]</sub> **✓** |

Percent metrics are differences in percentage points.

## test split: 400 tests (4.6 headlines on average)

| Arm | Winner = our #1 | Winner in our top 3 | Gain captured (#1) | Gain captured (top 3) | Kendall τ | Missing/invalid |
|---|---|---|---|---|---|---|
| *chance* | 22.5% | 67.4% | 0% | 0% | 0.000 | |
