import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DENIED_TOOLS, INTAKE_SCRIPTS, allowedTools, claudeArgs } from "@/app/_session/launcher";

describe("claudeArgs", () => {
  const args = claudeArgs("abcd1234ef");
  const allowed = args[args.indexOf("--allowedTools") + 1] ?? "";
  const ALLOWED_TOOLS = allowedTools();

  it("runs Claude Code headless, refusing anything not pre-approved", () => {
    expect(args[0]).toBe("-p");
    expect(args).toContain("--permission-mode");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
  });

  it("tells it which session to drive, and not to start another", () => {
    expect(args[1]).toContain("abcd1234ef");
    expect(args[1]).toContain("gtm-web");
    expect(args[1]).toMatch(/don't run `ui start`/i);
  });

  it("pre-approves the addendum's list", () => {
    for (const t of [
      "Bash(node .claude/skills/gtm-web/scripts/ui.ts *)",
      "Bash(python3 .claude/skills/gtm-intake/scripts/validate_intake.py *)",
      "Read(./gtm-workspace/**)", "Grep(./gtm-workspace/**)", "Glob(./gtm-workspace/**)",
      "Read(./.claude/skills/**)", "Read(./fixtures/**)",
      "Edit(./gtm-workspace/**)", "WebSearch", "WebFetch", "Skill",
    ]) expect(ALLOWED_TOOLS).toContain(t);
    expect(allowed).toBe(ALLOWED_TOOLS.join(","));
  });

  it("names every intake script on its own, so no path can follow the folder", () => {
    const scripts = readdirSync(INTAKE_SCRIPTS).filter((f) => f.endsWith(".py"));
    expect(scripts.length).toBeGreaterThan(0);
    for (const f of scripts) expect(ALLOWED_TOOLS).toContain(`Bash(python3 ${INTAKE_SCRIPTS}/${f} *)`);
    // `folder/*` also matches `folder/../../anything` (confirmed against Claude Code 2.1)
    expect(ALLOWED_TOOLS.filter((t) => /\/\*\)$/.test(t))).toEqual([]);
  });

  it("lists the scripts in the repo it runs in", () => {
    const root = mkdtempSync(join(tmpdir(), "gtm-launch-"));
    mkdirSync(join(root, INTAKE_SCRIPTS), { recursive: true });
    // A name with a space or comma would break the rule list, so it's left out rather than quoted.
    for (const f of ["new_step.py", "next-step.py", "README.md", "two words.py", "a,b.py"]) writeFileSync(join(root, INTAKE_SCRIPTS, f), "");
    const bash = allowedTools(root).filter((t) => t.startsWith("Bash(python3"));
    rmSync(root, { recursive: true });
    expect(bash).toEqual([`Bash(python3 ${INTAKE_SCRIPTS}/new_step.py *)`, `Bash(python3 ${INTAKE_SCRIPTS}/next-step.py *)`]);
  });

  it("never copies or makes folders through the shell (a wildcard there reaches anywhere)", () => {
    expect(ALLOWED_TOOLS.some((t) => /^Bash\((cp|mv|mkdir|ln|rm)\b/.test(t))).toBe(false);
  });

  it("reads and writes only inside the project's own folders, never the whole disk", () => {
    for (const tool of ["Read", "Grep", "Glob", "Edit"]) expect(ALLOWED_TOOLS).not.toContain(tool);
    const scoped = ALLOWED_TOOLS.filter((t) => /^(Read|Grep|Glob|Edit)\(/.test(t));
    for (const t of scoped) expect(t).toMatch(/^(Read|Grep|Glob)\(\.\/(gtm-workspace|\.claude\/skills|fixtures)\/\*\*\)$|^Edit\(\.\/gtm-workspace\/\*\*\)$/);
  });

  it("denies what Claude Code would otherwise allow by default: cd, env files, git config", () => {
    expect(args[args.indexOf("--disallowedTools") + 1]).toBe(DENIED_TOOLS.join(","));
    for (const t of ["Bash(cd *)", "Bash(cd)", "Read(./**/.env)", "Read(./**/.env.*)", "Read(./.git/**)", "Bash(git *)", "Bash(git)"]) {
      expect(DENIED_TOOLS).toContain(t);
    }
  });

  it("uses Edit rules for file paths (Claude Code ignores Write(path) rules)", () => {
    expect(ALLOWED_TOOLS.some((t) => t.startsWith("Write("))).toBe(false);
  });

  it("never allows arbitrary shell commands", () => {
    expect(ALLOWED_TOOLS).not.toContain("Bash");
    expect(ALLOWED_TOOLS.some((t) => t === "Bash(*)" || t === "Bash(**)")).toBe(false);
    expect(args).not.toContain("--dangerously-skip-permissions");
  });
});
