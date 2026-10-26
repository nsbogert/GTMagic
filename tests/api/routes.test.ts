import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { GET as businesses } from "@/app/api/businesses/route";
import { GET as business } from "@/app/api/businesses/[slug]/route";
import { GET as download } from "@/app/api/businesses/[slug]/intake.json/route";
import { GET as session } from "@/app/api/sessions/[id]/route";
import { POST as answer } from "@/app/api/sessions/[id]/answer/route";
import { MAX_ANSWER_BYTES } from "@/app/_session/store";
import nextConfig from "../../next.config";

const demo = readFileSync("fixtures/demo/intake.json", "utf8");
const SID = "abcd1234ef";
let root: string;

const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const line = (o: object) => JSON.stringify({ at: "2026-10-25T12:00:00.000Z", ...o }) + "\n";

function post(form: FormData) {
  return answer(new Request("http://x/api", { method: "POST", body: form }), params({ id: SID }));
}
function form(askId: string, text: string, files: File[] = []) {
  const f = new FormData();
  f.set("askId", askId);
  f.set("text", text);
  for (const file of files) f.append("files", file);
  return f;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "gtm-api-"));
  process.env.GTM_ROOT = root;
  const s = join(root, "gtm-workspace", ".sessions", SID);
  mkdirSync(join(s, "uploads"), { recursive: true });
  writeFileSync(join(s, "session.json"), JSON.stringify({ id: SID, business: "acme" }));
  writeFileSync(join(s, "transcript.jsonl"), line({ id: "ev-1", kind: "ask", questions: ["Price?"] }));
  mkdirSync(join(root, "gtm-workspace", "acme"), { recursive: true });
  writeFileSync(join(root, "gtm-workspace", "acme", "intake.json"), demo);
});

describe("API routes", () => {
  it("identifies itself for the bridge's health check", async () => {
    expect(await (await health()).json()).toEqual({ app: "gtmagic" });
  });

  it("lists businesses and live sessions", async () => {
    const body = await (await businesses()).json();
    expect(body.businesses.map((b: { slug: string }) => b.slug)).toEqual(["demo", "acme"]);
    expect(body.sessions[0].id).toBe(SID);
  });

  it("returns 404 for an unsafe business name", async () => {
    expect((await business(new Request("http://x"), params({ slug: "..%2Fetc" }))).status).toBe(404);
  });

  it("downloads the raw save file byte for byte", async () => {
    const r = await download(new Request("http://x"), params({ slug: "acme" }));
    expect(r.headers.get("content-disposition")).toContain("attachment");
    expect(await r.text()).toBe(demo);
  });

  it("shows the session with its open question and linked save file", async () => {
    const body = await (await session(new Request("http://x"), params({ id: SID }))).json();
    expect(body.openAsk).toBe("ev-1");
    expect(body.brief.business.name).toBe("KeepStrong (fictional)");
  });

  it("accepts the first answer and rejects a second with 409", async () => {
    expect((await post(form("ev-1", "$14.99"))).status).toBe(200);
    expect((await post(form("ev-1", "again"))).status).toBe(409);
  });

  it("rejects an answer to a cancelled question with 409", async () => {
    writeFileSync(join(root, "gtm-workspace", ".sessions", SID, "transcript.jsonl"),
      line({ id: "ev-1", kind: "ask", questions: ["Price?"] }) + line({ id: "ev-2", kind: "cancel", askId: "ev-1" }));
    expect((await post(form("ev-1", "late"))).status).toBe(409);
  });

  it("stores uploads under a safe name inside uploads/", async () => {
    const r = await post(form("ev-1", "here", [new File(["a,b"], "../../etc/passwd.csv", { type: "text/csv" })]));
    expect(r.status).toBe(200);
    const t = readFileSync(join(root, "gtm-workspace", ".sessions", SID, "transcript.jsonl"), "utf8");
    expect(t).toContain('"files":["uploads/passwd.csv"]');
    expect(readFileSync(join(root, "gtm-workspace", ".sessions", SID, "uploads", "passwd.csv"), "utf8")).toBe("a,b");
  });

  it("refuses files over 10 MB with 413 and unknown types with 415", async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.csv");
    expect((await post(form("ev-1", "x", [big]))).status).toBe(413);
    expect((await post(form("ev-1", "x", [new File(["x"], "run.exe")]))).status).toBe(415);
  });

  it("refuses an answer whose files are too big together, before reading it", async () => {
    const r = await answer(new Request("http://x", { method: "POST", body: "x", headers: { "content-length": String(MAX_ANSWER_BYTES + 1) } }), params({ id: SID }));
    expect(r.status).toBe(413);
  });

  it("explains a cut-off upload instead of crashing", async () => {
    const cut = "--b\r\ncontent-disposition: form-data; name=\"files\"; filename=\"a.csv\"\r\n\r\na,b"; // no closing boundary
    const r = await answer(new Request("http://x", { method: "POST", body: cut, headers: { "content-type": "multipart/form-data; boundary=b" } }), params({ id: SID }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/Couldn't read that upload/);
  });

  it("keeps the proxy's body buffer above the answer limit, so uploads aren't cut off", () => {
    const limit = /^(\d+)mb$/.exec(String(nextConfig.experimental?.proxyClientMaxBodySize))?.[1];
    expect(Number(limit) * 1024 * 1024).toBeGreaterThan(MAX_ANSWER_BYTES);
  });

  it("returns 404 for an unknown session", async () => {
    const r = await answer(new Request("http://x", { method: "POST", body: form("ev-1", "x") }), params({ id: "zzzz9999zz" }));
    expect(r.status).toBe(404);
  });
});
