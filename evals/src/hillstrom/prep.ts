import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parse } from "csv-parse/sync";
import { mulberry32 } from "../upworthy/rng";
import { SEGMENT_DEFS } from "./segments";
import { convRate, diffOf, holm, visitRate } from "./stats";
import {
  ARMS,
  BENCH_DIR,
  BUSINESS,
  CAMPAIGNS,
  DATA_DIR,
  EMAILS,
  LIMITATION,
  OUTCOME,
  type Arm,
  type ArmCounts,
  type Customer,
  type OutcomeTruth,
  type SegmentTruth,
  type Task,
  type Truth,
  type TruthBootstrap,
} from "./types";

/** Kevin Hillstrom's MineThatData E-Mail Analytics challenge (2008); fallback is the scikit-uplift fetch_hillstrom copy. */
const SOURCES = [
  { url: "http://www.minethatdata.com/Kevin_Hillstrom_MineThatData_E-MailAnalytics_DataMiningChallenge_2008.03.20.csv", gzip: false },
  { url: "https://hillstorm1.s3.us-east-2.amazonaws.com/hillstorm_no_indices.csv.gz", gzip: true },
];
const CSV_PATH = join(DATA_DIR, "hillstrom.csv");
export const MIN_SEGMENT_SIZE = 1500;
const BOOT_REPS = 500;
const BOOT_SEED = 20261025;

const ARM_OF: Record<string, Arm> = { "Mens E-Mail": "mens", "Womens E-Mail": "womens", "No E-Mail": "control" };

