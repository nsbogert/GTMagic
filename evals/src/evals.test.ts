import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOwnerPrompt, importRun } from "./baseline";
import { renderBoard } from "./board";
import { toCrossCheck } from "./crosscheck";
import { applyDraft, evidenceFound, extractJson, findLeaks, judgeRun } from "./judge";
import type { ChatFn, ChatRequest } from "./llm";
import type { JudgeDraft } from "./schema";
import { loadAnswerKey, loadCase } from "./store";

const CASE = "refactor-fitness";
const key = loadAnswerKey(CASE);
const input = loadCase(CASE);

const OUTPUT = `## Who to target
**Lead with people losing weight on GLP-1 medications** who worry about losing muscle.
Your guess (self-led lifters) is too crowded to lead with.

## What to say
“Keep your strength while the scale goes down.”`;

const run = importRun(input, "test", OUTPUT, "test.md");

function draft(overrides: Partial<Record<string, { score: 0 | 1 | 2; evidence: string }>>): JudgeDraft {
  return {
    items: key.items.map((k) => ({ id: k.id, score: 0, evidence: "", reason: "r", ...overrides[k.id] })),
  };
}

describe("evidence matching", () => {
  it("ignores markdown, case, curly quotes and whitespace", () => {
    assert.ok(evidenceFound("Lead with people losing weight on GLP-1 medications", OUTPUT));
    assert.ok(evidenceFound('"Keep your strength while the scale goes down."', OUTPUT));
  });
  it("accepts fragments joined by an ellipsis only if each fragment is present", () => {
    assert.ok(evidenceFound("losing weight on GLP-1 medications ... too crowded to lead with", OUTPUT));
    assert.ok(!evidenceFound("losing weight on GLP-1 medications ... invented sentence here", OUTPUT));
  });
  it("rejects paraphrases and tiny quotes", () => {
    assert.ok(!evidenceFound("Target GLP-1 users who fear muscle loss", OUTPUT));
    assert.ok(!evidenceFound("GLP", OUTPUT));
  });
});

describe("applyDraft", () => {
  it("keeps verified points, zeroes unverified ones, and fills skipped items", () => {
    const d = draft({
      "primary-segment": { score: 2, evidence: "Lead with people losing weight on GLP-1 medications who worry about losing muscle." },
      "core-message": { score: 2, evidence: "Lose the weight, keep the muscle" },
    });
    d.items = d.items.filter((i) => i.id !== "channels");
    const s = applyDraft(key, run, d, "fake:judge");
    assert.equal(s.items.find((i) => i.id === "primary-segment")?.score, 2);
    assert.equal(s.items.find((i) => i.id === "core-message")?.score, 0);
    assert.equal(s.judgeTotal, 4);
    assert.equal(s.total, 2);
    assert.equal(s.max, key.items.length * 2);
    assert.ok(s.warnings.some((w) => w.includes("channels")));
  });
  it("flags outputs that mention the real business", () => {
    assert.deepEqual(findLeaks("Apps like Refactor Fitness already do this", key.leakTerms), ["Refactor Fitness"]);
  });
});

describe("judgeRun", () => {
  it("is blind and retries once on unusable JSON", async () => {
    const seen: ChatRequest[] = [];
    const replies = ["not json", "```json\n" + JSON.stringify(draft({ "guess-verdict": { score: 2, evidence: "Your guess (self-led lifters) is too crowded to lead with." } })) + "\n```"];
    const chat: ChatFn = async (req) => {
      seen.push(req);
      return { text: replies[seen.length - 1] ?? "", citations: [], inputTokens: 0, outputTokens: 0, warnings: [] };
    };
    const s = await judgeRun(chat, "fake:judge", key, { ...run, label: "SECRET-LABEL", model: "SECRET-MODEL" });
    assert.equal(seen.length, 2);
    assert.equal(s.total, 2);
    for (const req of seen) assert.ok(!req.user.includes("SECRET"), "judge must not see the run's label or model");
  });
  it("extracts JSON wrapped in prose", () => {
    assert.equal(extractJson('Here you go: {"items": []} hope that helps'), '{"items": []}');
  });
});

describe("case files", () => {
  it("baseline prompt carries the starting guess but never the answer", () => {
    const prompt = buildOwnerPrompt(input.brief);
    assert.ok(prompt.includes(input.brief.idealCustomerGuess ?? "missing"));
    assert.deepEqual(findLeaks(prompt, [...key.leakTerms, "GLP-1", "lose weight", "weight loss", "over 40"]), []);
  });
  it("blocks the business's own domains from web search", () => {
    assert.ok(input.blockedDomains.includes("refactorfitness.app"));
  });
});

describe("toCrossCheck", () => {
  it("turns level probabilities into expected points and treats missing items as 0", () => {
    const cc = toCrossCheck(key, {
      "primary-segment": { probabilities: { full: 0.5, partial: 0.3, none: 0.2 } },
      "core-message": { probabilities: { full: 1 } },
    });
    assert.equal(cc.items.find((i) => i.id === "primary-segment")?.expected, 1.3);
    assert.equal(cc.items.find((i) => i.id === "channels")?.expected, 0);
    assert.equal(cc.total, 3.3);
  });
});

describe("renderBoard", () => {
  it("ranks approaches by mean score", () => {
    const low = applyDraft(key, { ...run, id: "a", label: "one prompt" }, draft({}), "j");
    const high = applyDraft(key, { ...run, id: "b", label: "gtmagic" }, draft({ "primary-segment": { score: 2, evidence: "Lead with people losing weight on GLP-1 medications" } }), "j");
    const md = renderBoard(key, [low, high]);
    assert.ok(md.indexOf("| gtmagic |") < md.indexOf("| one prompt |"));
  });
});
