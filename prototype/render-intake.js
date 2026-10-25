/* Plates built from the Intake Brief (intake.json, schema v1:
   .claude/skills/gtm-intake/references/schema.md). Every value shown here comes from the brief;
   the only arithmetic is cost per sign-up (spend ÷ sign-ups), which is code, not the model. */
(function () {
  const { h, icon, gc, groupFig, PLAIN, quote, tag, money, num } = window.R;

  function baselinePlate(b) {
    const at = new Date(b.frozenAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return h("section", { class: "baseline", "aria-label": "Plain AI guess before research" },
      h("span", { class: "sim-label" }, `Plain AI guess, made before any research · frozen at ${at}`),
      h("div", { class: "baseline-cols" },
        h("div", {}, h("h4", {}, "Who it guessed"), h("ul", {}, b.icps.map((x) => h("li", {}, x)))),
        h("div", {}, h("h4", {}, "Lines it suggested"), h("ul", {}, b.taglines.map((x) => h("li", {}, x))))));
  }

  // What the ads are judged against: the owner's stated target, or the max worked out from their numbers.
  function targetLine(business) {
    const cur = business.pricing?.currency || "USD";
    const ue = business.unitEconomics;
    const used = ue?.targetCpaUsed ?? business.targetCpa;
    if (used == null) return "No limit on cost per sign-up yet, so every result is too early to tell.";
    return ue?.targetCpaSource === "derived"
      ? `Judged against ${money(used, cur)}, the most you can spend per paying customer, worked out from your numbers.`
      : `Judged against your target of ${money(used, cur)} per paying customer.`;
  }
  const CONVERSION = { paying: "Paying sign-ups", trial: "Free trials, not judged", unknown: "Not sure if paying, not judged" };

  function adsPlate(pxs, business) {
    const cur = business.pricing?.currency || "USD";
    return h("section", { class: "plate", "aria-label": "Your past ads" },
      h("h3", {}, pxs.length === 1 ? "Your past campaign" : `Your ${pxs.length} past campaigns`),
      h("p", { class: "meta" }, `${targetLine(business)} From ${pxs[0]?.sourceFile}.`),
      h("table", { class: "board" },
        h("thead", {}, h("tr", {}, h("th", {}, "Ad"), h("th", { class: "num" }, "Spent"), h("th", { class: "num hide-sm" }, "Clicks"), h("th", { class: "num" }, "Sign-ups"), h("th", { class: "num" }, "Per sign-up"))),
        h("tbody", {}, pxs.map((p) => {
          const per = p.spend != null && p.metrics.conversions ? p.spend / p.metrics.conversions : null;
          return h("tr", {},
            h("td", {}, h("span", { class: "strong" }, p.message.headline || p.audience),
              h("span", { class: "sub" }, p.audience + (p.conversionType ? ` · ${CONVERSION[p.conversionType]}` : "")),
              h("span", { class: "sub" }, tag(PLAIN.adVerdict[p.verdict], "v-" + p.verdict), " ", p.verdictReason || "")),
            h("td", { class: "num" }, p.spend != null ? money(p.spend, cur) : "–"),
            h("td", { class: "num hide-sm" }, num(p.metrics.clicks ?? 0)),
            h("td", { class: "num" }, num(p.metrics.conversions ?? 0)),
            h("td", { class: "num" }, per != null ? money(per, cur) : "–"));
        }))));
  }

  function ruleText(c) {
    const r = c.rule;
    if (r.op === "range") return `${r.min ?? "any"}–${r.max ?? "any"}`;
    if (!r.values?.length) return "Not decided";
    return r.op === "exclude" ? r.values.map((v) => "No " + v).join(" · ") : r.values.join(", ");
  }

  function constraintsPlate(constraints) {
    const order = ["locked", "preference", "hypothesis", "unknown"];
    return h("section", { class: "plate", "aria-label": "What you told me" },
      h("h3", {}, "What you told me, sorted"),
      h("div", { class: "buckets" }, order.filter((b) => constraints.some((c) => c.bucket === b)).map((b) =>
        h("div", { class: "bucket" }, h("h4", {}, PLAIN.bucket[b]),
          h("ul", {}, constraints.filter((c) => c.bucket === b).map((c) =>
            h("li", {}, h("span", { class: "dim" }, PLAIN.dimension[c.dimension] || c.dimension), h("span", {}, ruleText(c)),
              h("span", { class: "applies" }, PLAIN.appliesTo[c.appliesTo]),
              c.pushback && h("span", { class: "applies" }, c.pushback.ownerKept ? "Questioned once by research; you kept it" : "Changed after research"))))))));
  }

  function concernRows(seg, concerns) {
    const label = (id) => concerns.find((c) => c.id === id)?.label || id;
    return h("ul", { class: "concerns" }, seg.concernBundles.map((b) =>
      h("li", {}, h("span", {}, b.concernIds.map(label).join(" + ")),
        h("span", { class: "marks", "aria-hidden": "true" }, Array.from({ length: b.observedCount }, () => h("i", { class: gc(seg.id) }))),
        h("span", { class: "count" }, String(b.observedCount)))));
  }

  function researchPlate(intake) {
    const ev = Object.fromEntries(intake.evidence.map((e) => [e.id, e]));
    const types = {};
    intake.evidence.forEach((e) => (types[e.sourceType] = (types[e.sourceType] || 0) + 1));
    return h("section", { class: "plate", "aria-label": "Customer groups" },
      h("h3", {}, `${intake.segments.length} customer groups, and how they talk`),
      h("p", { class: "meta" }, `${intake.evidence.length} pieces of evidence: ` + Object.entries(types).map(([t, n]) => `${n} ${PLAIN.source[t] || t}${n > 1 ? "s" : ""}`).join(", ") + "."),
      intake.segments.map((s) => {
        const sv = s.serviceability;
        const lex = intake.lexicon.filter((l) => l.segmentIds.includes(s.id)).slice(0, 2);
        const inc = sv.incumbents[0];
        return h("article", { class: "group" },
          h("div", { class: "group-name" }, groupFig(s.id), h("h4", {}, s.name), s.isOwnerGuess && h("span", { class: "guess-tag" }, "Your first guess")),
          h("p", {}, s.description),
          h("p", { class: "verdict-line" }, tag(PLAIN.verdict[sv.verdict], "v-" + sv.verdict), ` ${PLAIN.confidence[sv.confidence]}. ${sv.reasoning}`),
          h("h5", {}, "What they worry about (times it came up)"), concernRows(s, intake.concerns),
          lex.length > 0 && [h("h5", {}, "In their words"), lex.map((l) => quote(ev[l.evidenceId], l.phrase))],
          h("dl", { class: "facts-grid" },
            sv.size.population != null && [h("dt", {}, "Size"), h("dd", {}, `About ${num(sv.size.population)} people${sv.size.isEstimate ? " (estimate)" : ""}. ` +
              (sv.sizeMath?.minPopulation != null ? `You need at least ${num(sv.sizeMath.minPopulation)} to reach your minimum revenue.` : "Not judged yet: an input for the size check is missing.")
            )],
            inc && [h("dt", {}, "Main alternative"), h("dd", {}, inc.name + (inc.rating ? `, rated ${inc.rating} from ${num(inc.reviewCount)} reviews` : ""))],
            [h("dt", {}, "Why now"), h("dd", {}, sv.motivation)]));
      }));
  }

  function evidencePlate(intake) {
    return h("section", { class: "plate", "aria-label": "Findings and the case against" },
      h("h3", {}, "What the evidence says, and the case against"),
      h("ul", { class: "findings" }, intake.findings.map((f) =>
        h("li", {}, tag(PLAIN.kind[f.kind], "k-" + f.kind), h("span", {}, f.claim), h("span", { class: "applies" }, `${PLAIN.confidence[f.confidence]} · ${f.evidenceIds.length} source${f.evidenceIds.length === 1 ? "" : "s"}`)))),
      h("h4", {}, "Looking for reasons we're wrong"),
      h("ul", { class: "findings" }, [...intake.skeptic].sort((a, b) => SKEPTIC_ORDER.indexOf(a.kind) - SKEPTIC_ORDER.indexOf(b.kind)).map((s) =>
        h("li", {}, tag(PLAIN.skeptic[s.result], "s-" + s.result),
          h("span", {}, h("span", { class: "q" }, SKEPTIC_Q[s.kind] || "Other check"), s.claim),
          h("span", { class: "applies" }, "Searched: " + s.queries.join(" · "))))));
  }

  const SKEPTIC_ORDER = ["motivation", "incumbent-gap", "size", "other"];
  const SKEPTIC_Q = { motivation: "Do people want this?", "incumbent-gap": "Is there a gap to fill?", size: "Is the group big enough?" };

  const sentence = (x) => `${x.segment} will ${x.action} because ${x.motivation}, instead of ${x.insteadOf}, at ${x.price}.`;

  function briefPlate(intake, onDownload) {
    const lex = Object.fromEntries(intake.lexicon.map((l) => [l.id, l]));
    const r = intake.readiness;
    const ready = { ready: "Ready to test", "no-supported-segment": "No customer group is supported yet", "needs-more": "Needs a bit more" }[r.status];
    return h("section", { class: "plate", "aria-label": "Your save file" },
      h("h3", {}, "Your save file"),
      intake.icp
        ? h("dl", { class: "answers" },
            h("div", { class: "answer" }, h("dt", {}, "Who to target"), h("dd", {}, intake.icp.statement)),
            h("div", { class: "answer" }, h("dt", {}, "They must"), h("dd", { class: "list" }, h("ul", {}, intake.icp.mustHaves.map((m) => h("li", {}, m))))),
            h("div", { class: "answer" }, h("dt", {}, "Rule out"), h("dd", { class: "list" }, h("ul", {}, intake.icp.disqualifiers.map((m) => h("li", {}, m))))))
        : h("p", {}, "No customer group is supported yet. That's a real result: the open questions below say what would change it."),
      intake.hypotheses.map((x) => h("div", { class: "hyp" + (x.kind === "primary" ? " primary" : "") },
        h("h4", {}, x.kind === "primary" ? "Best bet" : "Alternative"), h("p", {}, sentence(x)),
        h("p", { class: "sub" }, tag(PLAIN.status[x.status], "h-" + x.status), ` Wrong if: ${x.wrongIf}`))),
      h("h4", {}, "Lines to test"),
      h("ol", { class: "lines" }, intake.roughMessaging.map((m, i) => h("li", {},
        h("b", {}, "ABCDEF"[i]),
        h("div", {}, h("span", { class: "strong" }, m.headline), h("span", { class: "sub" }, m.subheadline),
          h("span", { class: "borrowed" }, "Borrows: ", m.lexiconIds.map((id) => h("mark", {}, lex[id]?.phrase || id)).flatMap((x, k) => (k ? [" · ", x] : [x]))))))),
      h("p", { class: "draft-tag" }, "Draft lines: verify before publishing."),
      intake.openQuestions.length > 0 && [h("h4", {}, "Still open"), h("ul", { class: "open" }, intake.openQuestions.map((q) => h("li", {}, q)))],
      h("h4", {}, ready),
      h("ul", { class: "checks" }, r.checks.map((c) => h("li", { class: c.pass ? "pass" : "fail" }, icon(c.pass ? "i-check" : "i-warn"),
        h("span", {}, c.check.replace(/^\[script\]\s*/, "").replace(/\bICP\b/g, "Target customer")), /^\[script\]/.test(c.check) && h("span", { class: "applies" }, "checked by code")))),
      h("div", { class: "actions" }, h("button", { class: "btn secondary small", type: "button", onclick: onDownload }, icon("i-down"), "Download save file (intake.json)")));
  }

  window.RI = { baselinePlate, economicsPlate: (b) => window.Econ.economicsPlate(b), adsPlate, constraintsPlate, researchPlate, evidencePlate, briefPlate };
})();
