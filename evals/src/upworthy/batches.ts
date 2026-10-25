import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BENCH_DIR, type Split, type UpworthyTest } from "./types";

export const BATCH_SIZE = 40;

export function loadTruth(split: Split): UpworthyTest[] {
  return JSON.parse(readFileSync(join(BENCH_DIR, `${split}.truth.json`), "utf8")) as UpworthyTest[];
}

/** What a predictor sees: the article opening and labeled headlines. No clicks, no CTRs, no Upworthy ids. */
export function blindView(t: UpworthyTest): { id: string; article: string; headlines: Record<string, string> } {
  return { id: t.id, article: t.context, headlines: Object.fromEntries(t.headlines.map((h) => [h.label, h.text])) };
}

/** Writes blind batch files for val/test, and a CTR-annotated study file for train (principle learning only). */
export function writeBatches(): void {
  const dir = join(BENCH_DIR, "batches");
  mkdirSync(dir, { recursive: true });
  for (const split of ["val", "test"] as const) {
    const tests = loadTruth(split);
    const n = Math.ceil(tests.length / BATCH_SIZE);
    for (let i = 0; i < n; i++) {
      const batch = tests.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE).map(blindView);
      writeFileSync(join(dir, `${split}-${i + 1}.json`), `${JSON.stringify(batch, null, 1)}\n`);
    }
    console.log(`${split}: ${n} batch file(s) in benchmarks/upworthy/batches/`);
  }

  const lines = [
    "# Upworthy headline A/B tests: training split (exploratory)",
    "",
    "Each test shows one article's opening and the headlines Upworthy tested for it, ranked by real click-through rate (CTR). The first headline won by a statistically clear margin.",
    "",
  ];
  for (const t of loadTruth("train")) {
    lines.push(`## ${t.id}`, `Article: ${t.context || "(no opening text)"}`, "");
    for (const h of [...t.headlines].sort((a, b) => b.ctr - a.ctr)) {
      lines.push(`- ${(100 * h.ctr).toFixed(2)}% · ${h.text}`);
    }
    lines.push("");
  }
  writeFileSync(join(BENCH_DIR, "train-study.md"), `${lines.join("\n")}\n`);
  console.log("train: study file benchmarks/upworthy/train-study.md");
}
