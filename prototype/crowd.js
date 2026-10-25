/* The live crowd: one figure per synthetic customer, dropping into the row of the
   message they chose as their answer arrives. Focusing a figure opens that customer.
   Choices are PLACEHOLDER (sim-placeholder.js) until the simulation step exists. */
(function () {
  const { h, figure, gc, groupFig, quote, sim, num } = window.R;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ATTR = { role: "Who", currentSolution: "Uses now", priceSensitivity: "Price", urgency: "Urgency", skepticism: "Trust", buyingStage: "Stage" };
  const placeholderNote = () => h("p", { class: "draft-tag" }, "Placeholder choices: the simulation step isn't built yet. Groups, messages and quotes are from your save file.");

  function crowdPlate(intake, simRun, onDone) {
    const segName = (id) => intake.segments.find((s) => s.id === id)?.name || id;
    const counts = {};
    const rowEls = {};
    const countEls = {};
    let open = null;
    const rows = [...simRun.messages.map((m) => ({ key: m.label, text: m.headline })), { key: "none", text: "None of these" }];

    const answered = h("b", {}, "0");
    const status = h("p", { class: "crowd-status" }, answered, `of ${simRun.size} customers have chosen`);
    const detail = h("div", {});
    const crowd = h("div", { class: "crowd", role: "list", "aria-label": "Choices so far" }, rows.map((r) => {
      rowEls[r.key] = h("div", { class: "figs" });
      countEls[r.key] = h("span", { class: "count" }, "0");
      return h("div", { class: "crow", role: "listitem" }, h("b", {}, r.key === "none" ? "–" : r.key), h("span", { class: "msg" }, r.text), rowEls[r.key], countEls[r.key]);
    }));

    const plate = h("section", { class: "plate", "aria-label": "Customers choosing" },
      h("h3", {}, "Which line would make you act?"),
      h("p", { class: "meta" }, `${simRun.size} simulated customers, built from your customer groups (${intake.segments.map((s, i) => `${simRun.perSegment[i]} ${s.name.toLowerCase()}`).join(", ")}). Each sees the lines unbranded, in a shuffled order, and can pick none. Select a figure to meet them.`),
      h("ul", { class: "key", "aria-label": "Key" },
        intake.segments.map((s) => h("li", {}, groupFig(s.id), s.name)),
        h("li", {}, h("span", { class: "gn none-key" }, figure()), "None of these")),
      status, crowd, detail, placeholderNote());

    function toggle(btn, c) {
      if (open) open.setAttribute("aria-pressed", "false");
      if (open === btn) { open = null; detail.replaceChildren(); return; }
      open = btn;
      btn.setAttribute("aria-pressed", "true");
      detail.replaceChildren(personCard(c, segName(c.segmentId), () => toggle(btn, c)));
    }

    let i = 0;
    function next() {
      if (i >= simRun.customers.length) { finish(); return; }
      const c = simRun.customers[i++];
      counts[c.choice] = (counts[c.choice] || 0) + 1;
      const btn = h("button", {
        type: "button", "aria-pressed": "false",
        class: `fig ${c.choice === "none" ? "none gn" : gc(c.segmentId)}${reduced ? "" : " drop"}`,
        "data-seg": c.segmentId,
        "aria-label": `${c.id}, ${segName(c.segmentId)}, chose ${c.choice === "none" ? "none of these" : c.choice}`,
        onclick: () => toggle(btn, c),
      }, figure());
      rowEls[c.choice].append(btn);
      document.querySelector(`.waiting .fig:not(.gone)`)?.classList.add("gone");
      countEls[c.choice].textContent = counts[c.choice];
      answered.textContent = i;
      setTimeout(next, reduced ? 0 : 70 + (i % 5) * 18);
    }

    // Isotype counting: group order within a row, in blocks of five.
    function finish() {
      const order = Object.fromEntries(intake.segments.map((s) => [s.id, s.ownerRank ?? 9]));
      for (const el of Object.values(rowEls)) {
        const figs = [...el.querySelectorAll(".fig")].sort((a, b) => (order[a.dataset.seg] ?? 9) - (order[b.dataset.seg] ?? 9));
        figs.forEach((f) => f.classList.remove("drop"));
        const blocks = [];
        for (let k = 0; k < figs.length; k += 5) blocks.push(h("span", { class: "block" }, figs.slice(k, k + 5)));
        el.replaceChildren(...blocks);
      }
      const top = Object.entries(counts).filter(([k]) => k !== "none").sort((a, b) => b[1] - a[1])[0][0];
      rowEls[top].closest(".crow").classList.add("lead");
      status.replaceChildren(h("b", {}, num(simRun.size)), `of ${simRun.size} answered. Line ${top} was picked most.`);
      onDone();
    }

    return { el: plate, start: () => setTimeout(next, 400) };
  }

  function personCard(c, groupName, onClose) {
    const picked = c.choice === "none" ? "None of these" : `Line ${c.choice}`;
    return h("article", { class: "person", "aria-label": `Customer ${c.id}` },
      h("div", { class: "person-head" },
        h("h4", {}, groupFig(c.segmentId), `${c.id} · ${groupName}`),
        h("button", { class: "btn small secondary", type: "button", onclick: onClose }, "Close")),
      h("div", { class: "attrs" }, c.attrs.map((a) => h("span", {}, `${ATTR[a.name] || a.name}: ${a.value}`))),
      h("p", { class: "meta" }, "Talks like these real customers:"),
      c.voice.map((v) => quote(v.ev, v.phrase)),
      sim(`Picked ${picked}. ${c.reason}`, "Simulated answer, not a real quote"));
  }

  // Results are computed from the counts in code; nothing here is the model's opinion.
  function resultsPlate(intake, simRun) {
    const n = simRun.size;
    const tally = (pred) => simRun.customers.filter(pred).length;
    const rows = simRun.messages.map((m) => ({ ...m, count: tally((c) => c.choice === m.label) })).sort((a, b) => b.count - a.count);
    const groups = intake.segments.map((s, i) => {
      const gn = simRun.perSegment[i];
      const acted = tally((c) => c.segmentId === s.id && c.choice !== "none");
      return { s, n: gn, acted, share: gn ? acted / gn : 0 };
    }).sort((a, b) => b.share - a.share);
    const best = groups[0];
    const guess = groups.find((g) => g.s.isOwnerGuess);

    return h("section", { class: "plate", "aria-label": "Results" },
      h("h3", {}, "What the crowd picked"),
      h("dl", { class: "answers" },
        h("div", { class: "answer" }, h("dt", {}, "Most ready to act"), h("dd", {}, `${best.s.name}: ${best.acted} of ${best.n} picked a line.`)),
        guess && guess !== best && h("div", { class: "answer" }, h("dt", {}, "Your first guess"), h("dd", {}, `${guess.s.name}: ${guess.acted} of ${guess.n} picked a line. The evidence and the crowd point to ${best.s.name.toLowerCase()} instead.`)),
        h("div", { class: "answer" }, h("dt", {}, "Strongest line"), h("dd", {}, `“${rows[0].headline}”, picked by ${rows[0].count} of ${n}.`))),
      h("table", { class: "board" },
        h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "Line"), intake.segments.map((s) => h("th", { class: "num hide-sm" }, s.name)), h("th", { class: "num" }, "All"))),
        h("tbody", {},
          rows.map((r) => h("tr", {}, h("td", {}, h("b", {}, r.label)), h("td", {}, r.headline),
            intake.segments.map((s, i) => h("td", { class: "num hide-sm" }, `${tally((c) => c.segmentId === s.id && c.choice === r.label)} of ${simRun.perSegment[i]}`)),
            h("td", { class: "num" }, `${r.count} of ${n}`))),
          h("tr", {}, h("td", {}, "–"), h("td", {}, "None of these"),
            intake.segments.map((s, i) => h("td", { class: "num hide-sm" }, `${tally((c) => c.segmentId === s.id && c.choice === "none")} of ${simRun.perSegment[i]}`)),
            h("td", { class: "num" }, `${tally((c) => c.choice === "none")} of ${n}`)))),
      h("div", { class: "plate-foot" },
        h("span", {}, `Simulated preference, n = ${n}. Not a conversion rate.`),
        h("span", {}, "How consistent the result is will be shown once the simulation step runs it in different orders.")),
      placeholderNote());
  }

  window.Crowd = { crowdPlate, resultsPlate };
})();
