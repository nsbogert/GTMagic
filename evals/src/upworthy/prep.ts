import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse";
import { EVALS_DIR } from "../store";
import { mulberry32, shuffle } from "./rng";
import { BENCH_DIR, LABELS, type Split, type UpworthyTest } from "./types";

/** OSF files from the Upworthy Research Archive (CC BY 4.0), https://osf.io/jd64p/ */
const SOURCES: Record<Split, { file: string; url: string; sample?: number }> = {
  train: { file: "exploratory.csv", url: "https://osf.io/download/3vqmp/" },
  val: { file: "holdout.csv", url: "https://osf.io/download/ynf3k/" },
  test: { file: "confirmatory.csv", url: "https://osf.io/download/vy8mj/", sample: 400 },
};
const DATA_DIR = join(EVALS_DIR, "data", "upworthy");
const MIN_HEADLINES = 4;
const MAX_HEADLINES = LABELS.length;
const MIN_IMPRESSIONS = 500;
// The archive's 2024 note: tests in this window may have randomization problems.
const RISKY_FROM = "2013-06-25";
const RISKY_TO = "2014-01-10";
const SEED = 20261025;

interface Row {
  clickability_test_id: string;
  created_at: string;
  headline: string;
  lede: string;
  impressions: string;
  clicks: string;
}

async function download(split: Split): Promise<string> {
  const { file, url } = SOURCES[split];
  const path = join(DATA_DIR, file);
  if (existsSync(path)) return path;
  mkdirSync(DATA_DIR, { recursive: true });
  console.log(`downloading ${file}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} for ${url}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/** |z| of a two-proportion test. */
export function zScore(n1: number, c1: number, n2: number, c2: number): number {
  const p = (c1 + c2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? Math.abs(c1 / n1 - c2 / n2) / se : 0;
}

async function loadTests(path: string, split: Split): Promise<UpworthyTest[]> {
  const byTest = new Map<string, { created: string; ledes: Map<string, number>; heads: Map<string, [number, number]> }>();
  const parser = createReadStream(path).pipe(parse({ columns: true, relax_quotes: true }));
  for await (const r of parser as AsyncIterable<Row>) {
    const n = Number.parseInt(r.impressions, 10);
    const c = Number.parseInt(r.clicks, 10);
    const headline = r.headline.trim();
    if (!headline || !Number.isFinite(n) || !Number.isFinite(c) || n <= 0) continue;
    let t = byTest.get(r.clickability_test_id);
    if (!t) byTest.set(r.clickability_test_id, (t = { created: r.created_at.slice(0, 10), ledes: new Map(), heads: new Map() }));
    const lede = stripHtml(r.lede);
    if (lede) t.ledes.set(lede, (t.ledes.get(lede) ?? 0) + 1);
    // Sum across images and ledes: Upworthy crossed headlines with images, so this marginalizes them out.
    const h = t.heads.get(headline) ?? [0, 0];
    t.heads.set(headline, [h[0] + n, h[1] + c]);
  }

  const rng = mulberry32(SEED + split.length);
  const out: UpworthyTest[] = [];
  for (const [testId, t] of byTest) {
    if (t.created >= RISKY_FROM && t.created <= RISKY_TO) continue;
    const heads = [...t.heads].map(([text, [impressions, clicks]]) => ({ text, impressions, clicks, ctr: clicks / impressions }));
    if (heads.length < MIN_HEADLINES || heads.length > MAX_HEADLINES) continue;
    if (heads.some((h) => h.impressions < MIN_IMPRESSIONS)) continue;
    const ranked = [...heads].sort((a, b) => b.ctr - a.ctr);
    const [best, second] = ranked;
    if (!best || !second || zScore(best.impressions, best.clicks, second.impressions, second.clicks) <= 1.96) continue;
    const context = [...t.ledes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    // Labels are assigned in a random order, so "A" carries no information about the winner.
    const shuffled = shuffle(heads, rng).map((h, i) => ({ label: LABELS[i] ?? "?", ...h }));
    const winner = shuffled.reduce((a, b) => (b.ctr > a.ctr ? b : a));
    out.push({ id: "", testId, split, createdAt: t.created, context: context.slice(0, 400), headlines: shuffled, winner: winner.label });
  }
  out.sort((a, b) => a.testId.localeCompare(b.testId));
  const sample = SOURCES[split].sample;
  const picked = sample && out.length > sample ? shuffle(out, mulberry32(SEED)).slice(0, sample) : out;
  return picked.map((t, i) => ({ ...t, id: `${split}-${String(i + 1).padStart(3, "0")}` }));
}

export async function prep(): Promise<void> {
  mkdirSync(BENCH_DIR, { recursive: true });
  for (const split of ["train", "val", "test"] as const) {
    const tests = await loadTests(await download(split), split);
    writeFileSync(join(BENCH_DIR, `${split}.truth.json`), `${JSON.stringify(tests, null, 1)}\n`);
    const n = tests.map((t) => t.headlines.length);
    console.log(`${split}: ${tests.length} tests (${SOURCES[split].file}), ${Math.min(...n)}–${Math.max(...n)} headlines, mean ${(n.reduce((a, b) => a + b, 0) / n.length).toFixed(1)}`);
  }
}
