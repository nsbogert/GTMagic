import type { ChatFn } from "./llm";
import type { Brief, CaseInput, RunRecord, Variant } from "./schema";
import { slug } from "./store";

const SEARCH_MAX_USES = 5;

/** What a typical owner would type into a chat assistant: one message, no system prompt, no method. */
export function buildOwnerPrompt(brief: Brief): string {
  const lines = ["I need help with go-to-market for my business.", "", `What we do: ${brief.description}`];
  if (brief.stage) lines.push(`Stage: ${brief.stage}`);
  if (brief.pricing) lines.push(`Pricing: ${brief.pricing}`);
  if (brief.idealCustomerGuess) lines.push(`Who I think my best customer is: ${brief.idealCustomerGuess}`);
  if (brief.currentMessage) {
    const sub = brief.currentMessage.subheadline ? ` ${brief.currentMessage.subheadline}` : "";
    lines.push(`My current headline: "${brief.currentMessage.headline}"${sub}`);
  }
  if (brief.customerLanguage) lines.push("", "What customers have told me:", brief.customerLanguage);
  lines.push(
    "",
    "Please tell me:",
    "1. Who I should target first, and whether my guess is right",
    "2. What I should say to them",
    "3. What I should try this week to test it",
  );
  return lines.join("\n");
}

export async function runBaseline(opts: {
  chat: ChatFn;
  model: string;
  input: CaseInput;
  variant: Exclude<Variant, "import">;
  index: number;
}): Promise<RunRecord> {
  const { chat, model, input, variant, index } = opts;
  const prompt = buildOwnerPrompt(input.brief);
  const started = Date.now();
  const res = await chat({
    user: prompt,
    maxTokens: 16000,
    effort: "medium",
    ...(variant === "search" ? { webSearch: { maxUses: SEARCH_MAX_USES, blockedDomains: input.blockedDomains } } : {}),
  });
  const createdAt = new Date().toISOString();
  const modelName = model.slice(model.indexOf(":") + 1);
  return {
    id: `${variant}-${slug(modelName)}-${createdAt.replace(/[:.]/g, "").toLowerCase()}-${index}`,
    caseId: input.id,
    variant,
    label: `one prompt${variant === "search" ? " + web search" : ""} · ${modelName}`,
    model,
    createdAt,
    prompt,
    output: res.text,
    citations: res.citations,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    durationMs: Date.now() - started,
    warnings: res.warnings,
  };
}

export function importRun(input: CaseInput, label: string, output: string, fileName: string): RunRecord {
  const createdAt = new Date().toISOString();
  return {
    id: `import-${slug(label)}-${createdAt.replace(/[:.]/g, "").toLowerCase()}`,
    caseId: input.id,
    variant: "import",
    label,
    createdAt,
    prompt: `(imported from ${fileName})`,
    output,
    citations: [],
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    warnings: [],
  };
}
