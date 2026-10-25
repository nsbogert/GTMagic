/* One-click start: run Claude Code headless for a session, with a fixed list of pre-approved
   actions (permission mode dontAsk refuses everything else without prompting). Server-side only. */
import { spawn } from "node:child_process";
import { openSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { appendDone, readMeta, readSession, sessionDir, writeMeta } from "./store";

// The agent reads web pages and owner uploads, so a prompt injection has to be assumed. Every rule
// names exact files or folders: Claude Code matches Bash rules as text, so `scripts/*` also matched
// `scripts/../../../gtm-workspace/x.py`, and bare Read/Grep/Glob reached the whole disk (~/.aws, ~/.ssh).
// The scripts themselves refuse paths outside gtm-workspace/ (gtm-intake/scripts/safe_paths.py).
export const INTAKE_SCRIPTS = ".claude/skills/gtm-intake/scripts";
export const READABLE_DIRS = ["gtm-workspace", ".claude/skills", "fixtures"];
export const DENIED_TOOLS = [
  // Claude Code allows `cd` inside the repo by default; after `cd gtm-workspace/x` the relative rules
  // above would run copies the agent wrote there. Denying it blocks every form (subshells, `builtin cd`).
  "Bash(cd *)", "Bash(cd)",
  // Reads anywhere in the repo are allowed by default; keep env files and git config (remote URLs can
  // carry tokens) out. Read denials also apply to Grep and to shell reads like cat or head; read-only
  // git commands are allowed separately, and the agent never needs git.
  "Read(./**/.env)", "Read(./**/.env.*)", "Read(./.git/**)", "Bash(git *)", "Bash(git)",
];

/** The pre-approved actions. `root` is the repo root, where the agent runs. */
export function allowedTools(root: string = process.cwd()): string[] {
  // One rule per script; " *" stops at the file name, so no path can be tacked on after it.
  const scripts = readdirSync(join(root, INTAKE_SCRIPTS)).filter((f) => /^[a-z0-9_-]+\.py$/.test(f)).sort();
  return [
    "Bash(node .claude/skills/gtm-web/scripts/ui.ts *)", // `ui keep` copies uploads into sources/, so no cp rule
    ...scripts.map((f) => `Bash(python3 ${INTAKE_SCRIPTS}/${f} *)`),
    ...READABLE_DIRS.flatMap((d) => [`Read(./${d}/**)`, `Grep(./${d}/**)`, `Glob(./${d}/**)`]),
    "Edit(./gtm-workspace/**)", // Edit rules cover every file-writing tool (Write makes parent folders); Write(path) rules are ignored
    "WebSearch", "WebFetch", "Skill",
  ];
}

export function claudeArgs(id: string, root?: string): string[] {
  const prompt = [
    `Use the gtm-web skill to run the gtm-intake interview for the owner in the GTMagic web page.`,
    `The web session already exists: its id is ${id}. Don't run \`ui start\`; post everything to session ${id}.`,
    `The owner is in the browser and answers only there. Start by asking them to describe their business in one line.`,
  ].join(" ");
  return [
    "-p", prompt, "--permission-mode", "dontAsk",
    "--allowedTools", allowedTools(root).join(","), "--disallowedTools", DENIED_TOOLS.join(","),
  ];
}

type Spawned = { pid?: number; unref: () => void };
type SpawnFn = (cmd: string, args: string[], opts: { cwd: string; detached: boolean; stdio: ["ignore", number, number] }) => Spawned;

export function launchAgent(id: string, spawnFn: SpawnFn = spawn): number | null {
  const dir = sessionDir(id);
  const meta = readMeta(id);
  if (!dir || !meta) return null;
  const log = openSync(join(dir, "agent.log"), "a");
  const child = spawnFn("claude", claudeArgs(id), { cwd: process.cwd(), detached: true, stdio: ["ignore", log, log] });
  child.unref();
  if (!child.pid) return null;
  writeMeta(id, { ...meta, pid: child.pid });
  return child.pid;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** "none" for sessions started from the terminal; "stopped" when the process is gone. */
export function agentState(id: string): "running" | "stopped" | "none" {
  const pid = readMeta(id)?.pid;
  if (pid === undefined) return "none";
  return alive(pid) ? "running" : "stopped";
}

export function stopAgent(id: string): boolean {
  const meta = readMeta(id);
  if (!meta) return false;
  if (meta.pid !== undefined && alive(meta.pid)) {
    try { process.kill(-meta.pid, "SIGTERM"); } catch { try { process.kill(meta.pid, "SIGTERM"); } catch { /* already gone */ } }
  }
  appendDone(id);
  return true;
}

export async function isFinished(id: string): Promise<boolean> {
  return (await readSession(id))?.events.some((e) => e.kind === "done") ?? false;
}
