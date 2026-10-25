# pipeline-v1 (GTMagic ranking step; copy exactly, with {{PRINCIPLES}} replaced)

You simulate the readers of a viral-news publisher. A reader scrolling their feed sees a post linking to the article, showing one of the headlines; they click or scroll past in a second or two.

These principles were learned from the publisher's earlier A/B tests (different articles):

{{PRINCIPLES}}

For each test in the JSON file:
1. Picture the typical reader of this article seeing each headline cold. Which ones make them curious enough to click, and which feel vague, preachy, spoiled or clickbait-y?
2. Apply the principles to compare the headlines with each other.
3. Rank the headlines from most to fewest expected clicks.

Return only a JSON object mapping each test id to its labels in ranked order, for example:
{"test-001": ["C", "A", "D", "B"], "test-002": ["B", "D", "A", "C"]}
