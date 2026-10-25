import { join } from "node:path";
import { EVALS_DIR } from "../store";

export const BENCH_DIR = join(EVALS_DIR, "benchmarks", "hillstrom");
export const DATA_DIR = join(EVALS_DIR, "data", "hillstrom");

export const EMAILS = ["mens", "womens"] as const;
export type Email = (typeof EMAILS)[number];
export type Arm = Email | "control";
export const ARMS: readonly Arm[] = ["control", "mens", "womens"];

/** How a business owner would describe each campaign. The real email copy and creative are not in the dataset. */
export const CAMPAIGNS: Record<Email, string> = {
  mens: "An email featuring our men's merchandise.",
  womens: "An email featuring our women's merchandise.",
};

export const BUSINESS =
  "We are a retailer selling men's and women's merchandise. Customers buy from us by phone, on our website, or both. " +
  "We emailed customers who had bought from us in the last 12 months and tracked who visited our website in the following two weeks.";

export const OUTCOME =
  "Lift = the share of customers who visited our website in the two weeks after the email, minus the share among similar customers " +
  "who got no email (customers were split at random into Men's email, Women's email and no email).";

export const LIMITATION =
  "The campaign descriptions are paraphrases: the dataset records only which email a customer was sent (\"Mens E-Mail\" or \"Womens E-Mail\"), " +
  "not the subject line, copy, offer or images. Predictions can only use the merchandise focus of each email.";

export interface Customer {
  recency: number;
  /** history_segment code, 1 ($0–100) to 7 ($1,000+). */
  historyBand: number;
  mens: boolean;
  womens: boolean;
  zip: "Urban" | "Suburban" | "Rural";
  newbie: boolean;
  channel: "Phone" | "Web" | "Multichannel";
  arm: Arm;
  visit: number;
  conversion: number;
}

/** A difference in rates, in percentage points, with a 95% CI and two-sided p-value. */
export interface Diff {
  diff: number;
  lo: number;
  hi: number;
  p: number;
  sig: boolean;
}

export interface ArmCounts {
  n: number;
  visits: number;
  conversions: number;
}

export interface OutcomeTruth {
  /** Rate per arm, percent. */
  rate: Record<Arm, number>;
  mensVsControl: Diff;
  womensVsControl: Diff;
  mensVsWomens: Diff;
}

export interface SegmentTruth {
  id: string;
  key: string;
  description: string;
  n: number;
  arms: Record<Arm, ArmCounts>;
  visit: OutcomeTruth & {
    /** Uplift in this segment minus uplift among all other customers: does this segment respond differently? */
    mensVsRest: Diff;
    womensVsRest: Diff;
  };
  conversion: OutcomeTruth;
  /** Email with more visits when Mens vs Womens is significant at 95% (unadjusted); null = no clear winner. */
  betterEmail: Email | null;
  /** Same, after Holm correction across all segments. */
  betterEmailHolm: Email | null;
}

export interface Truth {
  source: { url: string; sha256: string; rows: number };
  minSegmentSize: number;
  overall: { arms: Record<Arm, ArmCounts>; visit: OutcomeTruth; conversion: OutcomeTruth };
  segments: SegmentTruth[];
}

/** Customer-level bootstrap replicates of each segment's visit uplift (pp), for score CIs. */
export interface TruthBootstrap {
  reps: number;
  seed: number;
  /** [segment index][replicate] */
  mens: number[][];
  womens: number[][];
}

export interface Task {
  benchmark: string;
  business: string;
  outcome: string;
  limitation: string;
  campaigns: { id: Email; description: string }[];
  segments: { id: string; description: string; customers: number }[];
}

/** What a predictor returns (see prompts/vanilla-v1.md). */
export interface Predictions {
  better_email: Record<string, string>;
  rank_mens: string[];
  rank_womens: string[];
}
