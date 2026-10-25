/* The chat-led run, following the gtm-intake session flow (docs/skills/INTAKE.md):
   one-liner → frozen baseline → question rounds → research → check together → save file,
   then the message test. Business facts come from intake.json; the owner's lines from
   demo-script.js. No backend yet: timers stand in for the live skill. */
(function () {
  const { h, icon, bot, me, typing, notice, setGroups, groupFig } = window.R;
  const RI = window.RI;
  const S = window.DEMO_SCRIPT;
  const INTAKE_URL = "../fixtures/demo/intake.json";
  const thread = document.getElementById("thread");
  const form = document.getElementById("composer");
  const input = document.getElementById("composer-input");
  const send = form.querySelector(".send");
  const note = document.getElementById("composer-note");
  const badge = document.getElementById("example-badge");
  const del = document.getElementById("delete-run");
  const legend = document.getElementById("legend");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? Math.min(ms, 150) : ms));

  let intake = null;
  let simRun = null;
  let phase = "loading";
  let failOnce = location.hash === "#error";

  const scroll = (el) => el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  function add(el) { thread.append(el); scroll(el); return el; }
  async function say(build, ms = 650) {
    const t = add(typing());
    await wait(ms);
    const el = build();
    t.replaceWith(el);
    scroll(el);
    return el;
  }
  function composer(placeholder, enabled = true) {
    input.placeholder = placeholder;
    input.disabled = send.disabled = !enabled;
    note.hidden = !enabled;
  }
  function step(name, state) { const li = document.querySelector(`#steps [data-step="${name}"]`); if (li) li.dataset.state = state; }
  const ask = (lines) => bot(h("ol", { class: "asks" }, lines.map((l) => h("li", {}, l))));

  // ---------- Intro ----------
  function intro(extra) {
    phase = "intro";
    thread.replaceChildren();
    badge.hidden = del.hidden = true;
    legend.replaceChildren(h("li", { class: "legend-empty" }, "Groups appear here once research finishes."));
    document.querySelectorAll("#steps li").forEach((li) => delete li.dataset.state);
    if (extra) add(extra);
    const turn = add(bot(
      h("p", { class: "lede" }, "Find out who will buy from you, and what to say to them."),
      h("p", {}, "Describe your business and answer a few questions. I'll research how real customers talk, sort out who to target, then test your best lines on a crowd of simulated customers."),
      h("div", { class: "actions" },
        h("button", { class: "btn", type: "button", onclick: runExample }, "Try an example"),
        h("button", { class: "btn secondary", type: "button", onclick: () => input.focus() }, "Describe my business")),
      h("div", { class: "waiting", "aria-hidden": "true" },
        Array.from({ length: 4 }, () => h("div", { class: "figs" }, Array.from({ length: 12 }, () => h("span", { class: "fig" }, R.figure())))),
        h("p", {}, "48 simulated customers, one figure each. They pick blind, and the counts decide."))));
    turn.classList.add("static");
    composer("Your business in one line");
  }

  function begin() {
    phase = "busy";
    thread.querySelector(".turn.static .actions")?.remove();
    composer("", false);
    del.hidden = false;
  }

  // ---------- The interview (example) ----------
  async function runExample() {
    if (phase !== "intro") return;
    begin();
    badge.hidden = false;
    step("describe", "running");
    add(me(S.oneLiner));
    step("describe", "done");
    return interview();
  }

  async function interview() {
    step("guess", "running");
    await say(() => bot(h("p", {}, "Before I look anything up, here's what a plain AI would guess. I've frozen it so we can compare at the end.")));
    add(RI.baselinePlate(intake.baseline));
    step("guess", "done");

    step("answers", "running");
    for (const [ri, round] of S.rounds.entries()) {
      await say(() => ask(round.ask), 700);
      for (const a of round.answers) {
        await wait(500);
        add(me(a.me, a.file && h("span", { class: "file" }, icon("i-copy"), a.file)));
        if (a.followUp) {
          await say(() => bot(h("p", {}, a.followUp)));
          await wait(500);
          add(me(a.clear));
        }
      }
      if (ri === 1 && intake.priorExperiments.length) {
        await say(() => bot(h("p", {}, "I read your file. Code judged each campaign, not my impression:")));
        add(RI.adsPlate(intake.priorExperiments, intake.business));
      }
    }
    await say(() => bot(h("p", {}, "Here's how I've sorted what you told me. Research can question a must-have once; after that it stands.")));
    add(RI.constraintsPlate(intake.constraints));
    step("answers", "done");
    return research();
  }

  async function research() {
    step("research", "running");
    const count = h("b", {}, "0");
    await say(() => bot(h("p", {}, "Researching how customers in this market talk."), h("p", { class: "research-count" }, count, " pieces of evidence so far")));
    for (let k = 1; k <= intake.evidence.length; k++) { await wait(90); count.textContent = k; }
    if (failOnce) return researchFailed();
    await say(() => bot(h("p", {}, S.sendBack.ask)));
    await wait(500);
    add(me(S.sendBack.me));
    setGroups(intake.segments);
    fillLegend();
    await say(() => bot(h("p", {}, "Here's who is out there, in their own words.")));
    add(RI.researchPlate(intake));
    step("research", "done");
    return check();
  }

  async function researchFailed() {
    step("research", "failed");
    add(notice("Research didn't finish.", "The web search timed out. Your answers are kept; trying again starts research over.", "error"));
    add(bot(h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: (e) => { e.currentTarget.closest(".turn").remove(); failOnce = false; research(); } }, "Try again"))));
  }

  async function check() {
    step("check", "running");
    await say(() => bot(h("p", {}, "What the evidence says, and where I tried to prove it wrong.")));
    add(RI.evidencePlate(intake));
    const pushed = intake.constraints.find((c) => c.pushback);
    if (pushed) {
      await say(() => bot(h("p", {}, S.pushbackAsk)));
      await wait(500);
      add(me(S.pushbackReply));
      await say(() => bot(h("p", {}, pushed.pushback.ownerKept ? "Settled. I won't raise it again." : "Updated.")));
    }
    const guess = intake.segments.find((s) => s.isOwnerGuess);
    const other = intake.segments.find((s) => !s.isOwnerGuess);
    if (guess && other) {
      await say(() => bot(h("p", {}, `Research points to a group you didn't name: ${other.name.toLowerCase()}. Your first guess was ${guess.name.toLowerCase()}. How would you rank them?`)));
      await wait(500);
      add(me(S.rankReply));
    }
    step("check", "done");

    step("save", "running");
    await say(() => bot(h("p", {}, "Here's your save file. Read it back and tell me if it's right.")));
    add(RI.briefPlate(intake, download));
    await wait(700);
    add(me(S.confirm));
    step("save", "done");
    return test();
  }

  // ---------- The message test ----------
  async function test() {
    step("test", "running");
    simRun = window.buildSim(intake);
    await say(() => bot(h("p", {}, `Now your ${simRun.messages.length} lines go to ${simRun.size} simulated customers built from these groups.`)));
    const c = window.Crowd.crowdPlate(intake, simRun, async () => {
      step("test", "done");
      step("results", "running");
      await wait(700);
      add(window.Crowd.resultsPlate(intake, simRun));
      step("results", "done");
      add(bot(h("p", {}, "Ask me anything about these results or your save file.")));
      phase = "done";
      composer("Ask about the results");
    });
    add(c.el);
    c.start();
  }

  function fillLegend() {
    legend.replaceChildren(...intake.segments.map((s) =>
      h("li", {}, groupFig(s.id), h("span", {}, s.name, s.isOwnerGuess && h("span", { class: "guess" }, "Your first guess")))));
  }

  async function followUp(q) {
    const t = q.toLowerCase();
    const top = intake.segments.find((s) => s.ownerRank === 1) || intake.segments[0];
    const guess = intake.segments.find((s) => s.isOwnerGuess);
    const lines = intake.roughMessaging;
    const reply = /guess|first|beginner|starter/.test(t) && guess
      ? `Your first guess was ${guess.name.toLowerCase()}. ${intake.findings.find((f) => f.segmentId === guess.id)?.claim || ""}`
      : /worr|concern|objection/.test(t)
        ? `For ${top.name.toLowerCase()}, the most common worry was ${intake.concerns.find((c) => c.id === top.concernBundles[0]?.concernIds[0])?.label.toLowerCase()} (${top.concernBundles[0]?.observedCount} times in the evidence).`
        : `Start with ${top.name.toLowerCase()} and the line “${lines[0].headline}”. Treat it as a guess to test, not proof.`;
    await say(() => bot(h("p", {}, reply), h("p", { class: "sub" }, "From your save file and this run's counts. Simulated customers suggest what to test; they don't prove it.")), 800);
  }

  function download() {
    const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(intake, null, 2)], { type: "application/json" })), download: "intake.json" });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  del.addEventListener("click", () => intro(notice("Run deleted.", "Everything from that run is gone from this page.")));

  // ---------- Composer ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || input.disabled) return;
    input.value = ""; input.style.height = "";
    if (phase === "intro") {
      begin();
      step("describe", "running"); add(me(text)); step("describe", "done");
      await say(() => bot(h("p", {}, "Thanks. This prototype has no backend yet, so I'll walk you through the example business instead: KeepStrong, a fictional app.")));
      badge.hidden = false;
      return interview();
    }
    if (phase === "done") { add(me(text)); followUp(text); }
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = input.scrollHeight + 4 + "px"; });

  // ---------- Load the save file ----------
  thread.append(typing());
  fetch(INTAKE_URL)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => { intake = data; intro(); })
    .catch(() => {
      thread.replaceChildren(notice("Couldn't load the example save file.", `Serve the repo root (not prototype/) so ${INTAKE_URL} resolves, then reload.`, "error"));
      composer("", false);
    });
})();
