/* Session files under gtm-workspace/.sessions/<id>/: session.json, transcript.jsonl, uploads/.
   The app writes only answer events and uploads here (the gtm-web CLI writes everything else). */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { z } from "zod";
import { insideDir, isSafeName, workspaceDir } from "../_intake/workspace";
import { parseTranscript, type TranscriptEvent } from "./events";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = new Set([".csv", ".xlsx", ".txt", ".pdf", ".png", ".jpg", ".jpeg", ".webp"]);
const SessionMetaSchema = z.looseObject({ id: z.string(), business: z.string().nullable().optional() });

export type SessionView = {
  id: string;
  business: string | null;
  events: TranscriptEvent[];
  openAsk: string | null;
  lastEventAt: string | null;
  transcriptUpdatedAt: string | null;
};

export function sessionDir(id: string): string | null {
  if (!isSafeName(id, "session")) return null;
  const d = insideDir(workspaceDir(), ".sessions", id);
  return d && existsSync(join(d, "session.json")) ? d : null;
}

function readEvents(dir: string): TranscriptEvent[] {
  const p = join(dir, "transcript.jsonl");
  return existsSync(p) ? parseTranscript(readFileSync(p, "utf8")) : [];
}

function openAskOf(events: TranscriptEvent[]): string | null {
  const closed = new Set(events.flatMap((e) => (e.kind === "answer" || e.kind === "cancel" ? [e.askId] : [])));
  const open = events.filter((e) => e.kind === "ask" && !closed.has(e.id));
  return open.at(-1)?.id ?? null;
}

export async function readSession(id: string): Promise<SessionView | null> {
  const dir = sessionDir(id);
  if (!dir) return null;
  const meta = SessionMetaSchema.safeParse(JSON.parse(readFileSync(join(dir, "session.json"), "utf8")));
  const events = readEvents(dir);
  const linked = [...events].reverse().find((e) => e.kind === "link");
  const t = await stat(join(dir, "transcript.jsonl")).catch(() => null);
  return {
    id,
    business: (linked?.kind === "link" ? linked.business : null) ?? (meta.success ? meta.data.business ?? null : null),
    events,
    openAsk: openAskOf(events),
    lastEventAt: events.at(-1)?.at ?? null,
    transcriptUpdatedAt: t ? t.mtime.toISOString() : null,
  };
}

export async function listSessions(): Promise<Array<{ id: string; business: string | null; lastEventAt: string | null; done: boolean }>> {
  const base = insideDir(workspaceDir(), ".sessions");
  if (!base) return [];
  const names = await readdir(base).catch(() => [] as string[]);
  const out = [];
  for (const id of names) {
    const s = await readSession(id);
    if (s) out.push({ id, business: s.business, lastEventAt: s.lastEventAt, done: s.events.some((e) => e.kind === "done") });
  }
  return out.sort((a, b) => (b.lastEventAt ?? "").localeCompare(a.lastEventAt ?? ""));
}

function nextId(events: TranscriptEvent[]): string {
  return `ev-${events.reduce((m, e) => Math.max(m, Number(e.id.slice(3)) || 0), 0) + 1}`;
}

export function askIsOpen(id: string, askId: string): boolean {
  const dir = sessionDir(id);
  return dir ? openAskOf(readEvents(dir)) === askId : false;
}

/** Append the owner's answer, if that question is still open. Synchronous, so two posts can't interleave. */
export function appendAnswer(id: string, askId: string, text: string, files: string[]): "ok" | "closed" | "unknown-ask" | "no-session" {
  const dir = sessionDir(id);
  if (!dir) return "no-session";
  const events = readEvents(dir);
  if (!events.some((e) => e.kind === "ask" && e.id === askId)) return "unknown-ask";
  if (openAskOf(events) !== askId) return "closed";
  const ev = { id: nextId(events), at: new Date().toISOString(), kind: "answer", askId, text, from: "page", ...(files.length ? { files } : {}) };
  appendFileSync(join(dir, "transcript.jsonl"), JSON.stringify(ev) + "\n");
  return "ok";
}

export function safeUploadName(name: string): string {
  const cleaned = basename(name.replaceAll("\\", "/")).toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/^\.+/, "");
  return cleaned || "upload";
}

export function checkUpload(file: File): "ok" | "too-large" | "bad-type" {
  if (file.size > MAX_UPLOAD_BYTES) return "too-large";
  return ALLOWED_EXT.has(extname(safeUploadName(file.name))) ? "ok" : "bad-type";
}

/** Save an upload (already checked) and return its path relative to the session folder. */
export async function saveUpload(id: string, file: File): Promise<string | null> {
  const dir = sessionDir(id);
  if (!dir) return null;
  const name = safeUploadName(file.name);
  const ext = extname(name);
  let candidate = name;
  for (let n = 1; existsSync(join(dir, "uploads", candidate)); n++) candidate = `${name.slice(0, -ext.length || undefined)}-${n}${ext}`;
  writeFileSync(join(dir, "uploads", candidate), Buffer.from(await file.arrayBuffer()));
  return `uploads/${candidate}`;
}
