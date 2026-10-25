/* The demo conversation, from fixtures/demo/intake-script.md, as an ordered list of events.
   FICTIONAL: KeepStrong, its owner and every answer are invented for the demo.
   Business facts and every number shown in cards come from intake.json, not from here.
   Event kinds: ask (numbered questions), me (owner), bot (skill line; a function gets the intake),
   plate (a card built from intake.json). */
window.DEMO_SCRIPT = {
  oneLiner: "A fitness app for people on GLP-1s.",
  interview: [
    { ask: ["What do you sell, and what does a customer get on day one?", "What does it cost?", "What's the least revenue you need in the next 12 months?"] },
    { me: "It's called KeepStrong. Short strength workouts, about 20 minutes, plus protein tracking. The idea is you keep your muscle while the weight comes off on the medication. $14.99 a month, and that's not changing." },
    { bot: "On average, how many payments does a customer make in their first year, counting people who cancel early?" },
    { me: "About 9. A few drop off after a couple of months." },
    { me: "Enough that it's a real business, not a hobby." },
    { bot: "What's the least you'd need coming in over the next 12 months to keep the business going? One dollar figure is fine." },
    { me: "At least $180,000 a year. Below that, it's a hobby." },

    { ask: ["Do you know the most you can spend on ads to win one new paying customer?"] },
    { me: "Honestly, no. I've never worked it out." },
    { bot: "Let's back into it. You charge $14.99 a month and a customer pays about 9 times in their first year. First, what does it cost you to serve a customer: payment fees, hosting and software, support, the coaching content? Roughly what share of what they pay is that?" },
    { me: "Payment fees, hosting and the coach who writes the programs... maybe 30% all in." },
    { bot: (intake, R) => {
        const ue = intake.business.unitEconomics;
        return ue?.breakEvenCac != null
          ? `Then you break even in year one if a new customer costs less than ${R.money(ue.breakEvenCac, intake.business.pricing?.currency)}. Knowing that, what share of a customer's first-year revenue do you want to spend to win them, keeping some margin for yourself?`
          : "What share of a customer's first-year revenue do you want to spend to win them, keeping some margin for yourself?";
      } },
    { me: "I'll cap it at 40% of their first year, so I keep some margin." },
    { plate: "economics" },

    { ask: ["What have you tried already? If you ran ads, share the export.", "If you could reach only one group next month, who would it be?"] },
    { me: "Two Meta campaigns in September, here's the export. The muscle one did okay, I think? The GLP-1 one flopped.", file: "meta-ads.csv" },
    { bot: "Were those sign-ups paying customers, or free trials?" },
    { me: "Paying. We don't have a free trial." },
    { plate: "ads" },
    { me: "Honestly? Everyone on these meds." },
    { bot: "If you could only reach one group of people on these medications next month, who would it be, and what are they doing today?" },
    { me: "People who just started the medication and are new to fitness. They don't know where to start. Right now they're watching free videos, or doing nothing." },

    { ask: ["Where are your customers?", "Any age limits?", "Any rules for your ads?", "Which channels do you want to use?"] },
    { me: "US only. 35 to 64. My lawyer says no medical claims and never name the drugs. Meta and Reddit, open to others if you find a reason." },
    { bot: "Here's how I've sorted what you told me. Research can question a must-have once; after that it stands." },
    { plate: "constraints" },
  ],
  sendBack: {
    ask: "Lots of free apps and videos already target beginners. Is your user mainly protecting muscle, or mainly losing weight?",
    me: "Protecting muscle, if I'm honest. The weight is happening anyway on the medication.",
  },
  pushbackAsk: "One question about a must-have. A survey suggests about a quarter of US adults on these medications are 25 to 39. Do you want to keep ads limited to 35 to 64?",
  pushbackReply: "Keep it at 35 to 64. That's who I built it for.",
  rankReply: "Midlife strength protectors first. That's exactly the people who email me. The beginners second, maybe later.",
  confirm: "Yes, that's it. Lock it in.",
};
