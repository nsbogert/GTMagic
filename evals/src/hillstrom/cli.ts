import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { renderPrompt, writeBaselines } from "./baselines";
import { prep } from "./prep";
import { report } from "./score";
import { BENCH_DIR } from "./types";

const USAGE = `Hillstrom email benchmark (which customer segment responds to which email campaign)

  npm run hillstrom -- prep                     download the CSV, write truth.json, truth.bootstrap.json and the blind task.json
  npm run hillstrom -- baselines                write code-generated oracle and random predictions (no model calls)
  npm run hillstrom -- prompt [--name vanilla-v1]   print the exact prompt, filled in from task.json
  npm run hillstrom -- report                   score every predictions/<arm>.json, write benchmarks/hillstrom/RESULTS.md`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { name: { type: "string", default: "vanilla-v1" } } });
  switch (positionals[0]) {
    case "prep":
      return prep();
    case "baselines":
      return writeBaselines();
    case "prompt":
      console.log(renderPrompt(values.name));
      return;
    case "report": {
      const md = `${report()}\n`;
      writeFileSync(join(BENCH_DIR, "RESULTS.md"), md);
      console.log(md);
      return;
    }
    default:
      console.log(USAGE);
  }
}

main().catch((err: Error) => {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
});
