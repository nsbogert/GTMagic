#!/usr/bin/env python3
"""Run gtm-message-test's own scoring (evaluate.py, unchanged) on the pipeline-v1 Haiku crowd's Upworthy val answers.

Question: when main's verdict logic would call a `clear-winner`, is the crowd's winner the real CTR winner more often?

Adapter choices (the crowd answered a different protocol, so they're documented here):
- One intake segment per crowd segment (icp.json); one hypothesis per headline (source "generated"); no decoy, no control.
- One ordering per customer (each agent saw its own random order; orderingIndex 0 for all).
- The crowd rated appeal 1–7 once; it is mapped to 1–5 and used for all five dimensions.
- Nobody was asked twice, so the `consistency` check never passes, and 29 agents is under the 30-answer `sample-size` bar. We report the verdict main would give
  if that check passed ("gated winner") as well as the raw verdict.

Usage: python3 scripts/upworthy_message_test_verdicts.py   (from evals/)
"""
from __future__ import annotations

import glob
import json
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(REPO, ".claude", "skills", "gtm-message-test", "scripts"))
import evaluate  # noqa: E402  (main's scorer, imported as is)

BENCH = os.path.join(HERE, "..", "benchmarks", "upworthy")
SIM = os.path.join(BENCH, "sim", "pipeline-v1", "val")
DIMS = ["relevance", "credibility", "differentiation", "clarity", "actionIntent"]


def to5(r: int) -> int:
    return max(1, min(5, round(1 + (min(7, max(1, r)) - 1) * 4 / 6)))


def main() -> None:
    truth = {t["id"]: t for t in json.load(open(os.path.join(BENCH, "val.truth.json")))}
    icp = json.load(open(os.path.join(BENCH, "sim", "pipeline-v1", "icp.json")))
    seg_of = {p["personaId"]: p["segmentId"] for p in icp["personas"]}
    intake = {"segments": [{"id": s["segmentId"]} for s in icp["segments"]], "evidence": []}

    answers: dict[str, list] = defaultdict(list)
    for agent_dir in sorted(glob.glob(os.path.join(SIM, "agent-*"))):
        aid = os.path.basename(agent_dir)
        persona = f"p{aid[-2:]}"
        m = json.load(open(os.path.join(SIM, "maps", f"{aid}.json")))
        for f in sorted(glob.glob(os.path.join(agent_dir, "out-*.json"))):
            for tid, ans in json.load(open(f)).items():
                if tid in m:
                    answers[tid].append((aid, seg_of[persona], m[tid], ans))

    rows = []
    for tid, t in truth.items():
        labels = [h["label"] for h in t["headlines"]]
        positioning = {"hypotheses": [{"id": l, "source": "generated", "headline": h["text"]} for l, h in zip(labels, t["headlines"])]}
        request = {"id": tid, "stimuli": [{"label": l, "candidateId": l, "text": h["text"]} for l, h in zip(labels, t["headlines"])],
                   "orderings": [labels], "protocol": {"version": "upworthy-adapter"}}
        responses = []
        for aid, seg, m, ans in answers[tid]:
            pick = m.get(ans["pick"], "none") if ans["pick"] != "none" else "none"
            ratings = [{"candidateId": m[h], "scores": {d: to5(v) for d in DIMS}} for h, v in ans["ratings"].items() if h in m]
            responses.append({"id": f"{tid}-{aid}", "experimentId": tid, "customerId": aid, "segmentId": seg, "status": "answered",
                              "choice": pick, "orderingIndex": 0, "isRepeat": False, "ratings": ratings, "objections": []})
        res, _ = evaluate.evaluate(intake, positioning, request, {"responses": responses}, None, seed=42)
        top = max(res["candidates"], key=lambda c: c["choiceCount"])["candidateId"]
        not_passed = {c["id"] for c in res["checks"] if c["status"] != "pass"}
        winner_check = next((c["status"] for c in res["checks"] if c["id"] == "winner"), "n/a")
        rows.append({"id": tid, "verdict": res["messageVerdict"], "gated": not (not_passed - {"consistency", "sample-size"}),
                     "winnerCheck": winner_check,
                     "crowdTop": top, "correct": top == t["winner"], "chance": 1 / len(labels)})

    def line(name: str, rs: list) -> str:
        if not rs:
            return f"| {name} | 0 | – | – |"
        acc = sum(r["correct"] for r in rs) / len(rs)
        ch = sum(r["chance"] for r in rs) / len(rs)
        return f"| {name} | {len(rs)} | {acc:.1%} | {ch:.1%} |"

    out = ["| Tests | n | Crowd winner = real winner | Chance |", "|---|---|---|---|",
           line("All val tests", rows),
           line("`winner` check passes (top beats runner-up in ≥97.5% of reshuffles)", [r for r in rows if r["winnerCheck"] == "pass"]),
           line("`winner` check warns (too close to call)", [r for r in rows if r["winnerCheck"] != "pass"]),
           line("every check except consistency and sample-size passes", [r for r in rows if r["gated"]]),
           line("any other check not passed: `no-clear-winner`", [r for r in rows if not r["gated"]])]
    verdicts = defaultdict(int)
    for r in rows:
        verdicts[r["verdict"]] += 1
    out.append(f"\nRaw verdicts (consistency always fails, no repeats): {dict(verdicts)}")
    text = "\n".join(out)
    print(text)
    with open(os.path.join(BENCH, "message-test-verdicts.md"), "w") as f:
        f.write("# gtm-message-test verdicts on the pipeline-v1 crowd (Upworthy val)\n\n"
                "Generated by `scripts/upworthy_message_test_verdicts.py` (main's `evaluate.py`, unchanged; adapter choices in the script docstring).\n\n" + text + "\n")


if __name__ == "__main__":
    main()
