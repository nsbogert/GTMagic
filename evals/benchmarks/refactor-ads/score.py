#!/usr/bin/env python3
"""Score the Refactor Fitness image ad tests against real CTR.

Reads predictions/{vanilla-opus,web-opus}/refactor-*.json ({"ranking": [...]}) and tallies the crowd
(sim/crowd-v1/agent-*/out.json, mapped back through map-agent-*.json) into the same ranking format.
Truth: truth.json = {"refactor-1": {"image-1": {"ctr": 0.012, ...}, ...}, ...} (keys are the neutral image ids;
image-map.json maps them to the original file names). Without truth.json it prints the predictions only.

Usage (from evals/benchmarks/refactor-ads): python3 score.py
"""
from __future__ import annotations

import glob
import json
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def crowd() -> tuple[dict, list[str]]:
    tally: dict = defaultdict(lambda: defaultdict(lambda: {"pick": 0, "click": 0, "rating": 0, "n": 0}))
    issues = []
    for out in sorted(glob.glob(os.path.join(HERE, "sim", "crowd-v1", "agent-*", "out.json"))):
        k = os.path.basename(os.path.dirname(out))[-2:]
        m = json.load(open(os.path.join(HERE, "sim", "crowd-v1", f"map-agent-{k}.json")))
        try:
            ans = json.load(open(out))
        except json.JSONDecodeError as e:
            issues.append(f"agent-{k}: bad JSON ({e})")
            continue
        for tid, mp in m.items():
            a = ans.get(tid)
            if not a or not all(o in a.get("ratings", {}) and o in a.get("click", {}) for o in mp):
                issues.append(f"agent-{k}/{tid}: incomplete")
                continue
            for o, img in mp.items():
                t = tally[tid][img]
                t["pick"] += a.get("pick") == o
                t["click"] += bool(a["click"][o])
                t["rating"] += min(7, max(1, a["ratings"][o]))
                t["n"] += 1
    preds = {}
    for tid, imgs in tally.items():
        rank = sorted(imgs, key=lambda i: (-imgs[i]["pick"], -imgs[i]["click"], -imgs[i]["rating"]))
        preds[tid] = {"ranking": rank, "detail": {i: {"pickShare": round(v["pick"] / v["n"], 3), "clickRate": round(v["click"] / v["n"], 3),
                                                       "meanRating": round(v["rating"] / v["n"], 2), "n": v["n"]} for i, v in imgs.items()}}
    return preds, issues


def main() -> None:
    arms = {}
    for arm in ("vanilla-opus", "web-opus"):
        arms[arm] = {os.path.basename(f)[:-5]: json.load(open(f)) for f in glob.glob(os.path.join(HERE, "predictions", arm, "refactor-*.json"))}
    arms["crowd-v1"], issues = crowd()
    json.dump(arms["crowd-v1"], open(os.path.join(HERE, "predictions", "crowd-v1", "predictions.json"), "w"), indent=1)

    truth_path = os.path.join(HERE, "truth.json")
    truth = json.load(open(truth_path)) if os.path.exists(truth_path) else None
    names = json.load(open(os.path.join(HERE, "image-map.json")))
    lines = ["| Test | Arm | Ranking (best first) | Real winner = #1? | Real CTR of #1 vs best |", "|---|---|---|---|---|"]
    for tid in sorted(names):
        best = max(truth[tid], key=lambda i: truth[tid][i]["ctr"]) if truth else None
        for arm, p in arms.items():
            rank = p.get(tid, {}).get("ranking", [])
            if not rank:
                lines.append(f"| {tid} | {arm} | (missing) | | |")
                continue
            hit = ("✅" if rank[0] == best else "❌") if truth else "?"
            ctrs = f"{truth[tid][rank[0]]['ctr']:.2%} vs {truth[tid][best]['ctr']:.2%}" if truth else ""
            lines.append(f"| {tid} | {arm} | {' > '.join(rank)} | {hit} | {ctrs} |")
    print("\n".join(lines))
    if issues:
        print("\nCrowd issues:", *issues, sep="\n- ")
    print("\nImage ids → files:", json.dumps(names, indent=1))


if __name__ == "__main__":
    main()
