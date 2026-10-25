import type { AnswerKey, ScoreRecord } from "./schema";

interface Group {
  label: string;
  scores: ScoreRecord[];
}

function groupByLabel(scores: ScoreRecord[]): Group[] {
  const groups = new Map<string, ScoreRecord[]>();
  for (const s of scores) groups.set(s.label, [...(groups.get(s.label) ?? []), s]);
  return [...groups.entries()].map(([label, list]) => ({ label, scores: list }));
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** Markdown scoreboard: totals per approach, then per-item averages. Best approach first. */
export function renderBoard(key: AnswerKey, scores: ScoreRecord[]): string {
  if (!scores.length) return "No scored runs yet.\n";
  const max = key.items.length * 2;
  const groups = groupByLabel(scores).sort(
    (a, b) => mean(b.scores.map((s) => s.total)) - mean(a.scores.map((s) => s.total)),
  );

  const out: string[] = [
    `# Known-answer scoreboard: ${key.id}`,
    "",
    `Scored against ${key.items.length} answer-key items, 0–2 points each (max ${max}). Points count only when the judge's quoted evidence is found word for word in the output. The cross-check is an independent expected score from a different model, with no quotes.`,
    "",
    "| Approach | Runs | Mean | Min–max | Mean % | Cross-check (decision model) |",
    "|---|---|---|---|---|---|",
  ];
  for (const g of groups) {
    const totals = g.scores.map((s) => s.total);
    const cross = g.scores.flatMap((s) => (s.crossCheck ? [s.crossCheck.total] : []));
    const crossCell = cross.length ? `${fmt(mean(cross))} / ${max}` : "—";
    out.push(
      `| ${g.label} | ${totals.length} | ${fmt(mean(totals))} / ${max} | ${Math.min(...totals)}–${Math.max(...totals)} | ${Math.round((100 * mean(totals)) / max)}% | ${crossCell} |`,
    );
  }

  out.push("", "## Per item (mean score, 0–2)", "", `| Item | ${groups.map((g) => g.label).join(" | ")} |`, `|---|${groups.map(() => "---").join("|")}|`);
  for (const item of key.items) {
    const cells = groups.map((g) => fmt(mean(g.scores.map((s) => s.items.find((i) => i.id === item.id)?.score ?? 0))));
    const flag = item.confidence === "inferred" ? " *(inferred)*" : "";
    out.push(`| ${item.label}${flag} | ${cells.join(" | ")} |`);
  }

  const warnings = scores.flatMap((s) => s.warnings.map((w) => `- \`${s.runId}\`: ${w}`));
  if (warnings.length) out.push("", "## Warnings", "", ...warnings);
  out.push("", "Synthetic and model outputs are hypotheses to test, not proof. Items marked *inferred* still need founder confirmation.", "");
  return out.join("\n");
}
