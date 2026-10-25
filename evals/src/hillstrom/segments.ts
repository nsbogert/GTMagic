import type { Customer } from "./types";

interface Level {
  key: string;
  /** Clause completing "Customers who …". */
  who: string;
  test: (c: Customer) => boolean;
}

export interface SegmentDef {
  key: string;
  description: string;
  test: (c: Customer) => boolean;
}

const BUYER: Level[] = [
  { key: "buyer=mens-only", who: "bought only men's merchandise from us in the past year", test: (c) => c.mens && !c.womens },
  { key: "buyer=womens-only", who: "bought only women's merchandise from us in the past year", test: (c) => c.womens && !c.mens },
  { key: "buyer=both", who: "bought both men's and women's merchandise from us in the past year", test: (c) => c.mens && c.womens },
];
const TENURE: Level[] = [
  { key: "tenure=new", who: "are new (first purchase from us within the past 12 months)", test: (c) => c.newbie },
  { key: "tenure=returning", who: "have been our customers for more than 12 months", test: (c) => !c.newbie },
];
const RECENCY: Level[] = [
  [1, 3],
  [4, 6],
  [7, 9],
  [10, 12],
].map(([a, b]) => ({ key: `recency=${a}-${b}m`, who: `last bought from us ${a}–${b} months ago`, test: (c: Customer) => c.recency >= a! && c.recency <= b! }));
const CHANNEL: Level[] = [
  { key: "channel=phone", who: "bought from us only by phone in the past year", test: (c) => c.channel === "Phone" },
  { key: "channel=web", who: "bought from us only on our website in the past year", test: (c) => c.channel === "Web" },
  { key: "channel=multichannel", who: "bought from us both by phone and on our website in the past year", test: (c) => c.channel === "Multichannel" },
];
const AREA: Level[] = (["Urban", "Suburban", "Rural"] as const).map((z) => ({
  key: `area=${z.toLowerCase()}`,
  who: `live in ${z === "Urban" ? "an" : "a"} ${z.toLowerCase()} area`,
  test: (c: Customer) => c.zip === z,
}));
// Bands follow the dataset's history_segment codes; 4+5 and 6+7 are merged so every band has ≥ 1,500 customers.
const SPEND: Level[] = [
  { key: "spend=0-100", who: "spent under $100 with us in the past year", test: (c) => c.historyBand === 1 },
  { key: "spend=100-200", who: "spent $100–$200 with us in the past year", test: (c) => c.historyBand === 2 },
  { key: "spend=200-350", who: "spent $200–$350 with us in the past year", test: (c) => c.historyBand === 3 },
  { key: "spend=350-750", who: "spent $350–$750 with us in the past year", test: (c) => c.historyBand === 4 || c.historyBand === 5 },
  { key: "spend=750+", who: "spent $750 or more with us in the past year", test: (c) => c.historyBand >= 6 },
];

const single = (l: Level): SegmentDef => ({ key: l.key, description: `Customers who ${l.who}`, test: l.test });
const cross = (as: Level[], bs: Level[]): SegmentDef[] =>
  as.flatMap((a) =>
    bs.map((b) => ({ key: `${a.key} & ${b.key}`, description: `Customers who ${a.who} and ${b.who}`, test: (c: Customer) => a.test(c) && b.test(c) })),
  );

/** Candidate segments, in a fixed order. prep keeps those with at least MIN_SEGMENT_SIZE customers. */
export const SEGMENT_DEFS: SegmentDef[] = [
  ...[BUYER, TENURE, RECENCY, CHANNEL, AREA, SPEND].flat().map(single),
  ...cross(BUYER, TENURE),
  ...cross(BUYER, CHANNEL),
  ...cross(TENURE, RECENCY),
];
