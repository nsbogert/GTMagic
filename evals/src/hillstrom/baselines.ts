import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32, shuffle } from "../upworthy/rng";
import { loadTruth, PRED_DIR, scoreArm } from "./score";
import { mean } from "./stats";
import { BENCH_DIR, type Predictions, type Task, type Truth } from "./types";

const RANDOM_SEED = 4242;

export function oracle(truth: Truth): Predictions {
  const segs = truth.segments;
  const by = (k: "mensVsControl" | "womensVsControl") => [...segs].sort((a, b) => b.visit[k].diff - a.visit[k].diff).map((s) => s.id);
  return {
    better_email: Object.fromEntries(segs.map((s) => [s.id, s.visit.mensVsWomens.diff >= 0 ? "mens" : "womens"])),
    rank_mens: by("mensVsControl"),
    rank_womens: by("womensVsControl"),
  };
}

export function random(ids: string[], seed: number): Predictions {
  const rng = mulberry32(seed);
  return {
    better_email: Object.fromEntries(ids.map((id) => [id, rng() < 0.5 ? "mens" : "womens"])),
    rank_mens: shuffle(ids, rng),
    rank_womens: shuffle(ids, rng),
  };
}

/** Writes code-generated sanity arms (no model involved) and checks that random averages out to chance. */
export function writeBaselines(): void {
  const truth = loadTruth();
  const ids = truth.segments.map((s) => s.id);
  mkdirSync(PRED_DIR, { recursive: true });
  const write = (arm: string, p: Predictions) => writeFileSync(join(PRED_DIR, `${arm}.json`), `${JSON.stringify(p, null, 1)}\n`);
  write("oracle", oracle(truth));
  write("random", random(ids, RANDOM_SEED));
  console.log("wrote predictions/oracle.json and predictions/random.json");

  const draws = Array.from({ length: 200 }, (_, i) => scoreArm("r", random(ids, 1000 + i), truth));
  const avg = (f: (s: (typeof draws)[number]) => number) => mean(draws.map(f)).toFixed(3);
  console.log(
    `200 random draws, mean: better-email ${avg((s) => s.emailAcc.value)}, Spearman W ${avg((s) => s.spearmanWomens.value)}, ` +
      `Spearman M ${avg((s) => s.spearmanMens.value)}, W top-3 hits ${avg((s) => s.top3HitsWomens.value)}, W top-3 gain ${avg((s) => s.top3CapturedWomens.value)}`,
  );
}

/** Fills prompts/<name>.md from task.json. The first heading line is an instruction to the operator, not prompt text. */
export function renderPrompt(name: string): string {
  const template = readFileSync(join(BENCH_DIR, "prompts", `${name}.md`), "utf8").replace(/^# .*\n\n?/, "");
  const task = JSON.parse(readFileSync(join(BENCH_DIR, "task.json"), "utf8")) as Task;
  const fill: Record<string, string> = {
    BUSINESS: task.business,
    OUTCOME: task.outcome,
    CAMPAIGNS: task.campaigns.map((c) => `- ${c.id}: ${c.description}`).join("\n"),
    SEGMENTS: task.segments.map((s) => `- ${s.id}: ${s.description} (${s.customers.toLocaleString("en-US")} customers)`).join("\n"),
  };
  const out = template.replace(/\{\{([A-Z_]+)\}\}/g, (m, k: string) => fill[k] ?? m);
  const left = out.match(/\{\{[A-Z_]+\}\}/g);
  if (left) throw new Error(`unfilled placeholders: ${left.join(", ")}`);
  return out;
}
