import { join } from "node:path";
import { EVALS_DIR } from "../store";

export const BENCH_DIR = join(EVALS_DIR, "benchmarks", "upworthy");
export const LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export type Split = "train" | "val" | "test";

export interface Headline {
  label: string;
  text: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface UpworthyTest {
  /** Short id used in prompts, e.g. "test-017". */
  id: string;
  /** Upworthy clickability_test_id. */
  testId: string;
  split: Split;
  createdAt: string;
  /** Opening of the article (lede), HTML stripped. */
  context: string;
  headlines: Headline[];
  /** Label of the headline with the highest CTR. */
  winner: string;
}

/** Predicted ranking per test id: labels from most to fewest expected clicks. */
export type Predictions = Record<string, string[]>;