async function download(): Promise<{ path: string; url: string }> {
  const meta = join(DATA_DIR, "source.txt");
  if (existsSync(CSV_PATH)) return { path: CSV_PATH, url: existsSync(meta) ? readFileSync(meta, "utf8").trim() : SOURCES[0]!.url };
  mkdirSync(DATA_DIR, { recursive: true });
  for (const { url, gzip } of SOURCES) {
    try {
      console.log(`downloading ${url}…`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(CSV_PATH, gzip ? gunzipSync(buf) : buf);
      writeFileSync(meta, `${url}\n`);
      return { path: CSV_PATH, url };
    } catch (err) {
      console.error(`  failed: ${(err as Error).message}`);
    }
  }
  throw new Error("could not download the Hillstrom dataset from any source");
}

function loadCustomers(text: string): Customer[] {
  const rows = parse(text, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  return rows.map((r) => {
    const arm = ARM_OF[r.segment ?? ""];
    const zip = r.zip_code === "Surburban" ? "Suburban" : r.zip_code; // the source file misspells "Suburban"
    if (!arm || (zip !== "Urban" && zip !== "Suburban" && zip !== "Rural")) throw new Error(`unexpected row: ${JSON.stringify(r)}`);
    const channel = r.channel as Customer["channel"];
    if (!["Phone", "Web", "Multichannel"].includes(channel)) throw new Error(`unexpected channel: ${channel}`);
    return {
      recency: Number(r.recency),
      historyBand: Number.parseInt(r.history_segment ?? "", 10),
      mens: r.mens === "1",
      womens: r.womens === "1",
      zip,
      newbie: r.newbie === "1",
      channel,
      arm,
      visit: Number(r.visit),
      conversion: Number(r.conversion),
    };
  });
}

const emptyArms = (): Record<Arm, ArmCounts> => ({
  control: { n: 0, visits: 0, conversions: 0 },
  mens: { n: 0, visits: 0, conversions: 0 },
  womens: { n: 0, visits: 0, conversions: 0 },
});

function countArms(cs: Customer[]): Record<Arm, ArmCounts> {
  const out = emptyArms();
  for (const c of cs) {
    out[c.arm].n++;
    out[c.arm].visits += c.visit;
    out[c.arm].conversions += c.conversion;
  }
  return out;
}

function outcome(a: Record<Arm, ArmCounts>, rate: typeof visitRate): OutcomeTruth {
  const r = { control: rate(a.control), mens: rate(a.mens), womens: rate(a.womens) };
  return {
    rate: { control: +(100 * r.control[0]).toFixed(3), mens: +(100 * r.mens[0]).toFixed(3), womens: +(100 * r.womens[0]).toFixed(3) },
    mensVsControl: diffOf([[1, r.mens], [-1, r.control]]),
    womensVsControl: diffOf([[1, r.womens], [-1, r.control]]),
    mensVsWomens: diffOf([[1, r.mens], [-1, r.womens]]),
  };
}

function rest(all: Record<Arm, ArmCounts>, seg: Record<Arm, ArmCounts>): Record<Arm, ArmCounts> {
  const out = emptyArms();
  for (const a of ARMS) out[a] = { n: all[a].n - seg[a].n, visits: all[a].visits - seg[a].visits, conversions: all[a].conversions - seg[a].conversions };
  return out;
}

function segmentTruths(customers: Customer[], overall: Record<Arm, ArmCounts>): SegmentTruth[] {
  const kept = SEGMENT_DEFS.map((d) => ({ d, cs: customers.filter(d.test) })).filter(({ cs }) => cs.length >= MIN_SEGMENT_SIZE);
  const segs = kept.map(({ d, cs }, i): SegmentTruth => {
    const arms = countArms(cs);
    const r = rest(overall, arms);
    const vsRest = (email: "mens" | "womens") =>
      diffOf([[1, visitRate(arms[email])], [-1, visitRate(arms.control)], [-1, visitRate(r[email])], [1, visitRate(r.control)]]);
    const visit = { ...outcome(arms, visitRate), mensVsRest: vsRest("mens"), womensVsRest: vsRest("womens") };
    const mw = visit.mensVsWomens;
    return {
      id: `S${String(i + 1).padStart(2, "0")}`,
      key: d.key,
      description: d.description,
      n: cs.length,
      arms,
      visit,
      conversion: outcome(arms, convRate),
      betterEmail: mw.sig ? (mw.diff > 0 ? "mens" : "womens") : null,
      betterEmailHolm: null,
    };
  });
  const holmSig = holm(segs.map((s) => s.visit.mensVsWomens.p));
  segs.forEach((s, i) => (s.betterEmailHolm = holmSig[i] ? s.betterEmail : null));
  return segs;
}

/** Resamples customers within each arm and recomputes every segment's visit uplift. */
function bootstrap(customers: Customer[], segs: SegmentTruth[]): TruthBootstrap {
  const tests = segs.map((s) => SEGMENT_DEFS.find((d) => d.key === s.key)!.test);
  const member = customers.map((c) => tests.flatMap((t, j) => (t(c) ? [j] : [])));
  const byArm = Object.fromEntries(ARMS.map((a) => [a, customers.flatMap((c, i) => (c.arm === a ? [i] : []))])) as Record<Arm, number[]>;
  const rng = mulberry32(BOOT_SEED);
  const out: TruthBootstrap = { reps: BOOT_REPS, seed: BOOT_SEED, mens: segs.map(() => []), womens: segs.map(() => []) };
  for (let r = 0; r < BOOT_REPS; r++) {
    const rate = {} as Record<Arm, number[]>;
    for (const a of ARMS) {
      const n = new Float64Array(segs.length), v = new Float64Array(segs.length);
      const idx = byArm[a];
      for (let k = 0; k < idx.length; k++) {
        const c = idx[Math.floor(rng() * idx.length)]!;
        for (const j of member[c]!) {
          n[j]!++;
          v[j]! += customers[c]!.visit;
        }
      }
      rate[a] = Array.from(n, (nj, j) => (nj > 0 ? v[j]! / nj : 0));
    }
    for (const e of EMAILS) segs.forEach((_, j) => out[e][j]!.push(+(100 * (rate[e][j]! - rate.control[j]!)).toFixed(2)));
  }
  return out;
}

export async function prep(): Promise<void> {
  const { path, url } = await download();
  const text = readFileSync(path, "utf8");
  const customers = loadCustomers(text);
  const overallArms = countArms(customers);
  const segments = segmentTruths(customers, overallArms);
  const truth: Truth = {
    source: { url, sha256: createHash("sha256").update(text).digest("hex"), rows: customers.length },
    minSegmentSize: MIN_SEGMENT_SIZE,
    overall: { arms: overallArms, visit: outcome(overallArms, visitRate), conversion: outcome(overallArms, convRate) },
    segments,
  };
  const task: Task = {
    benchmark: "hillstrom-segments-v1",
    business: BUSINESS,
    outcome: OUTCOME,
    limitation: LIMITATION,
    campaigns: EMAILS.map((id) => ({ id, description: CAMPAIGNS[id] })),
    segments: segments.map((s) => ({ id: s.id, description: s.description, customers: s.n })),
  };
  mkdirSync(BENCH_DIR, { recursive: true });
  writeFileSync(join(BENCH_DIR, "truth.json"), `${JSON.stringify(truth, null, 1)}\n`);
  writeFileSync(join(BENCH_DIR, "task.json"), `${JSON.stringify(task, null, 1)}\n`);
  console.log(`bootstrapping ${BOOT_REPS} replicates…`);
  writeFileSync(join(BENCH_DIR, "truth.bootstrap.json"), `${JSON.stringify(bootstrap(customers, segments))}\n`);

  const v = truth.overall.visit;
  console.log(`${customers.length} customers; visit rate control ${v.rate.control}%, mens ${v.rate.mens}%, womens ${v.rate.womens}%`);
  console.log(`uplift: mens ${v.mensVsControl.diff}pp [${v.mensVsControl.lo}, ${v.mensVsControl.hi}], womens ${v.womensVsControl.diff}pp [${v.womensVsControl.lo}, ${v.womensVsControl.hi}]`);
  const dropped = SEGMENT_DEFS.length - segments.length;
  console.log(`${segments.length} segments (n ${Math.min(...segments.map((s) => s.n))}–${Math.max(...segments.map((s) => s.n))}), ${dropped} dropped for n < ${MIN_SEGMENT_SIZE}`);
  const count = (f: (s: SegmentTruth) => boolean) => segments.filter(f).length;
  console.log(`mens vs womens (visits) significant: ${count((s) => s.betterEmail !== null)} unadjusted (${count((s) => s.betterEmail === "mens")} mens, ${count((s) => s.betterEmail === "womens")} womens), ${count((s) => s.betterEmailHolm !== null)} after Holm`);
  console.log(`uplift differs from rest of customers: mens ${count((s) => s.visit.mensVsRest.sig)}, womens ${count((s) => s.visit.womensVsRest.sig)}`);
}
