import type { ArmCounts, Diff } from "./types";

const Z95 = 1.959964;
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

/** Complementary error function (Numerical Recipes erfcc, |rel err| < 1.2e-7). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

const twoSidedP = (z: number) => erfc(Math.abs(z) / Math.SQRT2);

/** Rate (0–1) and its sampling variance. */
export function rateVar(successes: number, n: number): [number, number] {
  const p = n > 0 ? successes / n : 0;
  return [p, n > 0 ? (p * (1 - p)) / n : 0];
}

/** Wald 95% CI for a difference built from independent rates: sum(sign_i * p_i), in percentage points. */
export function diffOf(terms: [number, [number, number]][]): Diff {
  let d = 0, v = 0;
  for (const [sign, [p, pv]] of terms) {
    d += sign * p;
    v += pv;
  }
  const se = Math.sqrt(v);
  const p = se > 0 ? twoSidedP(d / se) : 1;
  return { diff: round(100 * d), lo: round(100 * (d - Z95 * se)), hi: round(100 * (d + Z95 * se)), p: Number(p.toPrecision(3)), sig: p < 0.05 };
}

export const visitRate = (a: ArmCounts) => rateVar(a.visits, a.n);
export const convRate = (a: ArmCounts) => rateVar(a.conversions, a.n);

/** Holm step-down: which p-values stay significant at family-wise alpha. */
export function holm(ps: number[], alpha = 0.05): boolean[] {
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const out = ps.map(() => false);
  for (let k = 0; k < order.length; k++) {
    const [p, i] = order[k]!;
    if (p > alpha / (order.length - k)) break;
    out[i] = true;
  }
  return out;
}

/** Average ranks (1 = smallest), ties share their mean rank. */
function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    for (let k = i; k <= j; k++) out[idx[k]![1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

export function spearman(xs: number[], ys: number[]): number {
  const rx = ranks(xs), ry = ranks(ys);
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function percentiles(xs: number[]): [number, number] {
  const s = [...xs].sort((a, b) => a - b);
  return [s[Math.floor(0.025 * (s.length - 1))]!, s[Math.ceil(0.975 * (s.length - 1))]!];
}
