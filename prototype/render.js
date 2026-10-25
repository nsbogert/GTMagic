/* DOM builders. All text goes in through textContent, never innerHTML:
   generated copy must render as text (src/app/README.md). */
(function () {
  const SVG = "http://www.w3.org/2000/svg";
  const NO_LINKS = new URLSearchParams(location.search).has("nolinks"); // for recordings (docs/skills/INTAKE.md)

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  function icon(name, cls) {
    const s = document.createElementNS(SVG, "svg");
    s.setAttribute("class", cls || "ic");
    s.setAttribute("aria-hidden", "true");
    const u = document.createElementNS(SVG, "use");
    u.setAttribute("href", "#" + name);
    s.append(u);
    return s;
  }
  const figure = () => icon("fig", "");

  // Customer groups get Isotype colours in owner-rank order.
  let groupClass = {};
  function setGroups(segments) {
    groupClass = Object.fromEntries([...segments].sort((a, b) => (a.ownerRank ?? 9) - (b.ownerRank ?? 9)).map((s, i) => [s.id, "g" + (i + 1)]));
  }
  const gc = (id) => groupClass[id] || "gn";
  const groupFig = (id) => h("span", { class: gc(id) }, figure());

  // Plain words for schema values (no jargon on screen).
  const PLAIN = {
    verdict: { serviceable: "Worth going after", marginal: "Borderline", "not-serviceable": "Not worth it", "insufficient-evidence": "Not enough evidence yet" },
    confidence: { low: "low confidence", medium: "medium confidence", high: "high confidence" },
    bucket: { locked: "Must-haves", preference: "Preferences", hypothesis: "Guesses to test", unknown: "Don't know yet" },
    dimension: { geography: "Where", age: "Age", sex: "Men or women", income: "Income", lifeStage: "Life stage", healthCondition: "Health targeting",
      audienceType: "Audience", price: "Price", channel: "Channels", language: "Language", regulatory: "Ad wording", ethics: "Ethics", interest: "Interests" },
    appliesTo: { all: "everywhere", targeting: "for ad targeting", messaging: "for ad wording", research: "for research" },
    kind: { observed: "Seen in sources", estimated: "Estimated", inferred: "Inferred" },
    source: { "forum-post": "forum post", review: "review", "review-aggregate": "app store rating", survey: "survey", "first-party": "your ad results",
      "official-stats": "official statistics", "news-report": "news report", "competitor-site": "competitor site" },
    status: { supported: "Research supports it", weakened: "Research weakens it", untested: "Not tested yet", refuted: "Research rules it out" },
    skeptic: { "nothing-found": "Found nothing against it", resolved: "Checked, and it holds", unresolved: "Still open" },
    adVerdict: { worked: "Worked", "didnt-work": "Didn't work", inconclusive: "Too early to tell" },
  };

  const bot = (...kids) => h("div", { class: "turn bot" }, ...kids);
  const me = (text, extra) => h("div", { class: "turn me" }, h("span", { class: "who" }, "You"), text, extra);
  const typing = () => h("div", { class: "turn bot", "aria-label": "GTMagic is writing" }, h("span", { class: "typing" }, figure(), figure(), figure()));

  // A real customer quote: the evidence excerpt, the lexicon phrase marked inside it, and its source.
  function quote(ev, phrase) {
    const q = h("q", {});
    const at = phrase ? ev.excerpt.toLowerCase().indexOf(phrase.toLowerCase()) : -1;
    if (at < 0) q.append(ev.excerpt);
    else q.append(ev.excerpt.slice(0, at), h("mark", {}, ev.excerpt.slice(at, at + phrase.length)), ev.excerpt.slice(at + phrase.length));
    const label = PLAIN.source[ev.sourceType] || ev.sourceType;
    return h("div", { class: "quote" }, q,
      h("span", { class: "src" },
        ev.url && !NO_LINKS ? [icon("i-link"), h("a", { href: ev.url, target: "_blank", rel: "noopener" }, ev.title || label)] : label,
        ev.limitations && h("span", { class: "placeholder" }, ev.limitations)));
  }

  // Simulated words: always this dashed register, always labelled.
  const sim = (text, label) =>
    h("div", { class: "sim" }, h("span", { class: "sim-label" }, figure(), label || "Simulated customer, not a real quote"), h("p", {}, text));

  const notice = (title, body, kind) =>
    h("div", { class: "notice" + (kind ? " " + kind : ""), role: kind === "error" ? "alert" : null }, icon("i-warn"), h("div", {}, h("strong", {}, title), body));

  const tag = (text, cls) => h("span", { class: "tag" + (cls ? " " + cls : "") }, text);
  const money = (n, cur = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const num = (n) => new Intl.NumberFormat("en-US").format(n);

  window.R = { h, icon, figure, setGroups, gc, groupFig, PLAIN, bot, me, typing, quote, sim, notice, tag, money, num };
})();
