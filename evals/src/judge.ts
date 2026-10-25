import type { ChatFn } from "./llm";
import {
  JudgeDraftSchema,
  type AnswerKey,
  type ItemScore,
  type ItemScoreValue,
  type JudgeDraft,
  type RunRecord,
  type ScoreRecord,
} from "./schema";

const JUDGE_PROMPT_VERSION = "judge-v1";

const JUDGE_SYSTEM = `You grade a go-to-market recommendation against an answer key written from what a real business learned.

For each answer-key item, give a score:
- 2 if the recommendation meets the item's "full" criterion
- 1 if it meets only the "partial" criterion
- 0 otherwise

Rules:
- Credit only what the recommendation actually says. Do not infer, and do not reward vague text that could fit any business.
- A point the recommendation mentions but then rejects or buries as an afterthought earns at most 1.
- "evidence" must be copied word for word from the recommendation: the shortest sentence or phrase (under 40 words) that earns the score. Use "" when the score is 0.
- "reason" is one short sentence.

Reply with JSON only, no prose and no code fences:
{"items":[{"id":"<item id>","score":0|1|2,"evidence":"<verbatim quote>","reason":"<one sentence>"}]}`;

export function buildJudgeUser(key: AnswerKey, output: string): string {
  const items = key.items.map(({ id, label, groundTruth, full, partial }) => ({ id, label, groundTruth, full, partial }));
  return `ANSWER KEY ITEMS:\n${JSON.stringify(items, null, 2)}\n\nRECOMMENDATION TO GRADE (between the markers):\n<<<\n${output}\n>>>`;
}

/** Lowercase, straight quotes, no markdown emphasis, collapsed whitespace. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function evidenceFound(evidence: string, output: string): boolean {
  const e = normalizeForMatch(evidence).replace(/^["'.…\s]+|["'.…\s]+$/g, "");
  if (e.length < 8) return false;
  const o = normalizeForMatch(output);
  if (o.includes(e)) return true;
  // Judges often join two quoted fragments with "..." — accept if every fragment is present.
  const parts = e.split(/\s*(?:\.\.\.|…)\s*/).filter((p) => p.length >= 8);
  return parts.length > 1 && parts.every((p) => o.includes(p));
}

export function findLeaks(text: string, leakTerms: string[]): string[] {
  const t = normalizeForMatch(text);
  return leakTerms.filter((term) => t.includes(normalizeForMatch(term)));
}

/** Pulls the first JSON object out of a reply, tolerating code fences and stray prose. */
export function extractJson(text: string): string {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in judge reply");
  return unfenced.slice(start, end + 1);
}

function parseDraft(text: string): JudgeDraft {
  return JudgeDraftSchema.parse(JSON.parse(extractJson(text)));
}

export function applyDraft(key: AnswerKey, run: RunRecord, draft: JudgeDraft, judgeModel: string): ScoreRecord {
  const warnings: string[] = [];
  const byId = new Map(draft.items.map((d) => [d.id, d]));
  for (const d of draft.items) if (!key.items.some((k) => k.id === d.id)) warnings.push(`judge returned unknown item "${d.id}" (ignored)`);

  const items: ItemScore[] = key.items.map((k) => {
    const d = byId.get(k.id);
    if (!d) {
      warnings.push(`judge skipped "${k.id}"; scored 0`);
      return { id: k.id, label: k.label, judgeScore: 0, score: 0, evidence: "", evidenceVerified: false, reason: "not graded" };
    }
    const verified = d.score === 0 || evidenceFound(d.evidence, run.output);
    if (!verified) warnings.push(`"${k.id}": quoted evidence not found in the output; ${d.score} → 0`);
    const score: ItemScoreValue = verified ? d.score : 0;
    return { id: k.id, label: k.label, judgeScore: d.score, score, evidence: d.evidence, evidenceVerified: verified, reason: d.reason };
  });

  const leaks = findLeaks(run.output, key.leakTerms);
  if (leaks.length) warnings.push(`possible answer leak: output mentions ${leaks.map((l) => `"${l}"`).join(", ")}`);

  return {
    runId: run.id,
    caseId: run.caseId,
    label: run.label,
    judgeModel: `${judgeModel} (${JUDGE_PROMPT_VERSION})`,
    scoredAt: new Date().toISOString(),
    items,
    total: items.reduce((s, i) => s + i.score, 0),
    judgeTotal: items.reduce((s, i) => s + i.judgeScore, 0),
    max: key.items.length * 2,
    warnings,
  };
}

/** The judge never sees the run's label, model or variant: grading is blind. */
export async function judgeRun(chat: ChatFn, judgeModel: string, key: AnswerKey, run: RunRecord): Promise<ScoreRecord> {
  const user = buildJudgeUser(key, run.output);
  const first = await chat({ system: JUDGE_SYSTEM, user, maxTokens: 16000, json: true, effort: "medium" });
  let draft: JudgeDraft;
  try {
    draft = parseDraft(first.text);
  } catch (err) {
    const retry = await chat({
      system: JUDGE_SYSTEM,
      user: `${user}\n\nYour previous reply could not be used (${(err as Error).message}). Reply with the JSON object only.`,
      maxTokens: 16000,
      json: true,
      effort: "medium",
    });
    draft = parseDraft(retry.text);
  }
  return applyDraft(key, run, draft, judgeModel);
}
