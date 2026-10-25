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
| pipeline-v2-ensemble | 35.9% <sub>[29.9%, 42.0%]</sub> | 73.2% <sub>[67.1%, 79.2%]</sub> | 21.2% <sub>[13.0%, 29.4%]</sub> | 22.1% <sub>[10.6%, 33.0%]</sub> | 0.152 <sub>[0.097, 0.211]</sub> | 0 |
| pipeline-v2-screen | 44.6% <sub>[38.1%, 50.6%]</sub> | 81.4% <sub>[76.2%, 86.1%]</sub> | 33.6% <sub>[25.5%, 41.9%]</sub> | 40.0% <sub>[30.0%, 49.4%]</sub> | 0.250 <sub>[0.198, 0.301]</sub> | 0 |
| vanilla-opus | 38.1% <sub>[32.0%, 44.6%]</sub> | 76.6% <sub>[71.0%, 82.3%]</sub> | 26.0% <sub>[18.0%, 34.2%]</sub> | 29.5% <sub>[18.5%, 40.4%]</sub> | 0.213 <sub>[0.156, 0.270]</sub> | 0 |

**Paired difference vs `vanilla-opus`** (same tests; 95% bootstrap CI; excludes 0 = significant)

| Arm | Winner = our #1 | Winner in our top 3 | Gain captured (#1) | Gain captured (top 3) | Kendall τ |
|---|---|---|---|---|---|
| pipeline-v1 | -16.0 <sub>[-23.4, -8.2]</sub> **✓** | -14.3 <sub>[-20.8, -7.4]</sub> **✓** | -26.8 <sub>[-37.1, -17.0]</sub> **✓** | -33.9 <sub>[-47.6, -20.5]</sub> **✓** | -0.240 <sub>[-0.311, -0.173]</sub> **✓** |
| pipeline-v2-ensemble | -2.2 <sub>[-8.7, +4.3]</sub> | -3.5 <sub>[-9.1, +3.0]</sub> | -4.8 <sub>[-13.4, +3.2]</sub> | -7.5 <sub>[-19.6, +4.2]</sub> | -0.061 <sub>[-0.116, -0.012]</sub> **✓** |
| pipeline-v2-screen | +6.5 <sub>[+0.4, +12.6]</sub> **✓** | +4.8 <sub>[-0.4, +10.0]</sub> | +7.6 <sub>[-0.0, +15.1]</sub> | +10.5 <sub>[-1.0, +21.7]</sub> | +0.037 <sub>[-0.012, +0.083]</sub> |

Percent metrics are differences in percentage points.

## test split: 400 tests (4.6 headlines on average)

| Arm | Winner = our #1 | Winner in our top 3 | Gain captured (#1) | Gain captured (top 3) | Kendall τ | Missing/invalid |
|---|---|---|---|---|---|---|
| *chance* | 22.5% | 67.4% | 0% | 0% | 0.000 | |
| pipeline-v2-screen | 47.0% <sub>[42.3%, 52.0%]</sub> | 86.0% <sub>[82.5%, 89.3%]</sub> | 34.9% <sub>[28.8%, 41.1%]</sub> | 41.6% <sub>[33.4%, 49.1%]</sub> | 0.290 <sub>[0.246, 0.334]</sub> | 0 |
| vanilla-opus | 45.3% <sub>[40.3%, 50.0%]</sub> | 86.0% <sub>[82.5%, 89.3%]</sub> | 33.7% <sub>[27.9%, 39.9%]</sub> | 43.1% <sub>[35.7%, 50.1%]</sub> | 0.282 <sub>[0.239, 0.327]</sub> | 0 |

**Paired difference vs `vanilla-opus`** (same tests; 95% bootstrap CI; excludes 0 = significant)

| Arm | Winner = our #1 | Winner in our top 3 | Gain captured (#1) | Gain captured (top 3) | Kendall τ |
|---|---|---|---|---|---|
| pipeline-v2-screen | +1.8 <sub>[-3.3, +6.8]</sub> | +0.0 <sub>[-3.5, +3.8]</sub> | +1.2 <sub>[-5.1, +7.6]</sub> | -1.6 <sub>[-9.0, +6.2]</sub> | +0.008 <sub>[-0.033, +0.047]</sub> |

Percent metrics are differences in percentage points.
