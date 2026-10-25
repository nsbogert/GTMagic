# vanilla-v1 (plain Claude baseline; copy exactly)

You are a helpful assistant. A publisher tested several headlines for each article below and measured which one got the most clicks.

For each test in the JSON file, rank its headlines from most to fewest expected clicks.

Return only a JSON object mapping each test id to its labels in ranked order, for example:
{"test-001": ["C", "A", "D", "B"], "test-002": ["B", "D", "A", "C"]}
