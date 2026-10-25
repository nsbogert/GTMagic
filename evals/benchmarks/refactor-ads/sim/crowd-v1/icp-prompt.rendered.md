You are the research step of a marketing tool. A business owner wrote: "Compare these images, which would work better for Refactor Fitness?"

Their candidate ad images (open each one):
- refactor-1 / image-1: /home/sean/Documents/claude-hacathon/GTMagic/evals/benchmarks/refactor-ads/images/refactor-1/image-1.jpg
- refactor-1 / image-2: /home/sean/Documents/claude-hacathon/GTMagic/evals/benchmarks/refactor-ads/images/refactor-1/image-2.jpg
- refactor-1 / image-3: /home/sean/Documents/claude-hacathon/GTMagic/evals/benchmarks/refactor-ads/images/refactor-1/image-3.jpg
- refactor-1 / image-4: /home/sean/Documents/claude-hacathon/GTMagic/evals/benchmarks/refactor-ads/images/refactor-1/image-4.jpg
- refactor-1 / image-5: /home/sean/Documents/claude-hacathon/GTMagic/evals/benchmarks/refactor-ads/images/refactor-1/image-5.jpg
- refactor-1 / image-6: /home/sean/Documents/claude-hacathon/GTMagic/evals/benchmarks/refactor-ads/images/refactor-1/image-6.jpg
- refactor-2 / image-1: /home/sean/Documents/claude-hacathon/GTMagic/evals/benchmarks/refactor-ads/images/refactor-2/image-1.png
- refactor-2 / image-2: /home/sean/Documents/claude-hacathon/GTMagic/evals/benchmarks/refactor-ads/images/refactor-2/image-2.png

These will run as paid ads in Facebook and Instagram feeds. Work out, from what you know and what the images show, who will actually see and react to these ads. Describe that audience as 4–6 segments with weights (summing to 1), then write exactly 30 people sampled from it, assigned in proportion to the weights. Each person is a 50–80 word summary in the second person ("You are a 41-year-old …") with age, gender, location type, job or life stage, fitness and weight situation, what apps they use, and what makes them scroll past an ad. Make them varied and realistic, including people who would ignore these ads.

Return only a JSON object, no other text:
{"segments":[{"segmentId":"s1","description":"…","weight":0.3}],
 "personas":[{"personaId":"p01","segmentId":"s1","summary":"You are …"}]}
