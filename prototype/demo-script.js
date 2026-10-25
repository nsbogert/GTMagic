/* The demo owner's side of the conversation, from fixtures/demo/intake-script.md.
   FICTIONAL: KeepStrong, its owner and every answer are invented for the demo.
   Business facts shown in cards come from intake.json, not from here. */
window.DEMO_SCRIPT = {
  oneLiner: "A fitness app for people on GLP-1s.",
  rounds: [
    {
      ask: ["What do you sell, and what does a customer get on day one?", "What does it cost?", "What revenue would make the next 12 months a success?"],
      answers: [
        { me: "It's called KeepStrong. Short strength workouts, about 20 minutes, plus protein tracking. The idea is you keep your muscle while the weight comes off on the medication. $14.99 a month, and that's not changing." },
        { me: "I want it to be a real business, not a hobby.", followUp: "What revenue in the next 12 months would make it feel real?", clear: "$180,000 in the next 12 months." },
      ],
    },
    {
      ask: ["What's the most you'd pay in ads for one new sign-up?", "What have you tried already? If you ran ads, share the export.", "If you could reach only one group next month, who would it be?"],
      answers: [
        { me: "About $40. Two Meta campaigns in September, here's the export. The muscle one did okay, I think? The GLP-1 one flopped.", file: "meta-ads.csv" },
        { me: "Honestly? Everyone on these meds.", followUp: "If you could only reach one group of people on these medications next month, who would it be, and what are they doing today?", clear: "People who just started the medication and are new to fitness. They don't know where to start. Right now they're watching free videos, or doing nothing." },
      ],
    },
    {
      ask: ["Where are your customers?", "Any age limits?", "Any rules for your ads?", "Which channels, and men or women?"],
      answers: [
        { me: "US only. 35 to 64. My lawyer says no medical claims and never name the drugs. Meta and Reddit, open to others. Men or women, I don't know. Probably more women? I don't want to rule anyone out." },
      ],
    },
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
