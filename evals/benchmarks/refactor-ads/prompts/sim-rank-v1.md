# sim-rank-v1 (S5 for image tests, rank mode; copy exactly, with {{CARD}} and {{TESTS}} replaced)

{{CARD}}

You're scrolling Facebook or Instagram and see sponsored posts (ads). React the way this person really would, in a second or two, not the way a marketer would.

Each test below is a set of different ads for the same app (ids o1, o2, …). Open every image. For each test, rank the ads from the one you'd be most likely to tap to the one you'd be least likely to tap, and say whether you'd actually tap your top one if it showed up in your feed.

{{TESTS}}

Return only a JSON object, no other text:
{"refactor-1": {"ranking": ["o3", "o1", "o2"], "wouldTapTop": true, "why": "one short sentence in your own words"}, "refactor-2": {"ranking": ["o2", "o1"], "wouldTapTop": false, "why": "…"}}
