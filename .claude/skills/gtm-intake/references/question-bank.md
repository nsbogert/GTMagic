# Question bank

Ask 2–4 questions at a time, numbered. Use the plain wording below with the owner; the "Fills" line is for you only.

Each topic has:
- **Ask:** the plain-language question.
- **If vague:** the one concrete follow-up, used only when the answer has no number, no named group or place, and no observable behavior. Still vague after it: record a hypothesis at confidence 1 plus a research question, and move on.
- **Good answer:** what a concrete answer looks like (examples are fictional).
- **Fills:** where the answer goes in `intake.json`.

"I don't know" is always fine: record `unknown` and move on.

---

## Offer

- **Ask:** "What do you sell, and what does a customer get on day one?"
- **If vague:** "If I bought it right now, what would I actually receive or do first?"
- **Good answer:** "A phone app. Day one you get a 20-minute strength plan and a daily protein target."
- **Fills:** `business.description`, `business.stage`.

## Traction

- **Ask:** "How many paying customers do you have today, and roughly how did the last few find you?"
- **If vague:** "Think of your last three customers. Where did each one first hear about you?"
- **Good answer:** "About 120 subscribers. Most of the recent ones came from a Facebook group post and two from a podcast mention."
- **Fills:** `business.stage`, owner-text evidence, `segments[].channels` leads.

## Goals: revenue

- **Ask:** "What revenue would make the next 12 months a success?"
- **If vague:** "If you had to write one dollar figure on a sticky note for next year, what would it be?"
- **Good answer:** "$180,000 in the next 12 months."
- **Fills:** `business.revenueGoal12mo` (same currency as pricing).

## Goals: price and purchases per year

- **Ask:** "What does a customer pay, and how many times a year do they pay it?"
- **If vague:** "What's the price on your checkout page today, and is it monthly, yearly, or one time?"
- **Good answer:** "$14.99 a month, so 12 payments a year if they stay."
- **Fills:** `business.pricing` (`amount`, `currency`, `period`, `purchasesPerYear`). The script uses this with the revenue goal for size math; don't do the math yourself.

## Target cost per sign-up

- **Ask:** "What's the most you'd happily pay in ads to get one new customer?"
- **If vague:** "If an ad brought you one paying customer for $20, would you be happy? What about $60?"
- **Good answer:** "Up to $40 per paying sign-up."
- **Fills:** `business.targetCpa`. Without it, the script marks every ad result inconclusive.

## What's been tried

- **Ask:** "What have you already tried to find customers, and what happened? If you've run ads, can you share the export?"
- **If vague:** "Pick the one thing you spent the most money or time on. What did you try, and roughly what came back?"
- **Good answer:** "Two Meta campaigns last spring, about $700 total. The muscle one got sign-ups; the general one barely did. Here's the CSV."
- **Fills:** `priorExperiments[]` (metrics copied from the file, campaign level only), owner-text evidence.

## Alternatives and who customers switch from

- **Ask:** "Before they found you, what were your customers using instead? Who do they switch away from?"
- **If vague:** "Name one app, product, person or habit a customer told you they stopped using when they started with you."
- **Good answer:** "Mostly a big calorie-tracking app. A few had a personal trainer they couldn't afford anymore."
- **Fills:** `hypotheses[].insteadOf`, `serviceability.incumbents` leads (verify in research), `currentSolution` attribute.

## Why people buy

- **Ask:** "What's usually going on in someone's life when they decide to buy?"
- **If vague:** "Think of one recent customer. What happened that week that made them sign up?"
- **Good answer:** "They notice they're weaker, like struggling with groceries, a few months into losing weight."
- **Fills:** `hypotheses[].motivation`, `serviceability.motivation`, research questions for concern mining.

---

## Today's targeting dimensions

Each answer becomes a `Constraint`. Listen for the bucket: "only" or "never" is a must-have (`locked`); "mostly" or "ideally" is a `preference`; a guess is a `hypothesis`; "not sure" is `unknown`. Geography and price can't stay unknown for `ready`.

### Geography

- **Ask:** "Where can you serve customers? Anywhere, one country, or a local area?"
- **If vague:** "Is there any place you couldn't take a customer from, like outside the US or more than 20 miles away?"
- **Good answer:** "US only, because of payments and support hours."
- **Fills:** `dimension: "geography"`, e.g. `include ["US"]`.

### Age

- **Ask:** "What ages are your customers, and are there ages you won't serve?"
- **If vague:** "Picture your three most typical customers. Roughly how old are they?"
- **Good answer:** "Mostly 40s and 50s. Must be 35 to 64 for the ads; we don't market to under-35s."
- **Fills:** `dimension: "age"`, e.g. `range` 35–64.

### Price

- **Ask:** "Is your price fixed for now, or open to change?"
- **If vague:** "If research said a lower price would sell more, would you change it this year?"
- **Good answer:** "Fixed at $14.99 a month for this year."
- **Fills:** `dimension: "price"` (usually `locked` when fixed).

### Channel

- **Ask:** "Where would you want to reach people: which ad platforms, communities, or places?"
- **If vague:** "If you could only run ads in one place next month, where would it be?"
- **Good answer:** "Meta first, maybe Reddit. Not TikTok."
- **Fills:** `dimension: "channel"`, with excludes for anything ruled out.

### Health and regulatory limits

- **Ask:** "Are there things you can't say or can't do, like health claims, naming a medication, or targeting people by a condition?"
- **If vague:** "Has a platform, lawyer or partner ever told you not to say something? Do you have permission to use any brand names?"
- **Good answer:** "No medical claims, and we can't name any drug brands."
- **Fills:** `dimension: "regulatory"` and `"healthCondition"`, usually `locked`, `appliesTo: "messaging"` or `"targeting"`. See the sensitive-topic rules in SKILL.md.

### Interests (up to 3 today)

- **Ask:** "What are your customers into, besides your product? Name up to three interests."
- **If vague:** "What groups, pages, or shows would your typical customer follow?"
- **Good answer:** "Weight loss, strength training, and high-protein cooking."
- **Fills:** `interests[]` (each with `researchDefinition` and `targetableProxies`), plus an `interest` constraint, usually `hypothesis`.

Every other dimension (sex, income, life stage, language, audience type) defaults to `unknown` today without asking.

---

## Send-back (narrowing) questions

Use these in session 2 when research finds the owner's target crowded or vague. The pattern:

1. **State the evidence** in one plain sentence, with a number only if it was copied from a source or computed by the script.
2. **Offer two concrete options** that would each narrow the group.
3. **Ask the owner to pick one,** or name a third.

**Example:** "Five well-rated apps already target GLP-1 fitness. Is your user mainly protecting muscle, or mainly losing weight?"

**Another example:** "Reviews of the big dog-grooming chains keep coming back to wait times, not price. Are your customers mainly busy professionals who want it done at home, or mainly people looking for the cheapest option?"

Record the answer as a sharpened hypothesis (or a must-have, if the owner says "only"), and cite the evidence IDs behind the question in that hypothesis's `evidenceIds`.
