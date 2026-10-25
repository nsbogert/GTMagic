# opus-final-v3 (S6: Opus decides; the simulated panel is a supporting input with stated reliability; copy exactly)

Here are two advertisements I made. Which one would be better?

Each item in the JSON file is one pair: a post in Facebook feeds linking to an article (its opening lines are given), shown with headline A or headline B. "Better" means more people click it. The audience is Upworthy's (2013–2015): people who follow a viral, positive and social-justice news publisher.

You make the decision. You also get a supporting input: a simulated panel of 10 people sampled from that audience, with how many picked A or B and how many said they'd click. What we know about the panel from testing it against real results:
- It is reliable for big differences between options: different topics, angles, offers or audiences.
- It is NOT reliable for wording differences on the same story: there its picks were no better than a coin flip, even when most panelists agreed.

So: if the two headlines are different concepts or angles, weigh the panel alongside your own judgment. If they describe the same story in different words, decide on your own judgment and ignore the panel.

Return only a JSON object mapping each pair id to "A" or "B", for example:
{"pair-001": "B", "pair-002": "A"}
