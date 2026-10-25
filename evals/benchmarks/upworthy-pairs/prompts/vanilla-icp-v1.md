# vanilla-icp-v1 (plain Claude, told the ICP; copy exactly)

Here are two advertisements I made. Which one would be better?

They run as posts in Facebook feeds, aimed at Upworthy's audience (2013–2015): people who follow a viral, positive and social-justice news publisher and share its stories.

Each item in the JSON file is one pair: a post linking to an article (its opening lines are given), shown with headline A or headline B. "Better" means more of these people click it.

Return only a JSON object mapping each pair id to "A" or "B", for example:
{"pair-001": "B", "pair-002": "A"}
