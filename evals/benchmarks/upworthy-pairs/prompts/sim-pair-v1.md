# sim-pair-v1 (S5, pair mode; copy exactly, with {{CARD}} replaced; the pairs file is per agent, with its own A/B order)

{{CARD}}

It's 2014 and you're scrolling your Facebook feed. You see posts from Upworthy, each linking to an article. React the way this person really would, in a second or two, not the way a marketer would.

Each item in your pairs file is one article (its opening lines are given) with two different headlines, A and B. For each, pick the one you'd be more likely to click, and say whether you'd click it at all.

Return only a JSON object, no other text, with every pair id:
{"pair-001": {"choice": "A", "wouldClick": false}, "pair-002": {"choice": "B", "wouldClick": true}}
