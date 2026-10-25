/* PLACEHOLDER simulation. The simulation step isn't built yet, so the choices below are
   hand-set counts, not model output. Everything else is derived from intake.json:
   groups and their sampleShare, the messages (roughMessaging), each customer's
   attributes and the real phrases they talk like (lexicon). The UI labels it as placeholder. */
(function () {
  const SIZE = 48;
  // Hand-set choices per owner rank: [A, B, C, D, none] for roughMessaging in order.
  const CHOICES_BY_RANK = { 1: [12, 4, 9, 6, 3], 2: [3, 4, 1, 2, 4] };
  const REASONS = [
    "Keeping my strength is the whole point for me. This says it plainly.",
    "I've quit apps before. Lasting habits matter more to me than a quick start.",
    "I like that it isn't about the scale, but it's a bit vague about what I'd do.",
    "Eating enough is my real problem, so this one caught my eye.",
  ];
  const NONE_REASON = "None of these tell me what I'd actually do on day one.";

  function buildSim(intake) {
    const segs = intake.segments;
    const msgs = intake.roughMessaging.map((m, i) => ({ label: "ABCDEF"[i], ...m }));

    // Split SIZE by sampleShare with largest-remainder rounding.
    // sampleShare may be rough relative numbers (e.g. 7 and 3); normalize before splitting.
    const shares = segs.map((s) => s.sampleShare ?? 1);
    const total = shares.reduce((x, y) => x + y, 0);
    const raw = shares.map((x) => (x / total) * SIZE);
    const n = raw.map(Math.floor);
    let left = SIZE - n.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) n[i]++; });

    const queues = segs.map((s, si) => {
      const counts = (CHOICES_BY_RANK[s.ownerRank] || CHOICES_BY_RANK[2]).slice();
      const total = counts.reduce((a, b) => a + b, 0);
      counts[counts.length - 1] += n[si] - total; // absorb any rounding gap in "none"
      const out = [];
      counts.forEach((c, k) => { for (let j = 0; j < c; j++) out.push(k < msgs.length ? msgs[k].label : "none"); });
      return out.map((c, i) => ({ c, k: (i * 7 + 3) % out.length })).sort((a, b) => a.k - b.k).map((x) => x.c);
    });

    const lexBySeg = (id) => intake.lexicon.filter((l) => l.segmentIds.includes(id));
    const evById = Object.fromEntries(intake.evidence.map((e) => [e.id, e]));
    const customers = [];
    const cursor = segs.map(() => 0);
    while (customers.length < SIZE) {
      segs.forEach((s, si) => {
        if (cursor[si] >= n[si] || customers.length >= SIZE) return;
        const i = cursor[si]++;
        const choice = queues[si][i];
        const lex = lexBySeg(s.id);
        customers.push({
          id: "C-" + String(customers.length + 1).padStart(2, "0"),
          segmentId: s.id,
          attrs: s.attributes.map((a, ai) => ({ name: a.name, value: a.values[(i + ai) % a.values.length].value })),
          voice: [lex[i % lex.length], lex[(i + 1) % lex.length]].filter((v, k, arr) => v && arr.indexOf(v) === k)
            .map((l) => ({ phrase: l.phrase, ev: evById[l.evidenceId] })),
          choice,
          reason: choice === "none" ? NONE_REASON : REASONS["ABCDEF".indexOf(choice)],
        });
      });
    }
    return { size: SIZE, messages: msgs, perSegment: n, customers };
  }

  window.buildSim = buildSim;
})();
