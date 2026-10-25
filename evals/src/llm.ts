import { z } from "zod";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ChatRequest {
  system?: string;
  user: string;
  maxTokens: number;
  /** Ask for a JSON-only reply (OpenAI-compatible providers enforce it; Anthropic relies on the prompt). */
  json?: boolean;
  webSearch?: { maxUses: number; blockedDomains: string[] };
  effort?: "low" | "medium" | "high";
}

export interface ChatResult {
  text: string;
  citations: string[];
  inputTokens: number;
  outputTokens: number;
  warnings: string[];
}

export type ChatFn = (req: ChatRequest) => Promise<ChatResult>;

type Provider = "anthropic" | "dashscope" | "openai";
const PROVIDERS: readonly Provider[] = ["anthropic", "dashscope", "openai"];

/** "anthropic:claude-opus-5-5" → a chat function for that model. */
export function chatFor(modelRef: string): ChatFn {
  const i = modelRef.indexOf(":");
  const provider = modelRef.slice(0, i);
  const model = modelRef.slice(i + 1);
  if (i < 1 || !model || !isProvider(provider)) {
    throw new Error(`Bad model "${modelRef}". Use <provider>:<model>, provider one of ${PROVIDERS.join(", ")}`);
  }
  if (provider === "anthropic") return (req) => anthropicChat(model, req);
  return (req) => openAiCompatibleChat(provider, model, req);
}

function isProvider(s: string): s is Provider {
  return (PROVIDERS as readonly string[]).includes(s);
}

/** DASHSCOPE_BASE_URL, else the host from the vault's openai_api_endpoint, else the public endpoint. */
export function dashscopeBase(): string {
  if (process.env.DASHSCOPE_BASE_URL) return process.env.DASHSCOPE_BASE_URL;
  const endpoint = process.env.openai_api_endpoint;
  if (endpoint) return `https://${new URL(endpoint).host}/compatible-mode/v1`;
  return "https://dashscope.aliyuncs.com/compatible-mode/v1";
}

export function requireEnv(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  throw new Error(`Missing API key: set ${names.join(" or ")} (e.g. run through vault-run)`);
}

/** `label` names the provider in errors so endpoint hosts (a vault secret) never reach logs. */
export async function postJson(label: string, url: string, body: JsonValue, headers: Array<[string, string]>): Promise<JsonValue> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: [["content-type", "application/json"], ...headers],
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });
    if (res.ok) return (await res.json()) as JsonValue;
    const retryable = res.status === 429 || res.status >= 500;
    const detail = (await res.text()).slice(0, 300);
    if (!retryable || attempt >= 2) throw new Error(`HTTP ${res.status} from ${label}: ${detail}`);
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

// ---------- Anthropic (native Messages API, server-side web search) ----------

const AnthropicBlock = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
  citations: z.array(z.looseObject({ url: z.string().optional() })).nullish(),
  content: z.union([z.array(z.looseObject({ url: z.string().optional() })), z.looseObject({ error_code: z.string().optional() })]).optional(),
});
const AnthropicResponse = z.looseObject({
  content: z.array(AnthropicBlock),
  stop_reason: z.string().nullable(),
  usage: z.looseObject({ input_tokens: z.number(), output_tokens: z.number() }),
});

async function anthropicChat(model: string, req: ChatRequest): Promise<ChatResult> {
  const key = requireEnv("ANTHROPIC_API_KEY");
  const tools: JsonValue = req.webSearch
    ? [{ type: "web_search_20260209", name: "web_search", max_uses: req.webSearch.maxUses, blocked_domains: req.webSearch.blockedDomains }]
    : [];
  const messages: JsonValue[] = [{ role: "user", content: req.user }];
  const out: ChatResult = { text: "", citations: [], inputTokens: 0, outputTokens: 0, warnings: [] };

  // Server-side tool loops can stop with pause_turn; resend to let the model continue.
  for (let turn = 0; turn < 6; turn++) {
    const body: JsonValue = {
      model,
      max_tokens: req.maxTokens,
      messages,
      output_config: { effort: req.effort ?? "medium" },
      ...(req.system ? { system: req.system } : {}),
      ...(req.webSearch ? { tools } : {}),
    };
    const raw = await postJson("anthropic", "https://api.anthropic.com/v1/messages", body, [["x-api-key", key], ["anthropic-version", "2023-06-01"]]);
    const res = AnthropicResponse.parse(raw);
    out.inputTokens += res.usage.input_tokens;
    out.outputTokens += res.usage.output_tokens;
    if (res.stop_reason === "refusal") throw new Error("Model refused the request");

    for (const b of res.content) {
      if (b.type === "text" && b.text) out.text += b.text;
      for (const c of b.citations ?? []) if (c.url) out.citations.push(c.url);
      if (b.type === "web_search_tool_result" && b.content && !Array.isArray(b.content) && b.content.error_code) {
        out.warnings.push(`web search error: ${b.content.error_code}`);
      }
    }
    if (res.stop_reason !== "pause_turn") break;
    const rawContent = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw["content"] : null;
    messages.push({ role: "assistant", content: rawContent ?? [] });
  }
  if (isBlank(out.text)) throw new Error("Model returned no text");
  out.citations = [...new Set(out.citations)];
  return out;
}

function isBlank(s: string): boolean {
  return s.trim().length === 0;
}

// ---------- OpenAI-compatible (DashScope, OpenAI, or any compatible endpoint) ----------

const OpenAiResponse = z.looseObject({
  choices: z.array(z.looseObject({ message: z.looseObject({ content: z.string().nullable() }), finish_reason: z.string().nullish() })).min(1),
  usage: z.looseObject({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
});

async function openAiCompatibleChat(provider: "dashscope" | "openai", model: string, req: ChatRequest): Promise<ChatResult> {
  if (req.webSearch) {
    throw new Error(`The search variant needs domain blocking, which ${provider} doesn't support here. Use an anthropic: model.`);
  }
  const base = provider === "dashscope" ? dashscopeBase() : process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const key = provider === "dashscope" ? requireEnv("DASHSCOPE_API_KEY", "deepseek_model_api_key") : requireEnv("OPENAI_API_KEY");
  const messages: JsonValue[] = [
    ...(req.system ? [{ role: "system", content: req.system }] : []),
    { role: "user", content: req.user },
  ];
  const body: JsonValue = {
    model,
    messages,
    max_tokens: req.maxTokens,
    ...(req.json ? { response_format: { type: "json_object" } } : {}),
  };
  const res = OpenAiResponse.parse(await postJson(provider, `${base}/chat/completions`, body, [["authorization", `Bearer ${key}`]]));
  const text = res.choices[0]?.message.content ?? "";
  if (isBlank(text)) throw new Error(`Model returned no text (finish_reason: ${res.choices[0]?.finish_reason ?? "unknown"})`);
  const warnings = res.choices[0]?.finish_reason === "length" ? ["output hit max_tokens and may be cut off"] : [];
  return {
    text,
    citations: [],
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    warnings,
  };
}
