import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { writeBatches } from "./batches";
import { runDecision } from "./decision";
import { prep } from "./prep";
import { ensemble, report } from "./score";
import { simPrep, simTally } from "./sim";
import { BENCH_DIR, type Split } from "./types";

const USAGE = `Upworthy headline benchmark (pick the winners among 4–8 real A/B-tested headlines)

  npm run upworthy -- prep                     download OSF files, build train/val/test truth files
  npm run upworthy -- batches                  write blind batch files + the train study file
  vault-run aliyun -- npm run upworthy -- decide --split val|test     decision-model choice arm
  npm run upworthy -- ensemble --a <arm> --b <arm> --name <arm> --split val|test
  npm run upworthy -- simprep  --split val [--version pipeline-v1]  per-agent blind files after sim/<version>/icp.json exists
  npm run upworthy -- simtally --split val [--version pipeline-v1]  S6: tally agent answers → predictions/<version>/<split>.json
  npm run upworthy -- report [--baseline vanilla-opus]               write benchmarks/upworthy/RESULTS.md`;

const asSplit = (s: string | undefined): Split => {
  if (s === "train" || s === "val" || s === "test") return s;
  throw new Error("--split must be train, val or test");
};

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      split: { type: "string" },
      a: { type: "string" },
      b: { type: "string" },
      name: { type: "string" },
      baseline: { type: "string", default: "vanilla-opus" },
      version: { type: "string", default: "pipeline-v1" },
    },
  });
  switch (positionals[0]) {
    case "prep":
      return prep();
    case "batches":
      return writeBatches();
    case "simprep":
      return simPrep(values.version, asSplit(values.split));
    case "simtally":
      return simTally(values.version, asSplit(values.split));
    case "decide":
      return runDecision(asSplit(values.split));
    case "ensemble":
      if (!values.a || !values.b || !values.name) throw new Error("ensemble needs --a, --b and --name");
      return ensemble(values.a, values.b, values.name, asSplit(values.split));
    case "report": {
      const md = [
        "# Upworthy headline benchmark: results",
        "",
        "Real A/B tests from the [Upworthy Research Archive](https://osf.io/jd64p/) (CC BY 4.0). Each test has 4–8 headlines for one article and a statistically clear winner. Arms see only the article opening and the headlines.",
        "",
        "- **Winner = our #1 / in our top 3:** how often the real winner is the arm's first pick / among its top 3 (what you'd put money behind).",
        "- **Gain captured:** how much of the possible CTR gain over the average headline the arm's picks capture (100% = perfect picks, 0% = random).",
        "- **Kendall τ:** rank agreement with real CTR (−1 to 1).",
        "",
        report("val", values.baseline),
        "",
        report("test", values.baseline),
        "",
      ].join("\n");
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
