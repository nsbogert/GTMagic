#!/usr/bin/env python3
"""icp-v2 for the Refactor image tests: research.json (research workflow) -> 30 sampled customers -> per-agent blind prompts,
and later: combine the 30 rankings (Borda) and compare with the baselines.

  python3 icp_v2.py sample      # after sim/icp-v2/research.json exists
  python3 icp_v2.py combine     # after sim/icp-v2/agent-KK/out.json exist

Sampling follows main's SyntheticCustomer contract (docs/CONTRACTS.md): customers are allocated to segments by
sampleShare (largest remainder), each attribute is drawn from its weighted values, and each customer "talks like"
3-5 real quotes from its segment's lexicon. Seeded; the same research.json gives the same 30 customers.
"""
from __future__ import annotations

import json
import os
import random
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import demographics  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SIM = os.path.join(HERE, "sim", "icp-v2")
N, SEED = 10, 20261025
ATTRS = ["role", "currentSolution", "priceSensitivity", "urgency", "skepticism", "buyingStage"]
LABEL = {"role": "Role", "currentSolution": "What you use today", "priceSensitivity": "Price sensitivity",
         "urgency": "Urgency", "skepticism": "Skepticism toward new apps", "buyingStage": "Buying stage"}


def allocate(segments: list[dict]) -> list[str]:
    total = sum(s["sampleShare"] for s in segments)
    raw = [(s["segmentId"], N * s["sampleShare"] / total) for s in segments]
    counts = {sid: int(x) for sid, x in raw}
    for sid, x in sorted(raw, key=lambda r: -(r[1] - int(r[1])))[: N - sum(counts.values())]:
        counts[sid] += 1
    return [sid for sid, _ in raw for _ in range(counts[sid])]


def card(seg: dict, attrs: dict, quotes: list[str], demo: dict) -> str:
    lines = ["Your profile (from research on real customers):",
             *demographics.render(demo),
             f"- Customer group: {seg['name']}: {seg['description']}",
             *[f"- {LABEL[a]}: {attrs[a]}" for a in ATTRS if a in attrs],
             f"- What you need: {'; '.join(seg.get('needs', []))}",
             f"- What holds you back: {'; '.join(seg.get('barriers', []))}",
             "- How you talk (real things people like you have said):",
             *[f'  "{q}"' for q in quotes]]
    return "\n".join(lines)


def sample() -> None:
    research = json.load(open(os.path.join(SIM, "research.json")))
    segs = {s["segmentId"]: s for s in research["segments"]}
    lex = defaultdict(list)
    for e in research["lexicon"]:
        for sid in e.get("segmentIds", []):
            lex[sid].append(e)
    tpl = open(os.path.join(HERE, "prompts", "sim-rank-v2.md")).read().split("\n", 2)[2].lstrip("\n")
    tests = json.load(open(os.path.join(HERE, "tests.json")))
    rng = random.Random(SEED)
    alloc = allocate(research["segments"])
    demo_src = json.load(open(os.path.join(SIM, "demographics.json")))
    demos = demographics.assign(alloc, {s["segmentId"]: s.get("demographics", []) for s in demo_src["segments"]}, random.Random(SEED + 7))
    customers = []
    for k, sid in enumerate(alloc, 1):
        seg = segs[sid]
        attrs = {}
        for a in seg.get("attributes", []):
            if a["name"] in ATTRS and a.get("values"):
                attrs[a["name"]] = rng.choices([v["value"] for v in a["values"]], [max(0.0, v["weight"]) for v in a["values"]])[0]
        pool = lex[sid] or research["lexicon"]
        voice = rng.sample(pool, min(len(pool), rng.randint(3, 5)))
        cid = f"cust_r1_{k}"
        customers.append({"id": cid, "segmentId": sid, "demographics": demos[k - 1], "attributes": attrs, "voiceLexiconIds": [e["id"] for e in voice]})
        a_dir = os.path.join(SIM, f"agent-{k:02d}")
        os.makedirs(a_dir, exist_ok=True)
        mapping, blocks = {}, []
        for t in tests:
            order = t["candidates"][:]
            rng.shuffle(order)
            os.makedirs(os.path.join(a_dir, t["id"]), exist_ok=True)
            mapping[t["id"]] = {}
            rows = []
            for j, c in enumerate(order, 1):
                ext = os.path.splitext(c["imagePath"])[1]
                link = os.path.join(a_dir, t["id"], f"o{j}{ext}")
                if os.path.lexists(link):
                    os.remove(link)
                os.symlink(os.path.join(HERE, c["imagePath"]), link)
                mapping[t["id"]][f"o{j}"] = c["id"]
                rows.append(f"- o{j}: {link}")
            blocks.append(f"Test {t['id']}:\n" + "\n".join(rows))
        json.dump(mapping, open(os.path.join(SIM, f"map-agent-{k:02d}.json"), "w"))
        prompt = tpl.replace("{{CARD}}", card(seg, attrs, [e["quote"] for e in voice], demos[k - 1])).replace("{{TESTS}}", "\n\n".join(blocks))
        open(os.path.join(a_dir, "prompt.md"), "w").write(prompt)
    json.dump({"schemaVersion": 1, "config": {"sampleSize": N, "seed": SEED, "strategy": "representative"},
               "samplerVersion": "icp-v2-1", "customers": customers}, open(os.path.join(SIM, "audience-sample.json"), "w"), indent=1)
    by = defaultdict(int)
    for c in customers:
        by[c["segmentId"]] += 1
    print(f"{len(customers)} customers:", {s: (segs[s]["name"], n) for s, n in by.items()})


