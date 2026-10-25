import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTruth } from "./batches";
import { mulberry32 } from "./rng";
import { BENCH_DIR, type Predictions, type Split, type UpworthyTest } from "./types";

const PRED_DIR = join(BENCH_DIR, "predictions");
const METRICS = ["top1", "top3", "lift1", "lift3", "tau"] as const;
type Metric = (typeof METRICS)[number];
type TestScore = Record<Metric, number> & { repaired: boolean };

/** Merges <split>.json and <split>-<n>.json files written by an arm. */
export function loadPredictions(arm: string, split: Split): Predictions {
  const dir = join(PRED_DIR, arm);
  if (!existsSync(dir)) return {};
  const files = readdirSync(dir).filter((f) => f === `${split}.json` || new RegExp(`^${split}-\\d+\\.json$`).test(f));
  return Object.assign({}, ...files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Predictions));
}

export const listArms = (): string[] => (existsSync(PRED_DIR) ? readdirSync(PRED_DIR).sort() : []);

/** Keeps valid labels in order, drops duplicates/unknowns, appends anything missing. */
export function repair(ranking: string[] | undefined, labels: string[]): { ranking: string[]; repaired: boolean } {
  const seen = new Set<string>();
  const clean = (ranking ?? []).map((l) => l.trim().toUpperCase()).filter((l) => labels.includes(l) && !seen.has(l) && seen.add(l));
  const full = [...clean, ...labels.filter((l) => !seen.has(l))];
  return { ranking: full, repaired: clean.length !== labels.length };
}

function kendallTauB(xs: number[], ys: number[]): number {
  let c = 0, d = 0, tx = 0, ty = 0;
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const dx = Math.sign(xs[i]! - xs[j]!), dy = Math.sign(ys[i]! - ys[j]!);
      if (dx === 0 && dy === 0) continue;
      if (dx === 0) tx++;
      else if (dy === 0) ty++;
      else if (dx === dy) c++;
      else d++;
    }
  }
  const den = Math.sqrt((c + d + tx) * (c + d + ty));
  return den ? (c - d) / den : 0;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function scoreTest(t: UpworthyTest, predicted: string[] | undefined): TestScore {
  const labels = t.headlines.map((h) => h.label);
  const { ranking, repaired } = repair(predicted, labels);
  const ctr = new Map(t.headlines.map((h) => [h.label, h.ctr]));
  const all = t.headlines.map((h) => h.ctr);
  const avg = mean(all);
  const sorted = [...all].sort((a, b) => b - a);
  const gain = (picked: number[], k: number) => {
    const best = mean(sorted.slice(0, k)) - avg;
    return best > 0 ? (mean(picked) - avg) / best : 0;
  };
  const predRank = labels.map((l) => labels.length - ranking.indexOf(l));
  return {
    top1: ranking[0] === t.winner ? 1 : 0,
    top3: ranking.slice(0, 3).includes(t.winner) ? 1 : 0,
    lift1: gain([ctr.get(ranking[0]!) ?? avg], 1),
    lift3: gain(ranking.slice(0, 3).map((l) => ctr.get(l) ?? avg), 3),
    tau: kendallTauB(predRank, labels.map((l) => ctr.get(l)!)),
    repaired,
  };
}

function bootstrapCI(values: number[], seed: number, reps = 2000): [number, number] {
  const rng = mulberry32(seed);
  const means: number[] = [];
  for (let r = 0; r < reps; r++) {
    let s = 0;
    for (let i = 0; i < values.length; i++) s += values[Math.floor(rng() * values.length)]!;
    means.push(s / values.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * reps)]!, means[Math.floor(0.975 * reps)]!];
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const fmt = (m: Metric, x: number) => (m === "tau" ? x.toFixed(3) : pct(x));
const LABEL: Record<Metric, string> = {
  top1: "Winner = our #1",
  top3: "Winner in our top 3",
  lift1: "Gain captured (#1)",
  lift3: "Gain captured (top 3)",
  tau: "Kendall τ",
};

/** Rank-average ensemble of two arms (lower mean position wins; ties go to arm a). */
export function ensemble(a: string, b: string, name: string, split: Split): void {
  const pa = loadPredictions(a, split), pb = loadPredictions(b, split);
  const out: Predictions = {};
  for (const t of loadTruth(split)) {
    const labels = t.headlines.map((h) => h.label);
    const ra = repair(pa[t.id], labels).ranking, rb = repair(pb[t.id], labels).ranking;
    out[t.id] = [...labels].sort((x, y) => ra.indexOf(x) + rb.indexOf(x) - (ra.indexOf(y) + rb.indexOf(y)) || ra.indexOf(x) - ra.indexOf(y));
  }
  mkdirSync(join(PRED_DIR, name), { recursive: true });
  writeFileSync(join(PRED_DIR, name, `${split}.json`), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote ensemble ${name} for ${split}`);
}

export function report(split: Split, baseline: string): string {
  const truth = loadTruth(split);
  const arms = listArms().filter((a) => Object.keys(loadPredictions(a, split)).length > 0);
  const scores = new Map(arms.map((a) => {
    const p = loadPredictions(a, split);
    return [a, truth.map((t) => scoreTest(t, p[t.id]))] as const;
  }));
  const chance = {
    top1: mean(truth.map((t) => 1 / t.headlines.length)),
    top3: mean(truth.map((t) => Math.min(3, t.headlines.length) / t.headlines.length)),
  };
  const lines = [
    `## ${split} split: ${truth.length} tests (${mean(truth.map((t) => t.headlines.length)).toFixed(1)} headlines on average)`,
    "",
    `| Arm | ${METRICS.map((m) => LABEL[m]).join(" | ")} | Missing/invalid |`,
    `|---|${METRICS.map(() => "---").join("|")}|---|`,
    `| *chance* | ${pct(chance.top1)} | ${pct(chance.top3)} | 0% | 0% | 0.000 | |`,
  ];
  for (const [arm, s] of scores) {
    const cells = METRICS.map((m, i) => {
      const v = s.map((x) => x[m]);
      const [lo, hi] = bootstrapCI(v, 7 + i);
      return `${fmt(m, mean(v))} <sub>[${fmt(m, lo)}, ${fmt(m, hi)}]</sub>`;
    });
    lines.push(`| ${arm} | ${cells.join(" | ")} | ${s.filter((x) => x.repaired).length} |`);
  }
  const base = scores.get(baseline);
  if (base) {
    lines.push("", `**Paired difference vs \`${baseline}\`** (same tests; 95% bootstrap CI; excludes 0 = significant)`, "", `| Arm | ${METRICS.map((m) => LABEL[m]).join(" | ")} |`, `|---|${METRICS.map(() => "---").join("|")}|`);
    for (const [arm, s] of scores) {
      if (arm === baseline) continue;
      const cells = METRICS.map((m, i) => {
        const d = s.map((x, j) => x[m] - base[j]![m]);
        const [lo, hi] = bootstrapCI(d, 101 + i);
        const sig = lo > 0 || hi < 0 ? " **✓**" : "";
        const f = (x: number) => (m === "tau" ? (x >= 0 ? "+" : "") + x.toFixed(3) : `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`);
        return `${f(mean(d))} <sub>[${f(lo)}, ${f(hi)}]</sub>${sig}`;
      });
      lines.push(`| ${arm} | ${cells.join(" | ")} |`);
    }
    lines.push("", "Percent metrics are differences in percentage points.");
  }
  return lines.join("\n");
}
