import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { dashscopeBase, postJson, requireEnv } from "../llm";
import { loadTruth } from "./batches";
import { BENCH_DIR, type Predictions, type Split, type UpworthyTest } from "./types";

const DECISION_MODEL = "decision-model-preview";
const CONCURRENCY = 8;

const Response = z.looseObject({
  answers: z.looseObject({ pick: z.looseObject({ probabilities: z.record(z.string(), z.number()) }) }),
});

/**
 * Choice model: a reader sees the article and the headlines and picks the one they'd click.
 * Asked once per cyclic rotation of the options (each headline appears in every position once),
 * then probabilities are averaged, which cancels position bias.
 */
async function rankTest(t: UpworthyTest, apiKey: string): Promise<{ ranking: string[]; share: Record<string, number> }> {
  const n = t.headlines.length;
  const share: Record<string, number> = Object.fromEntries(t.headlines.map((h) => [h.label, 0]));
  for (let r = 0; r < n; r++) {
    const rotated = t.headlines.map((_, i) => t.headlines[(i + r) % n]!);
    const criteria = Object.fromEntries(rotated.map((h, i) => [`option${i + 1}`, h.text]));
    const state = `You are scrolling your social media feed and see a post linking to this article:\n\n"${t.context}"\n\nThe post shows one of the headlines below. Which headline would make you most likely to click?`;
    const raw = await postJson(
      "decision model",
      `${dashscopeBase()}/systemone`,
      { model: DECISION_MODEL, state, questions: { pick: { type: "choice", criteria } } },
      [["authorization", `Bearer ${apiKey}`]],
    );
    const probs = Response.parse(raw).answers.pick.probabilities;
    rotated.forEach((h, i) => (share[h.label] = (share[h.label] ?? 0) + (probs[`option${i + 1}`] ?? 0) / n));
  }
  const ranking = Object.keys(share).sort((a, b) => (share[b] ?? 0) - (share[a] ?? 0));
  return { ranking, share };
}

export async function runDecision(split: Split): Promise<void> {
  const apiKey = requireEnv("DECISION_MODEL_KEY", "decision_model_key");
  const tests = loadTruth(split);
  const preds: Predictions = {};
  const shares: Record<string, Record<string, number>> = {};
  let next = 0;
  let failed = 0;
  const started = Date.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < tests.length) {
        const t = tests[next++]!;
        try {
          const { ranking, share } = await rankTest(t, apiKey);
          preds[t.id] = ranking;
          shares[t.id] = share;
        } catch (err) {
          failed++;
          console.error(`  ${t.id}: ${(err as Error).message.slice(0, 160)}`);
        }
      }
    }),
  );
  const dir = join(BENCH_DIR, "predictions", "decision-model");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${split}.json`), `${JSON.stringify(preds, null, 1)}\n`);
  writeFileSync(join(dir, `${split}.shares.json`), `${JSON.stringify(shares)}\n`);
  console.log(`decision-model on ${split}: ${Object.keys(preds).length}/${tests.length} ranked, ${failed} failed, ${Math.round((Date.now() - started) / 1000)}s`);
}