def combine() -> None:
    tests = json.load(open(os.path.join(HERE, "tests.json")))
    research = json.load(open(os.path.join(SIM, "research.json")))
    names = {s["segmentId"]: s["name"] for s in research["segments"]}
    sample_ = {c["id"]: c["segmentId"] for c in json.load(open(os.path.join(SIM, "audience-sample.json")))["customers"]}
    points = {t["id"]: defaultdict(float) for t in tests}
    by_seg = {t["id"]: defaultdict(lambda: defaultdict(float)) for t in tests}
    firsts = {t["id"]: defaultdict(int) for t in tests}
    taps, issues, used = defaultdict(int), [], 0
    for k in range(1, N + 1):
        path = os.path.join(SIM, f"agent-{k:02d}", "out.json")
        if not os.path.exists(path):
            issues.append(f"agent-{k:02d}: missing")
            continue
        out, m = json.load(open(path)), json.load(open(os.path.join(SIM, f"map-agent-{k:02d}.json")))
        sid = sample_[f"cust_r1_{k}"]
        for t in tests:
            ans = out.get(t["id"], {})
            rank = ans.get("ranking", [])
            if sorted(rank) != sorted(m[t["id"]]):
                issues.append(f"agent-{k:02d}/{t['id']}: invalid ranking {rank}")
                continue
            n = len(rank)
            for pos, o in enumerate(rank):  # Borda: n-1 points for first place ... 0 for last
                points[t["id"]][m[t["id"]][o]] += n - 1 - pos
                by_seg[t["id"]][sid][m[t["id"]][o]] += n - 1 - pos
            firsts[t["id"]][m[t["id"]][rank[0]]] += 1
            taps[t["id"]] += bool(ans.get("wouldTapTop"))
        used += 1
    result = {}
    for t in tests:
        p = points[t["id"]]
        ranking = sorted(p, key=lambda i: (-p[i], -firsts[t["id"]][i]))
        result[t["id"]] = {"ranking": ranking, "bordaPoints": dict(p), "firstPlaceVotes": dict(firsts[t["id"]]),
                           "wouldTapTopShare": round(taps[t["id"]] / max(1, used), 3),
                           "bySegment": {names[s]: sorted(v, key=lambda i: -v[i]) for s, v in by_seg[t["id"]].items()}}
    os.makedirs(os.path.join(HERE, "predictions", "icp-v2-crowd"), exist_ok=True)
    json.dump(result, open(os.path.join(HERE, "predictions", "icp-v2-crowd", "predictions.json"), "w"), indent=1)

    def rank_of(arm: str, tid: str) -> list[str]:
        f = os.path.join(HERE, "predictions", arm, f"{tid}.json")
        return json.load(open(f))["ranking"] if os.path.exists(f) else []

    truth_path = os.path.join(HERE, "truth.json")
    truth = json.load(open(truth_path)) if os.path.exists(truth_path) else None
    print("| Test | Arm | Ranking (best first) | Real winner = #1? |\n|---|---|---|---|")
    for t in tests:
        best = max(truth[t["id"]], key=lambda i: truth[t["id"]][i]["ctr"]) if truth else None
        for arm, rank in (("vanilla-opus (no ICP)", rank_of("vanilla-opus", t["id"])),
                          ("vanilla-opus + ICP line", rank_of("vanilla-opus-icp", t["id"])),
                          ("icp-v2 crowd (10 Sonnet, Borda)", result[t["id"]]["ranking"])):
            hit = ("✅" if rank and rank[0] == best else "❌") if truth else "?"
            print(f"| {t['id']} | {arm} | {' > '.join(rank) or '(missing)'} | {hit} |")
    for t in tests:
        r = result[t["id"]]
        print(f"\n{t['id']}: first-place votes {r['firstPlaceVotes']}, would tap their top ad {r['wouldTapTopShare']:.0%}; by segment {r['bySegment']}")
    if issues:
        print("\nIssues:", *issues, sep="\n- ")
    print(f"\n{used}/{N} agents used.")


if __name__ == "__main__":
    {"sample": sample, "combine": combine}[sys.argv[1]]()
