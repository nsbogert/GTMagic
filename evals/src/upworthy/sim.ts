import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadTruth } from "./batches";
import { mulberry32, shuffle } from "./rng";
import { BENCH_DIR, type Predictions, type Split, type UpworthyTest } from "./types";

export const ICP = z.object({
  segments: z.array(z.object({ segmentId: z.string(), description: z.string(), weight: z.number() })).min(1),
  personas: z.array(z.object({ personaId: z.string(), segmentId: z.string(), summary: z.string() })).min(1),
});
type Icp = z.infer<typeof ICP>;

const AgentAnswer = z.object({
  ratings: z.record(z.string(), z.number()),
  click: z.record(z.string(), z.boolean()),
  pick: z.string(),
});
const AgentOutput = z.record(z.string(), AgentAnswer);

const TESTS_PER_FILE = 40;
const SEED = 515;
const simDir = (version: string, split: Split) => join(BENCH_DIR, "sim", version, split);
const agentId = (k: number) => `agent-${String(k).padStart(2, "0")}`;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function renderAgentPrompt(icp: Icp, k: number, channel: string): string {
  const tpl = readFileSync(join(BENCH_DIR, "prompts", "sim-agent-v1.md"), "utf8").split("\n").slice(2).join("\n").trimStart();
  const persona = icp.personas[k - 1];
  if (!persona) throw new Error(`no persona ${k}`);
  return tpl.replace("{{PERSONA}}", persona.summary).replace("{{CHANNEL}}", channel);
}

/** Per agent: rendered prompt, blind test files with its own option order, and a private id → label map. */
export function simPrep(version: string, split: Split): void {
  const base = join(BENCH_DIR, "sim", version);
  const icp = ICP.parse(JSON.parse(readFileSync(join(base, "icp.json"), "utf8")));
  const channel = readFileSync(join(BENCH_DIR, "prompts", "channel-v1.txt"), "utf8").trim();
  const tests = loadTruth(split);
  const dir = simDir(version, split);
  mkdirSync(join(dir, "maps"), { recursive: true });
  icp.personas.forEach((_, i) => {
    const k = i + 1;
    const aDir = join(dir, agentId(k));
    mkdirSync(aDir, { recursive: true });
    writeFileSync(join(aDir, "prompt.md"), `${renderAgentPrompt(icp, k, channel)}\n`);
    const map: Record<string, Record<string, string>> = {};
    for (let f = 0; f * TESTS_PER_FILE < tests.length; f++) {
      const chunk = tests.slice(f * TESTS_PER_FILE, (f + 1) * TESTS_PER_FILE).map((t) => {
        const order = shuffle(t.headlines, mulberry32(SEED + k * 7919 + hash(t.id)));
        map[t.id] = Object.fromEntries(order.map((h, j) => [`h${j + 1}`, h.label]));
        return { id: t.id, article: t.context, headlines: Object.fromEntries(order.map((h, j) => [`h${j + 1}`, h.text])) };
      });
      writeFileSync(join(aDir, `tests-${f + 1}.json`), `${JSON.stringify(chunk, null, 1)}\n`);
    }
    writeFileSync(join(dir, "maps", `${agentId(k)}.json`), `${JSON.stringify(map)}\n`);
  });
  console.log(`${icp.personas.length} agents × ${Math.ceil(tests.length / TESTS_PER_FILE)} files in ${dir}`);
}

interface Tally { pick: number; click: number; rating: number; n: number }

