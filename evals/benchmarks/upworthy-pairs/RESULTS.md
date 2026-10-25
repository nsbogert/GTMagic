## Upworthy pairs: 100 real A/B pairs (same image, two headlines, significant CTR difference)

| Arm | Picked the higher-CTR ad | 95% CI | Avg CTR of picked ad | Missing |
|---|---|---|---|---|
| chance | 50.0% | | 1.29% | |
| oracle | 100% | | 1.76% | |
| vanilla-opus | 68.0% | [58.0%, 77.0%] | 1.47% | 0 |
| vanilla-opus-icp | 63.0% | [53.0%, 72.0%] | 1.45% | 0 |
| icp-crowd (10 Sonnet, majority) | 51.0% | [41.5%, 61.0%] | 1.32% | 0 |

**Paired difference vs vanilla-opus** (percentage points, 95% bootstrap CI)

- vanilla-opus-icp: -5.0 [-12.0, +1.0]
- icp-crowd (10 Sonnet, majority): -17.0 [-27.5, -7.0] (significant)

Crowd: 10/10 agents; 0 invalid answers. When ≥70% of the crowd agreed (87 pairs), it was right 53%.
