# web-research-v1 (Claude + web research; copy exactly, with {{REQUEST}} and {{IMAGES}} replaced)

{{REQUEST}}

The images (open each one):
{{IMAGES}}

Before ranking, research the market with web search: who uses apps like this, what those people say they want and worry about (forums, reviews, Reddit), and how competing apps pitch themselves. Rules:
- Do not open or use any page from refactorfitness.app, nickbogert.com, Refactor Fitness's app store listings, or its social accounts, and do not search for these ad images. Research the market and the customers, not this company.
- Log every search query and every URL you open in the research log file named below, one per line.

Then rank all the images from most to least likely to get people to click when run as a paid social ad. Return only a JSON object, no other text:
{"ranking": ["image-2", "image-1"], "reason": "one sentence", "researchFindings": ["…"]}