/** S6: map answers back to labels, tally per ad (overall + per segment), rank, write predictions + PipelineOutput. */
export function simTally(version: string, split: Split): void {
  const base = join(BENCH_DIR, "sim", version);
  const icp = ICP.parse(JSON.parse(readFileSync(join(base, "icp.json"), "utf8")));
  const dir = simDir(version, split);
  const tests = loadTruth(split);
  const files = Math.ceil(tests.length / TESTS_PER_FILE);
  const byTest = new Map<string, { overall: Map<string, Tally>; seg: Map<string, Map<string, Tally>>; none: number; n: number }>();
  const issues: string[] = [];
  let answered = 0;

  icp.personas.forEach((p, i) => {
    const id = agentId(i + 1);
    const map = JSON.parse(readFileSync(join(dir, "maps", `${id}.json`), "utf8")) as Record<string, Record<string, string>>;
    for (let f = 1; f <= files; f++) {
      const path = join(dir, id, `out-${f}.json`);
      if (!existsSync(path)) { issues.push(`${id}: missing out-${f}.json`); continue; }
      let out: z.infer<typeof AgentOutput>;
      try { out = AgentOutput.parse(JSON.parse(readFileSync(path, "utf8"))); }
      catch (e) { issues.push(`${id}/out-${f}: ${(e as Error).message.slice(0, 80)}`); continue; }
      for (const [testId, ans] of Object.entries(out)) {
        const m = map[testId];
        if (!m) continue;
        const ids = Object.keys(m);
        const valid = ids.every((h) => typeof ans.ratings[h] === "number" && typeof ans.click[h] === "boolean") && (ans.pick === "none" || ids.includes(ans.pick));
        if (!valid) { issues.push(`${id}/${testId}: incomplete or invalid answer`); continue; }
        answered++;
        const t = byTest.get(testId) ?? { overall: new Map(), seg: new Map(), none: 0, n: 0 };
        byTest.set(testId, t);
        t.n++;
        if (ans.pick === "none") t.none++;
        const segMap = t.seg.get(p.segmentId) ?? new Map<string, Tally>();
        t.seg.set(p.segmentId, segMap);
        for (const h of ids) {
          const label = m[h]!;
          for (const target of [t.overall, segMap]) {
            const x = target.get(label) ?? { pick: 0, click: 0, rating: 0, n: 0 };
            x.pick += ans.pick === h ? 1 : 0;
            x.click += ans.click[h] ? 1 : 0;
            x.rating += Math.min(7, Math.max(1, ans.ratings[h]!));
            x.n++;
            target.set(label, x);
          }
        }
      }
    }
  });

  const rate = (x: Tally) => ({ pickShare: x.pick / x.n, clickRate: x.click / x.n, meanRating: x.rating / x.n });
  const preds: Predictions = {};
  const outputs: Record<string, object> = {};
  for (const t of tests as UpworthyTest[]) {
    const s = byTest.get(t.id);
    if (!s) continue;
    const perAd = t.headlines.map((h) => {
      const o = s.overall.get(h.label) ?? { pick: 0, click: 0, rating: 0, n: 1 };
      const bySegment = [...s.seg].map(([segmentId, m]) => {
        const x = m.get(h.label) ?? { pick: 0, click: 0, rating: 0, n: 1 };
        return { segmentId, ...rate(x), n: x.n };
      });
      return { id: h.label, ...rate(o), bySegment };
    });
    const ranking = [...perAd].sort((a, b) => b.pickShare - a.pickShare || b.clickRate - a.clickRate || b.meanRating - a.meanRating).map((a) => a.id);
    preds[t.id] = ranking;
    outputs[t.id] = { icp: icp.segments, perAd, noneShare: s.none / s.n, ranking };
  }
  const predDir = join(BENCH_DIR, "predictions", version);
  mkdirSync(predDir, { recursive: true });
  writeFileSync(join(predDir, `${split}.json`), `${JSON.stringify(preds, null, 1)}\n`);
  writeFileSync(join(dir, "pipeline-output.json"), `${JSON.stringify(outputs)}\n`);
  writeFileSync(join(dir, "tally-issues.txt"), `${issues.join("\n")}\n`);
  console.log(`tallied ${answered} agent×test answers over ${Object.keys(preds).length}/${tests.length} tests; ${issues.length} issue(s) (see tally-issues.txt)`);
}
