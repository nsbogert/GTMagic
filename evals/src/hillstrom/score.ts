import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mulberry32 } from "../upworthy/rng";
import { mean, percentiles, spearman } from "./stats";
import { BENCH_DIR, type Email, type Predictions, type Truth, type TruthBootstrap } from "./types";

export const PRED_DIR = join(BENCH_DIR, "predictions");
const SEG_BOOT_REPS = 2000;

export const loadTruth = (): Truth => JSON.parse(readFileSync(join(BENCH_DIR, "truth.json"), "utf8")) as Truth;
const loadBoot = (): TruthBootstrap => JSON.parse(readFileSync(join(BENCH_DIR, "truth.bootstrap.json"), "utf8")) as TruthBootstrap;
export const listArms = (): string[] =>
  existsSync(PRED_DIR) ? readdirSync(PRED_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort() : [];
export const loadPredictions = (arm: string): Partial<Predictions> =>
  JSON.parse(readFileSync(join(PRED_DIR, `${arm}.json`), "utf8")) as Partial<Predictions>;

/** Keeps valid ids in order, drops duplicates/unknowns, appends anything missing in task order. */
export function repairRanking(ranking: unknown, ids: string[]): { ranking: string[]; repaired: boolean } {
  const seen = new Set<string>();
  const list = Array.isArray(ranking) ? ranking.map((x) => String(x).trim().toUpperCase()) : [];
  const clean = list.filter((id) => ids.includes(id) && !seen.has(id) && seen.add(id));
  return { ranking: [...clean, ...ids.filter((id) => !seen.has(id))], repaired: clean.length !== ids.length || list.length !== ids.length };
}

export function normalizeEmail(x: unknown): Email | null {
  const s = String(x ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (s === "mens" || s === "men" || s === "mensemail") return "mens";
  if (s === "womens" || s === "women" || s === "womensemail") return "womens";
  return null;
}

/** Spearman between predicted order (first = biggest lift) and true uplifts. */
const rankScore = (ranking: string[], ids: string[], uplift: number[]) =>
  spearman(ids.map((id) => ids.length - ranking.indexOf(id)), uplift);

/** Top-3 hits (share of the true top 3 found) and share of the possible uplift gain over the segment average captured. */
function top3(ranking: string[], ids: string[], uplift: number[]): { hits: number; captured: number } {
  const byId = new Map(ids.map((id, i) => [id, uplift[i]!]));
  const trueTop = [...ids].sort((a, b) => byId.get(b)! - byId.get(a)!).slice(0, 3);
  const picked = ranking.slice(0, 3);
  const avg = mean(uplift);
  const best = mean(trueTop.map((id) => byId.get(id)!)) - avg;
  return {
    hits: picked.filter((id) => trueTop.includes(id)).length / 3,
    captured: best > 0 ? (mean(picked.map((id) => byId.get(id)!)) - avg) / best : 0,
  };
}

export interface Metric {
  value: number;
  lo: number;
  hi: number;
}

export interface ArmScore {
  arm: string;
  emailAcc: Metric & { n: number };
  emailAccHolm: Metric & { n: number };
  spearmanWomens: Metric;
  spearmanMens: Metric;
  top3HitsWomens: Metric;
  top3CapturedWomens: Metric;
  top3CapturedMens: Metric;
  repaired: number;
}

/** Accuracy on segments with a significant winner; CI by resampling those segments. */
function accuracy(correct: number[], seed: number): Metric & { n: number } {
  if (!correct.length) return { value: 0, lo: 0, hi: 0, n: 0 };
  const rng = mulberry32(seed);
  const reps = Array.from({ length: SEG_BOOT_REPS }, () => mean(correct.map(() => correct[Math.floor(rng() * correct.length)]!)));
  const [lo, hi] = percentiles(reps);
  return { value: mean(correct), lo, hi, n: correct.length };
}

/** Point estimate on the observed truth; CI from customer-level bootstrap replicates of the truth. */
function overReplicates(point: number, f: (r: number) => number, reps: number): Metric {
  const [lo, hi] = percentiles(Array.from({ length: reps }, (_, r) => f(r)));
  return { value: point, lo, hi };
}

export function scoreArm(arm: string, pred: Partial<Predictions>, truth: Truth = loadTruth(), boot: TruthBootstrap = loadBoot()): ArmScore {
  const segs = truth.segments;
  const ids = segs.map((s) => s.id);
  const rm = repairRanking(pred.rank_mens, ids), rw = repairRanking(pred.rank_womens, ids);
  const picks = segs.map((s) => normalizeEmail(pred.better_email?.[s.id]));
  const upM = segs.map((s) => s.visit.mensVsControl.diff), upW = segs.map((s) => s.visit.womensVsControl.diff);
  const repM = (r: number) => boot.mens.map((xs) => xs[r]!), repW = (r: number) => boot.womens.map((xs) => xs[r]!);
  const correct = (key: "betterEmail" | "betterEmailHolm") =>
    segs.flatMap((s, i) => (s[key] ? [picks[i] === s[key] ? 1 : 0] : []));
  return {
    arm,
    emailAcc: accuracy(correct("betterEmail"), 11),
    emailAccHolm: accuracy(correct("betterEmailHolm"), 12),
    spearmanWomens: overReplicates(rankScore(rw.ranking, ids, upW), (r) => rankScore(rw.ranking, ids, repW(r)), boot.reps),
    spearmanMens: overReplicates(rankScore(rm.ranking, ids, upM), (r) => rankScore(rm.ranking, ids, repM(r)), boot.reps),
    top3HitsWomens: overReplicates(top3(rw.ranking, ids, upW).hits, (r) => top3(rw.ranking, ids, repW(r)).hits, boot.reps),
    top3CapturedWomens: overReplicates(top3(rw.ranking, ids, upW).captured, (r) => top3(rw.ranking, ids, repW(r)).captured, boot.reps),
    top3CapturedMens: overReplicates(top3(rm.ranking, ids, upM).captured, (r) => top3(rm.ranking, ids, repM(r)).captured, boot.reps),
    repaired: segs.filter((_, i) => picks[i] === null).length + (rm.repaired ? 1 : 0) + (rw.repaired ? 1 : 0),
  };
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const r3 = (x: number) => x.toFixed(3);
const cell = (m: Metric, f: (x: number) => string) => `${f(m.value)} <sub>[${f(m.lo)}, ${f(m.hi)}]</sub>`;

export function report(): string {
  const truth = loadTruth();
  const boot = loadBoot();
  const segs = truth.segments;
  const v = truth.overall.visit;
  const sig = segs.filter((s) => s.betterEmail);
  const sigHolm = segs.filter((s) => s.betterEmailHolm);
  const top = (k: "mensVsControl" | "womensVsControl") =>
    [...segs].sort((a, b) => b.visit[k].diff - a.visit[k].diff).slice(0, 3).map((s) => `${s.id} ${s.key} (+${s.visit[k].diff.toFixed(1)}pp)`).join("; ");
  const n = segs.length;
  const lines = [
    "# Hillstrom email benchmark: which segment responds to which campaign",
    "",
    `${truth.source.rows.toLocaleString("en-US")} customers, ${n} segments (n ≥ ${truth.minSegmentSize.toLocaleString("en-US")}). Visit rate: no email ${v.rate.control.toFixed(2)}%, Men's email ${v.rate.mens.toFixed(2)}% (+${v.mensVsControl.diff.toFixed(2)}pp), Women's email ${v.rate.womens.toFixed(2)}% (+${v.womensVsControl.diff.toFixed(2)}pp).`,
    "",
    `- **(a) Better email:** share of segments where the arm names the email with more visits, scored only on the ${sig.length} segments where Men's vs Women's is significant at 95% (${sig.filter((s) => s.betterEmail === "mens").length} Men's, ${sig.filter((s) => s.betterEmail === "womens").length} Women's; ${sigHolm.length} survive Holm). Answering "mens" everywhere scores ${pct(sig.filter((s) => s.betterEmail === "mens").length / Math.max(1, sig.length))}. CI: bootstrap over segments.`,
    "- **(b) Spearman:** predicted segment ranking vs true visit uplift, for each email. CI: 500 customer-level bootstrap replicates of the truth (the oracle's CI is the noise ceiling).",
    `- **(c) Women's top 3:** how many of the true top-3 segments for the Women's email are in the arm's top 3, and the share of the possible uplift gain over the average segment its top 3 captures (100% = best, 0% = random). True top 3, Women's: ${top("womensVsControl")}. Men's: ${top("mensVsControl")}.`,
    "",
    "| Arm | (a) Better email | (a) Holm subset | (b) Spearman, Women's | (b) Spearman, Men's | (c) Women's top-3 hits | (c) Women's top-3 gain | Men's top-3 gain | Invalid |",
    "|---|---|---|---|---|---|---|---|---|",
    `| *chance* | 50.0% | 50.0% | 0.000 | 0.000 | ${pct(3 / n)} | 0.0% | 0.0% | |`,
  ];
  for (const arm of listArms()) {
    const s = scoreArm(arm, loadPredictions(arm), truth, boot);
    lines.push(
      `| ${arm} | ${cell(s.emailAcc, pct)} | ${cell(s.emailAccHolm, pct)} | ${cell(s.spearmanWomens, r3)} | ${cell(s.spearmanMens, r3)} | ${cell(s.top3HitsWomens, pct)} | ${cell(s.top3CapturedWomens, pct)} | ${cell(s.top3CapturedMens, pct)} | ${s.repaired} |`,
    );
  }
  lines.push("", "Invalid = segments with a missing/unreadable better_email, plus rankings that needed repair (missing or duplicate ids).");
  return lines.join("\n");
}
