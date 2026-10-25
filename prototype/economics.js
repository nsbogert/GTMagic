/* What a new customer can cost: business.unitEconomics from intake.json.
   Every dollar figure here is script-computed (scripts/economics.py); the UI only lays it out.
   The bar splits one customer's first-year revenue into serving them, winning them and what's kept. */
(function () {
  const { h, money } = window.R;
  const pct = (x) => `${Math.round(x * 100)}%`;

  function economicsPlate(b) {
    const ue = b.unitEconomics;
    const cur = b.pricing?.currency || "USD";
    const m = (x) => (x == null ? "not worked out yet" : money(x, cur));
    const serve = b.costToServeShare;
    const win = b.acquisitionShare;
    const keep = ue.firstYearMarginShare;
    const parts = serve != null && win != null && keep != null && keep > 0
      ? [["serve", serve, "Serving them"], ["win", win, "Winning them"], ["keep", keep, "You keep"]]
      : null;

    return h("section", { class: "plate", "aria-label": "What a new customer can cost" },
      h("h3", {}, "What a new customer can cost"),
      h("p", { class: "meta" }, b.pricing
        ? `${money(b.pricing.amount, cur)} a ${b.pricing.period}, paid about ${b.pricing.purchasesPerYear} times in a customer's first year. Worked out by code from your numbers.`
        : "Worked out by code from your numbers."),
      h("div", { class: "econ-head" },
        h("span", { class: "econ-big" }, m(ue.annualRevenuePerCustomer)),
        h("span", {}, "from each customer in their first year")),
      parts && h("div", { class: "econ-bar", role: "img", "aria-label": parts.map(([, s, l]) => `${l} ${pct(s)}`).join(", ") },
        parts.map(([k, s]) => h("span", { class: "seg-" + k, style: `flex: ${s}` }))),
      parts && h("ul", { class: "econ-key" }, parts.map(([k, s, l]) =>
        h("li", {}, h("i", { class: "seg-" + k }), `${l} ${pct(s)}`))),
      h("dl", { class: "facts-grid econ-facts" },
        h("dt", {}, "Break-even"), h("dd", {}, h("b", {}, m(ue.breakEvenCac)), " The most a new customer can cost before year one loses money."),
        h("dt", {}, "Most you'll spend"), h("dd", {}, h("b", {}, m(ue.maxCac)), win != null ? ` ${pct(win)} of first-year revenue, your choice.` : ""),
        h("dt", {}, "You keep"), h("dd", {}, h("b", {}, m(ue.firstYearMargin)), " per customer in year one."),
        ue.targetCpaSource === "owner" && [h("dt", {}, "Your own target"), h("dd", {}, h("b", {}, m(ue.targetCpaUsed)), " This is what your ads are judged against.")]),
      keep != null && keep <= 0 && h("p", { class: "draft-tag" }, "At these shares, a new customer loses money in year one."));
  }

  window.Econ = { economicsPlate };
})();
