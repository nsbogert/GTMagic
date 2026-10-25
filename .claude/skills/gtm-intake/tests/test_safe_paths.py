"""The intake scripts refuse paths outside the workspace: the web page's launched agent may run them with any arguments.
Run from the repo root:  python3 -m unittest discover -s .claude/skills/gtm-intake/tests"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
BRIEF = {"business": {"name": "KeepStrong"}}


class SafePaths(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.root = Path(self.dir.name)
        self.ws = self.root / "gtm-workspace" / "keepstrong"
        self.ws.mkdir(parents=True)
        (self.ws / "intake.json").write_text(json.dumps(BRIEF))
        (self.root / "fixtures").mkdir()
        (self.root / "fixtures" / "intake.json").write_text(json.dumps(BRIEF))
        self.outside = self.root / "outside"  # stands in for ~/.zshrc or another script
        self.outside.mkdir()

    def tearDown(self):
        self.dir.cleanup()

    def run_script(self, script: str, *args: str) -> subprocess.CompletedProcess:
        env = {**os.environ, "GTM_ROOT": self.dir.name, "TAVILY_NO_KEYCHAIN": "1", "TAVILY_LOG_REPLAY": "1"}
        env.pop("TAVILY_API_KEY", None)
        return subprocess.run([sys.executable, "-I", str(SCRIPTS / script), *args], capture_output=True, text=True, env=env)

    def assertRefused(self, out: subprocess.CompletedProcess) -> None:
        self.assertEqual(out.returncode, 1, out.stdout + out.stderr)
        self.assertRegex(out.stderr, r"ERROR won't (write|read)")
        self.assertEqual(list(self.outside.iterdir()), [], "nothing may land outside the workspace")

    def test_render_brief_writes_only_into_the_workspace(self):
        ok = self.run_script("render_brief.py", str(self.ws / "intake.json"), "-o", str(self.ws / "brief.md"))
        self.assertEqual(ok.returncode, 0, ok.stderr)
        self.assertRefused(self.run_script("render_brief.py", str(self.ws / "intake.json"), "-o", str(self.outside / "x.py")))
        self.assertRefused(self.run_script("render_brief.py", str(self.ws / "intake.json"), "-o",
                                           str(self.ws / ".." / ".." / "outside" / "x.py")))

    def test_render_brief_reads_only_workspace_or_fixtures(self):
        self.assertEqual(self.run_script("render_brief.py", str(self.root / "fixtures" / "intake.json")).returncode, 0)
        (self.outside / "secret.json").write_text(json.dumps(BRIEF))
        out = self.run_script("render_brief.py", str(self.outside / "secret.json"))
        self.assertEqual(out.returncode, 1)
        self.assertIn("ERROR won't read", out.stderr)
        self.assertEqual(out.stdout, "")

    def test_a_symlinked_folder_doesnt_lead_out(self):
        (self.ws / "sneaky").symlink_to(self.outside, target_is_directory=True)
        self.assertRefused(self.run_script("render_brief.py", str(self.ws / "intake.json"), "-o", str(self.ws / "sneaky" / "x.py")))

    def test_validate_writes_back_only_inside_the_workspace(self):
        copy = self.root / "fixtures" / "intake.json"
        out = self.run_script("validate_intake.py", str(copy), "--write")
        self.assertEqual(out.returncode, 1)
        self.assertIn("ERROR won't write", out.stderr)
        self.assertEqual(json.loads(copy.read_text()), BRIEF, "the fixture must not be rewritten")
        self.assertRefused(self.run_script("validate_intake.py", str(self.ws / "intake.json"), "--log", str(self.outside / "log.jsonl")))

    def test_demo_seed_writes_only_into_the_workspace(self):
        ok = self.run_script("demo_seed.py", str(self.root / "fixtures" / "intake.json"), str(self.ws))
        self.assertEqual(ok.returncode, 0, ok.stderr)
        self.assertRefused(self.run_script("demo_seed.py", str(self.root / "fixtures" / "intake.json"), str(self.outside)))

    def test_tavily_log_appends_only_inside_the_workspace(self):
        self.assertRefused(self.run_script("tavily_log.py", "budget", "--log", str(self.outside / "research-log.jsonl")))
        ok = self.run_script("tavily_log.py", "budget", "--log", str(self.ws / "research-log.jsonl"))
        self.assertEqual(ok.returncode, 0, ok.stderr)


if __name__ == "__main__":
    unittest.main()
