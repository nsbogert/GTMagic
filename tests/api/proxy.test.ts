import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

function req(method: string, headers: Record<string, string>, path = "/api/sessions") {
  return new NextRequest(`http://127.0.0.1:3000${path}`, { method, headers });
}
const passes = (r: NextRequest) => proxy(r).status !== 403;

describe("local-only proxy", () => {
  it("lets the app's own pages read and write", () => {
    expect(passes(req("GET", { host: "127.0.0.1:3000" }, "/session/abcd1234ef"))).toBe(true);
    expect(passes(req("POST", { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }))).toBe(true);
    expect(passes(req("POST", { host: "localhost:3000", origin: "http://localhost:3000" }))).toBe(true);
    expect(passes(req("POST", { host: "[::1]:3000", origin: "http://[::1]:3000" }))).toBe(true);
  });

  it("lets local tools without an Origin through (curl, the ui CLI's health check)", () => {
    expect(passes(req("GET", { host: "127.0.0.1:3000" }, "/api/health"))).toBe(true);
    expect(passes(req("POST", { host: "127.0.0.1:3000" }))).toBe(true);
  });

  it("refuses a DNS-rebound host, for reads too", async () => {
    for (const host of ["evil.example:3000", "127.0.0.1.evil.example:3000", "192.168.1.5:3000", ""]) {
      const r = proxy(req("GET", { host }, "/api/sessions"));
      expect(r.status, host).toBe(403);
      expect(await r.json()).toEqual({ error: expect.stringMatching(/127\.0\.0\.1/) });
    }
  });

  it("refuses writes from another site, even when the host looks local", () => {
    for (const origin of ["https://evil.example", "http://localhost:3000", "http://127.0.0.1:4000", "null"]) {
      expect(proxy(req("POST", { host: "127.0.0.1:3000", origin })).status, origin).toBe(403);
    }
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(proxy(req(method, { host: "127.0.0.1:3000", origin: "https://evil.example" })).status, method).toBe(403);
    }
  });

  it("lets a cross-site page do simple reads it can't see anyway (no CORS headers)", () => {
    expect(passes(req("GET", { host: "127.0.0.1:3000", origin: "https://evil.example" }))).toBe(true);
  });
});
