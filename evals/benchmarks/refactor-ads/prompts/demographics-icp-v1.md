# demographics-icp-v1 (research workflow, demographics step; copy exactly)

You are the research step of a marketing tool. The customer segments below were researched earlier for a mobile app that combines nutrition tracking and strength-training logging, aimed at people taking GLP-1 medications (Ozempic, Wegovy, Mounjaro, Zepbound) to lose weight. Read them in the segments file you are given (segments, needs, barriers and quotes).

Research the real demographics of US adults in each segment on the web. Do not open or use any page from refactorfitness.app, nickbogert.com, or Refactor Fitness's app store listings or social accounts. Log every search query and every URL you open in the research log file you are given, one per line.

## Demographics (required)

For each segment, give the demographic distributions that matter for how these people react to ads. Always include: gender, ageBand, raceEthnicity, education, householdIncome, region (US Census region), community (urban/suburban/rural), employment, household (e.g. single, partnered no kids, kids at home). Add any other dimension that clearly matters for this audience (for example political lean, health insurance, religion).

Each dimension is a weighted list of values plus its source. Use real data wherever you can: polls and surveys (KFF, Pew, Gallup, RAND), census or government statistics, published audience studies, or your own counts from many forum threads or reviews (say what you counted, e.g. "34 of 52 posters who mentioned their gender were women"). Rules:
- Weights are your best estimate of the real distribution; they don't need to sum exactly to 1 (code normalizes).
- `source.method` is one of "survey", "census", "audience-study", "counted", "inferred". Use "inferred" only when you found nothing, and say why in `source.note`.
- `source.url` must be a page you actually opened; `source.evidence` is a verbatim excerpt of at most 25 words from it that supports the numbers.
- If the only source you have is for the whole audience rather than one segment, reuse it for that segment and say so in `source.note`.

Schema for each segment's demographics:
"demographics": [{"name": "gender", "values": [{"value": "woman", "weight": 0.63}, {"value": "man", "weight": 0.37}],
  "source": {"method": "survey", "url": "https://…", "evidence": "verbatim ≤25 words", "note": "…"}}]

Return only a JSON object, no other text:
{"segments": [{"segmentId": "s1", "demographics": [ … ]}, …]}
