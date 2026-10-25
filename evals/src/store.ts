import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import {
  AnswerKeySchema,
  CaseInputSchema,
  RunRecordSchema,
  ScoreRecordSchema,
  type AnswerKey,
  type CaseInput,
  type RunRecord,
  type ScoreRecord,
} from "./schema";

export const EVALS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,120}$/;

function checkId(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`Invalid id "${id}"`);
  return id;
}

function readJson<S extends z.ZodType>(path: string, schema: S): z.infer<S> {
  return schema.parse(JSON.parse(readFileSync(path, "utf8")));
}

function writeJson(path: string, value: RunRecord | ScoreRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const caseDir = (caseId: string) => join(EVALS_DIR, "cases", checkId(caseId));
export const resultsDir = (caseId: string) => join(EVALS_DIR, "results", checkId(caseId));

export function loadCase(caseId: string): CaseInput {
  return readJson(join(caseDir(caseId), "input.json"), CaseInputSchema);
}

/** Only the scorer may call this. Pipelines and baselines must never see the answer key. */
export function loadAnswerKey(caseId: string): AnswerKey {
  const key = readJson(join(caseDir(caseId), "answer-key.json"), AnswerKeySchema);
  const known = new Set(key.sources.map((s) => s.key));
  for (const item of key.items) {
    for (const k of item.sourceKeys) if (!known.has(k)) throw new Error(`answer key item "${item.id}" cites unknown source "${k}"`);
  }
  return key;
}

export function saveRun(run: RunRecord): string {
  const path = join(resultsDir(run.caseId), "outputs", `${checkId(run.id)}.json`);
  writeJson(path, run);
  writeFileSync(path.replace(/\.json$/, ".md"), `<!-- ${run.label} · ${run.createdAt} -->\n\n${run.output}\n`);
  return path;
}

export function saveScore(score: ScoreRecord): string {
  const path = join(resultsDir(score.caseId), "scores", `${checkId(score.runId)}.json`);
  writeJson(path, score);
  return path;
}

function listJson(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => join(dir, f)) : [];
}

export const listRuns = (caseId: string): RunRecord[] =>
  listJson(join(resultsDir(caseId), "outputs")).map((p) => readJson(p, RunRecordSchema));

export const listScores = (caseId: string): ScoreRecord[] =>
  listJson(join(resultsDir(caseId), "scores")).map((p) => readJson(p, ScoreRecordSchema));

export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
