import { z } from "zod";
import { dashscopeBase, postJson, requireEnv } from "./llm";
import type { AnswerKey, CrossCheck, RunRecord } from "./schema";

export const DECISION_MODEL = "decision-model-preview";

const Answer = z.looseObject({ type: z.string(), probabilities: z.record(z.string(), z.number()) });
const DecisionResponse = z.looseObject({ answers: z.record(z.string(), Answer) });

type Level = "full" | "partial" | "none";
const POINTS: Record<Level, number> = { full: 2, partial: 1, none: 0 };

export const hasDecisionKey = (): boolean => Boolean(process.env.DECISION_MODEL_KEY ?? process.env.decision_model_key);

/**
 * A second, independent grader: the decision model returns a probability for each score level,
 * so each item gets an expected score (0–2). It can't quote evidence, so it's a cross-check only.
 */
export async function crossCheck(key: AnswerKey, run: RunRecord): Promise<CrossCheck> {
  const apiKey = requireEnv("DECISION_MODEL_KEY", "decision_model_key");
  const questions = Object.fromEntries(
    key.items.map((item) => [
      item.id,
      {
        type: "choice",
        criteria: {
          full: `The recommendation clearly says this: ${item.full}`,
          partial: `The recommendation only says this: ${item.partial}`,
          none: "The recommendation says neither of these.",
        } satisfies Record<Level, string>,
      },
    ]),
  );
  const raw = await postJson(
    "decision model",
    `${dashscopeBase()}/systemone`,
    { model: DECISION_MODEL, state: `A go-to-market recommendation for a business:\n\n${run.output}`, questions },
    [["authorization", `Bearer ${apiKey}`]],
  );
  return toCrossCheck(key, DecisionResponse.parse(raw).answers);
}

/** Expected points per item: 2·P(full) + 1·P(partial). Items the model didn't answer count as 0. */
export function toCrossCheck(key: AnswerKey, answers: Record<string, { probabilities: Record<string, number> }>): CrossCheck {
  const items = key.items.map((item) => {
    const p = answers[item.id]?.probabilities ?? {};
    const expected = (Object.keys(POINTS) as Level[]).reduce((s, level) => s + POINTS[level] * (p[level] ?? 0), 0);
    return { id: item.id, expected: Math.round(expected * 100) / 100 };
  });
  return { model: DECISION_MODEL, items, total: Math.round(items.reduce((s, i) => s + i.expected, 0) * 10) / 10 };
}
