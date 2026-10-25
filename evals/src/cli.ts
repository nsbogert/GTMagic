import { readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { buildOwnerPrompt, importRun, runBaseline } from "./baseline";
import { renderBoard } from "./board";
import { crossCheck, hasDecisionKey } from "./crosscheck";
import { judgeRun } from "./judge";
import { chatFor } from "./llm";
import { VariantSchema } from "./schema";
import {
  EVALS_DIR,
  listRuns,
  listScores,
  loadAnswerKey,
  loadCase,
  resultsDir,
  saveRun,
  saveScore,
  writeText,
} from "./store";

// Claude when its key is present, otherwise the DeepSeek model the team vault key allows.
const FALLBACK_MODEL = process.env.ANTHROPIC_API_KEY ? "anthropic:claude-opus-5-5" : "dashscope:deepseek-v4.1-flash-1017";
const DEFAULT_GEN_MODEL = process.env.EVAL_GEN_MODEL ?? FALLBACK_MODEL;
const DEFAULT_JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? FALLBACK_MODEL;

const USAGE = `GTMagic known-answer evals

  npm run eval -- prompt   --case <id>                       print the one-prompt baseline (paste it into claude.ai if you like)
  npm run eval -- baseline --case <id> [--variant plain|search] [--n 3] [--model provider:model]
  npm run eval -- import   --case <id> --label <name> <file> score any output, e.g. a GTMagic report.md or a claude.ai answer
  npm run eval -- score    --case <id> [--judge provider:model] [--all] [runId ...]   default: runs not yet scored
  npm run eval -- board    --case <id>                       write results/<id>/SCOREBOARD.md

Models: anthropic:<model> (ANTHROPIC_API_KEY), dashscope:<model> (deepseek_model_api_key + openai_api_endpoint from the vault),
openai:<model> (OPENAI_API_KEY, OPENAI_BASE_URL). With decision_model_key set, score also runs the decision-model cross-check.
Defaults: generate ${DEFAULT_GEN_MODEL}, judge ${DEFAULT_JUDGE_MODEL} (override with EVAL_GEN_MODEL / EVAL_JUDGE_MODEL).`;

const rel = (p: string) => relative(EVALS_DIR, p);

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      case: { type: "string" },
      variant: { type: "string", default: "plain" },
      n: { type: "string", default: "3" },
      model: { type: "string", default: DEFAULT_GEN_MODEL },
      judge: { type: "string", default: DEFAULT_JUDGE_MODEL },
      label: { type: "string" },
      all: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) return console.log(USAGE);
  if (!values.case) throw new Error("--case is required");
  const caseId = values.case;

  switch (command) {
    case "prompt": {
      console.log(buildOwnerPrompt(loadCase(caseId).brief));
      return;
    }
    case "baseline": {
      const variant = VariantSchema.exclude(["import"]).parse(values.variant);
      const n = Number.parseInt(values.n, 10);
      if (!(n >= 1 && n <= 10)) throw new Error("--n must be 1–10");
      const input = loadCase(caseId);
      const chat = chatFor(values.model);
      console.log(`Running ${n} × ${variant} baseline on ${values.model}…`);
      const settled = await Promise.allSettled(
        Array.from({ length: n }, (_, i) => runBaseline({ chat, model: values.model, input, variant, index: i + 1 })),
      );
      for (const r of settled) {
        if (r.status === "fulfilled") {
          const w = r.value.warnings.length ? `  ⚠ ${r.value.warnings.join("; ")}` : "";
          console.log(`  saved ${rel(saveRun(r.value))} (${Math.round(r.value.durationMs / 1000)}s)${w}`);
        } else console.error(`  failed: ${(r.reason as Error).message}`);
      }
      if (settled.every((r) => r.status === "rejected")) process.exitCode = 1;
      return;
    }
    case "import": {
      const file = rest[0];
      if (!file || !values.label) throw new Error("import needs --label <name> and a file path");
      const run = importRun(loadCase(caseId), values.label, readFileSync(file, "utf8"), basename(file));
      console.log(`saved ${rel(saveRun(run))}`);
      return;
    }
    case "score": {
      const key = loadAnswerKey(caseId);
      const scored = new Set(listScores(caseId).map((s) => s.runId));
      const runs = listRuns(caseId).filter((r) => (rest.length ? rest.includes(r.id) : values.all || !scored.has(r.id)));
      if (!runs.length) return console.log("Nothing to score (use --all to re-score).");
      const chat = chatFor(values.judge);
      const withCross = hasDecisionKey();
      console.log(`Scoring ${runs.length} run(s) with ${values.judge} (blind)${withCross ? " + decision-model cross-check" : ""}…`);
      const settled = await Promise.allSettled(
        runs.map(async (run) => {
          const [score, cross] = await Promise.all([
            judgeRun(chat, values.judge, key, run),
            withCross ? crossCheck(key, run).catch((err: Error) => err) : Promise.resolve(undefined),
          ]);
          if (cross instanceof Error) score.warnings.push(`cross-check failed: ${cross.message}`);
          else if (cross) score.crossCheck = cross;
          return score;
        }),
      );
      settled.forEach((r, i) => {
        const runId = runs[i]?.id ?? "?";
        if (r.status === "rejected") return console.error(`  ${runId}: failed: ${(r.reason as Error).message}`);
        saveScore(r.value);
        const note = r.value.total !== r.value.judgeTotal ? ` (judge said ${r.value.judgeTotal}; unverified quotes removed)` : "";
        const cc = r.value.crossCheck ? `  cross-check ${r.value.crossCheck.total}` : "";
        console.log(`  ${r.value.label.padEnd(40)} ${r.value.total}/${r.value.max}${cc}${note}`);
        for (const w of r.value.warnings) console.log(`    ⚠ ${w}`);
      });
      if (settled.some((r) => r.status === "rejected")) process.exitCode = 1;
      return;
    }
    case "board": {
      const md = renderBoard(loadAnswerKey(caseId), listScores(caseId));
      const path = join(resultsDir(caseId), "SCOREBOARD.md");
      writeText(path, md);
      console.log(md);
      console.log(`(written to ${rel(path)})`);
      return;
    }
    default:
      throw new Error(`Unknown command "${command}"\n\n${USAGE}`);
  }
}

main().catch((err: Error) => {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
});
