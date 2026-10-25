# Demo owner script: KeepStrong

> **FICTIONAL. Every person, business, number and source in this file is made up for the GTMagic demo.** KeepStrong, its owner, "TrackAll" and all ad results are invented. Nothing here describes a real company or real people.

In demo mode (`mode: "demo"`), the `gtm-intake` skill plays the interviewer and reads the owner's answers from this file instead of waiting for a person. The answers must produce `fixtures/demo/intake.json`. The prior ad results are in `fixtures/demo/meta-ads.csv`.

**How to use it:** ask the questions in your own words, in roughly this order. Where an answer is marked *vague*, run the vagueness check (one concrete follow-up) and use the owner's clearer answer. Each topic notes the field it feeds.

---

## 1. One-liner (frozen first, for the baseline)

**Owner:** "A fitness app for people on GLP-1s."

→ `baseline.ownerFirstDescription`. Freeze it and run the baseline prompt before reading anything else.

## Session 1

### What you sell
**Owner:** "It's called KeepStrong. Short strength workouts, about 20 minutes, plus protein tracking. The idea is you keep your muscle while the weight comes off on the medication. The website's at example.com/keepstrong."

→ `business.description`, `business.websiteUrl`

### Price
**Owner:** "$14.99 a month. That's not changing, so don't plan around a different price."

→ `business.pricing` (USD 14.99/month, 12 purchases a year); price constraint, **locked**

### Traction
**Owner:** "We launched in the spring. Around 90 paying subscribers, mostly friends of friends and a couple of Facebook groups."

→ `business.stage: "launched"`

### Revenue goal
**Owner** *(vague)*: "I want it to be a real business, not a hobby."

**Skill follow-up:** "What revenue in the next 12 months would make it feel real?"

**Owner:** "$180,000 in the next 12 months."

→ `business.revenueGoal12mo: 180000`

### What a sign-up is worth
**Owner:** "I can pay about $40 to get someone to sign up. More than that and the math doesn't work."

→ `business.targetCpa: 40`

### What you've tried
**Owner:** "Two Meta campaigns in September. I exported them, it's the meta-ads.csv. The muscle one did okay, I think? The GLP-1 one flopped."

→ `priorExperiments` px_1 and px_2, read from `meta-ads.csv`. The script decides the verdicts, not the owner's impression.

### What people use instead
**Owner:** "Mostly TrackAll, the big calorie tracker. Or free workout videos online. A lot of people just do nothing structured."

→ `hypotheses[].insteadOf`, `serviceability.incumbents`

### Who it's for (the owner's first guess)
**Owner** *(vague)*: "Honestly? Everyone on these meds."

**Skill follow-up:** "If you could only reach one group of people on these medications next month, who would it be, and what are they doing today?"

**Owner:** "People who just started the medication and are new to fitness. They've never really followed a plan, and they don't know where to start. Right now they're watching free videos, or doing nothing."

→ the owner's guess: `hyp_2` and `seg_2` "New-to-fitness medication starters" (`isOwnerGuess: true`)

### Why people buy
**Owner** *(vague)*: "They want to feel better."

**Skill follow-up:** "What's something a subscriber has actually said or done that told you it was working?"

**Owner:** "A couple of them told me they'd noticed they were getting weaker, carrying groceries, that kind of thing, and they were scared of losing muscle. And everyone's scared of gaining it back once they stop the medication."

→ `hypotheses[].motivation`; research question on muscle-loss worry

### Where
**Owner:** "US only. We can't take payments anywhere else yet."

→ geography, **locked** (`US`)

### Age
**Owner:** "35 to 64. Younger people aren't really our customer, and I don't want to deal with Medicare-age stuff."

→ age range 35–64, **locked** (targeting)

### Health and targeting limits
**Skill:** "Ad platforms don't let you target people by a health condition or a medication, so we'll never aim ads at 'people on GLP-1s.' Research can still study that group. Is that OK?"

**Owner:** "Yes, that makes sense."

→ `healthCondition`, **locked**: no targeting by medication or diagnosis (source: inferred, owner agreed)

### Ad copy rules
**Owner:** "My lawyer was really clear: no medical claims, and never name the drugs by brand in an ad."

→ `regulatory`, **locked** (messaging): no medical claims, no drug brand names

### Channels
**Owner:** "Meta, because I know how it works. And Reddit, because that's where these folks actually talk. I'm open to others if you find a reason."

→ `channel`, **preference** (`meta`, `reddit`)

### Interests
**Owner:** "Strength training and weight loss. Those are the two things they care about."

→ `interest`, **hypothesis** (`strength training`, `weight loss`)

### Men or women
**Owner:** "I don't know. Probably more women? I don't want to rule anyone out."

→ `sex`, **unknown**; goes to `openQuestions`

---

## Research turn (between sessions)

The skill runs its capped research turn here. In demo mode, the evidence is the fictional `evidence[]` already in `intake.json`.

**Send-back the skill asks before session 2:** "Lots of free apps and videos already target beginners. Is your user mainly protecting muscle, or mainly losing weight?"

**Owner:** "Protecting muscle, if I'm honest. The weight is happening anyway on the medication."

## Session 2

### Findings and the counter-case
The skill shows the two customer groups, what they worry about, the real quotes, the ad results, and the skeptic's counter-case.

**Owner:** "Huh. So the muscle ad was the one that actually worked."

### One pushback on a must-have (age)
**Skill:** "Based on a survey, we estimate about a quarter of US adults on these medications are 25 to 39. Do you want to keep ads limited to 35 to 64?" *(cites ev_15 and the `int_1` age estimate)*

**Owner:** "Keep it at 35 to 64. That's who I built it for."

→ age `pushback: { evidenceIds: ["ev_15"], ownerKept: true }`. Age is never raised again.

### Ranking the customer groups
**Skill:** "Research points to a group you didn't name: **midlife strength protectors**, adults 40–60 losing weight on medication who care more about staying strong than the number on the scale. Your original group is new-to-fitness medication starters. How would you rank them?"

**Owner:** "Midlife strength protectors first. That's exactly the people who email me. The beginners second, maybe later."

→ `seg_1` `ownerRank: 1`; `seg_2` `ownerRank: 2`

### Confirming the brief
**Skill:** reads back the target customer sentence, the must-haves, the disqualifier and the four message lines.

**Owner:** "Yes, that's it. Lock it in."

→ readiness check "Owner confirmed the brief" passes
