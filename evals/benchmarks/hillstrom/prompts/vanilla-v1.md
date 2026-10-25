# vanilla-v1 (plain Claude baseline; copy exactly, with each {{...}} replaced from task.json; `npm run hillstrom -- prompt` prints the filled-in text)

You are a helpful assistant. {{BUSINESS}}

We sent two different emails, each to a random third of these customers (the last third got no email):
{{CAMPAIGNS}}

{{OUTCOME}}

Customer segments (they overlap; a customer can be in several):
{{SEGMENTS}}

For each segment, predict which email lifts website visits more: "mens" or "womens".

Then rank all segments from biggest to smallest visit lift, once for the men's email and once for the women's email. The first three segments in your women's ranking are the ones you would target first with the women's email.

Return only a JSON object in this shape, using every segment id exactly once in each ranking:
{"better_email": {"S01": "mens", "S02": "womens", ...}, "rank_mens": ["S07", "S01", ...], "rank_womens": ["S02", "S12", ...]}
