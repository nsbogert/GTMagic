## Upworthy pairs: 100 real A/B pairs (same image, two headlines, significant CTR difference)

| Arm | Picked the higher-CTR ad | 95% CI | Avg CTR of picked ad | Missing |
|---|---|---|---|---|
| chance | 50.0% | | 1.29% | |
| oracle | 100% | | 1.76% | |
| vanilla-opus | 68.0% | [58.0%, 77.0%] | 1.47% | 0 |
| vanilla-opus-icp | 63.0% | [53.0%, 72.0%] | 1.45% | 0 |
| opus-synthesis | 55.0% | [45.0%, 65.0%] | 1.36% | 0 |
| icp-crowd v3 (10 Sonnet, own pain points, majority) | 53.0% | [43.5%, 62.5%] | 1.34% | 0 |

**Paired difference vs vanilla-opus** (percentage points, 95% bootstrap CI)

- vanilla-opus-icp: -5.0 [-12.0, +1.0]
- opus-synthesis: -13.0 [-22.0, -4.0] (significant)
- icp-crowd v3 (10 Sonnet, own pain points, majority): -15.0 [-25.0, -5.0] (significant)

Crowd: 10/10 agents; 0 invalid answers. When ≥70% of the crowd agreed (79 pairs), it was right 57%.
