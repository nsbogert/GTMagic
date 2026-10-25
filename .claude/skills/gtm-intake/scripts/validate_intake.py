#!/usr/bin/env python3
"""Validate an Intake Brief and fill in every number the model must not type.

Usage: python3 validate_intake.py <intake.json> [--log research-log.jsonl] [--write]

Computes: concern bundles, size math, ad verdicts, normalized weights and sample
shares, and the script-owned readiness checks. Checks every ID reference, the
verbatim lexicon rule, excerpt length, and the messaging/proxy guardrails.
Exits 1 when an integrity error is found, so a broken brief is never handed off.
Standard library only, so it runs in Claude chat's sandbox and locally.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter

CORE_ATTRIBUTES = ["role", "currentSolution", "priceSensitivity", "urgency", "skepticism", "buyingStage"]
LEXICON_SOURCE_TYPES = {"review", "forum-post"}
MAX_EXCERPT_WORDS = 25
MIN_CLICKS, MIN_CONVERSIONS = 100, 10
DEFAULT_ADOPTION = 0.01
DRUG_TERMS = r"ozempic|wegovy|mounjaro|zepbound|semaglutide|tirzepatide|saxenda|liraglutide|glp-?1"
CONDITION_TERMS = DRUG_TERMS + r"|diabet|obes"
MESSAGING_BANNED = {
    "names a medication or drug class": DRUG_TERMS,
    "assumes the reader's condition": r"\bare you on\b|\byour (meds|medication|shots?|injections?)\b",
    "superlative or guarantee": r"\bbest\b|#1|\bnumber one\b|\bguarantee",
    "medical claim": r"\bcures?\b|\btreats?\b|\btreatment\b|\bprevents?\b|\bdiagnos",
}
SCRIPT_PREFIX = "[script] "


def norm(text: str) -> str:
    """Lowercase, straighten quotes, collapse whitespace: so real quotes aren't rejected on typography."""
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", text).strip().lower()


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.notes: list[str] = []

    def ref(self, ok: bool, where: str, ref_id: object, kind: str) -> None:
        if not ok:
            self.errors.append(f"{where}: unknown {kind} '{ref_id}'")


def ids_of(items: list[dict], label: str, report: Report) -> set[str]:
    seen = [i.get("id") for i in items]
    for dup, n in Counter(seen).items():
        if n > 1:
            report.errors.append(f"duplicate {label} id '{dup}'")
    return set(seen)


def load_log(path: str | None) -> dict[str, str]:
    """Map each logged source URL to the text actually read there."""
    sources: dict[str, str] = {}
    if not path:
        return sources
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                entry = json.loads(line)
                if entry.get("kind") == "source" and entry.get("url"):
                    sources[entry["url"]] = sources.get(entry["url"], "") + " " + entry.get("excerpt", "")
    return sources


def check_evidence(brief: dict, seg_ids: set, con_ids: set, log: dict[str, str], has_log: bool, r: Report) -> dict:
    by_id = {}
    for ev in brief.get("evidence", []):
        where = f"evidence {ev.get('id')}"
        by_id[ev.get("id")] = ev
        if len(ev.get("excerpt", "").split()) > MAX_EXCERPT_WORDS:
            r.errors.append(f"{where}: excerpt over {MAX_EXCERPT_WORDS} words")
        if ev.get("origin") == "web":
            url = ev.get("url")
            if not url:
                r.errors.append(f"{where}: web evidence needs a url")
            elif has_log and url not in log:
                r.errors.append(f"{where}: url not in research log (evidence must come from a tool result)")
            elif has_log and norm(ev.get("excerpt", "")) not in norm(log[url]):
                r.warnings.append(f"{where}: excerpt not found verbatim in the logged text for its url")
        for s in ev.get("segmentIds", []):
            r.ref(s in seg_ids, where, s, "segment")
        for c in ev.get("concernIds", []):
            r.ref(c in con_ids, where, c, "concern")
    return by_id


def check_lexicon(brief: dict, evidence: dict, seg_ids: set, r: Report) -> set[str]:
    for lex in brief.get("lexicon", []):
        where, ev = f"lexicon {lex.get('id')}", evidence.get(lex.get("evidenceId"))
        r.ref(ev is not None, where, lex.get("evidenceId"), "evidence")
        for s in lex.get("segmentIds", []):
            r.ref(s in seg_ids, where, s, "segment")
        if len(lex.get("phrase", "").split()) < 3:
            r.errors.append(f"{where}: phrase must be at least 3 words")
        if ev and norm(lex.get("phrase", "")) not in norm(ev.get("excerpt", "")):
            r.errors.append(f"{where}: phrase is not verbatim in {ev.get('id')}'s excerpt")
        if ev and ev.get("sourceType") not in LEXICON_SOURCE_TYPES and ev.get("origin") != "owner-text":
            r.errors.append(f"{where}: lexicon must come from a review, forum post, or the owner's own words")
    return {lex.get("id") for lex in brief.get("lexicon", [])}


def compute_segments(brief: dict, ev_ids: set, con_ids: set, r: Report) -> None:
    segments = brief.get("segments", [])
    pricing, goal = brief.get("business", {}).get("pricing"), brief.get("business", {}).get("revenueGoal12mo")
    if any(s.get("sampleShare") is None for s in segments):
        r.notes.append("sampleShare missing on some groups: using equal shares")
        for s in segments:
            s["sampleShare"] = 1.0
    total_share = sum(s["sampleShare"] for s in segments) or 1.0
    for s in segments:
        s["sampleShare"] = round(s["sampleShare"] / total_share, 4)
        where = f"segment {s.get('id')}"
        names = {a.get("name") for a in s.get("attributes", [])}
        for missing in [a for a in CORE_ATTRIBUTES if a not in names]:
            r.errors.append(f"{where}: missing core attribute '{missing}'")
        for attr in s.get("attributes", []):
            weights = [v.get("weight", 0) for v in attr.get("values", [])]
            if not weights or sum(weights) <= 0:
                r.errors.append(f"{where}: attribute '{attr.get('name')}' has no positive weights")
                continue
            if abs(sum(weights) - 1) > 0.05:
                r.warnings.append(f"{where}: '{attr.get('name')}' weights summed to {sum(weights):.2f}; normalized")
            for v in attr["values"]:
                v["weight"] = round(v.get("weight", 0) / sum(weights), 4)
        # Concern bundles: count each excerpt's exact set of concerns for this group.
        tagged = [tuple(sorted(e["concernIds"])) for e in brief.get("evidence", [])
                  if s.get("id") in e.get("segmentIds", []) and e.get("concernIds")]
        n = len(tagged)
        confidence = "low" if n < 10 else "medium" if n < 30 else "high"
        s["concernBundles"] = [{"concernIds": list(k), "observedCount": c, "weight": round(c / n, 4), "confidence": confidence}
                               for k, c in Counter(tagged).most_common()]
        per_concern = Counter(c for k in tagged for c in k)
        r.notes.append(f"{where}: {n} tagged excerpts ({confidence}); top concerns "
                       + ", ".join(f"{c}={k}" for c, k in per_concern.most_common(4)))
        sv = s.get("serviceability", {})
        for key in ("switchingEvidenceIds",):
            for e in sv.get(key, []):
                r.ref(e in ev_ids, where, e, "evidence")
        for e in sv.get("size", {}).get("evidenceIds", []):
            r.ref(e in ev_ids, where, e, "evidence")
        for inc in sv.get("incumbents", []):
            for e in inc.get("evidenceIds", []):
                r.ref(e in ev_ids, where, e, "evidence")
        for c in sv.get("unresolvedConcernIds", []):
            r.ref(c in con_ids, where, c, "concern")
        math_ = sv.setdefault("sizeMath", {})
        if pricing and goal and pricing.get("amount") and pricing.get("purchasesPerYear"):
            rate = math_.get("adoptionRate") or DEFAULT_ADOPTION
            needed = math.ceil(goal / (pricing["amount"] * pricing["purchasesPerYear"]))
            math_.update(customersNeeded=needed, adoptionRate=rate, minPopulation=math.ceil(needed / rate))
            pop = sv.get("size", {}).get("population")
            if pop is not None and pop < math_["minPopulation"] and sv.get("verdict") == "serviceable":
                r.warnings.append(f"{where}: verdict is serviceable but population {pop:,} < minimum {math_['minPopulation']:,}")
        else:
            r.warnings.append(f"{where}: no price or revenue goal, so size math was skipped")


def compute_ads(brief: dict, r: Report) -> None:
    target = brief.get("business", {}).get("targetCpa")
    for px in brief.get("priorExperiments", []):
        m, spend = px.get("metrics", {}), px.get("spend")
        clicks, conv = m.get("clicks") or 0, m.get("conversions") or 0
        if not target or spend is None or clicks < MIN_CLICKS or conv < MIN_CONVERSIONS:
            px["verdict"] = "inconclusive"
        else:
            px["verdict"] = "worked" if spend / conv <= target else "didnt-work"
        cpa = f"{spend / conv:.2f}" if spend is not None and conv else "n/a"
        r.notes.append(f"ad {px.get('id')}: {clicks} clicks, {conv} conversions, CPA {cpa} vs target {target} -> {px['verdict']}")


def check_messaging(brief: dict, seg_ids: set, lex_ids: set, r: Report) -> bool:
    ok = True
    for i, msg in enumerate(brief.get("roughMessaging", [])):
        where = f"roughMessaging[{i}]"
        r.ref(msg.get("segmentId") in seg_ids, where, msg.get("segmentId"), "segment")
        for lid in msg.get("lexiconIds", []):
            r.ref(lid in lex_ids, where, lid, "lexicon")
        text = f"{msg.get('headline', '')} {msg.get('subheadline', '')}"
        for why, pattern in MESSAGING_BANNED.items():
            if re.search(pattern, text, re.IGNORECASE):
                r.errors.append(f"{where}: {why}: \"{text.strip()}\"")
                ok = False
    for g in brief.get("interests", []):
        for proxy in g.get("targetableProxies", []):
            if re.search(CONDITION_TERMS, proxy, re.IGNORECASE):
                r.errors.append(f"interest {g.get('id')}: targetable proxy names a health condition: \"{proxy}\"")
    return ok


def check_refs(brief: dict, ev_ids: set, seg_ids: set, r: Report) -> None:
    def evs(where: str, ids: list) -> None:
        for e in ids or []:
            r.ref(e in ev_ids, where, e, "evidence")
    for h in brief.get("hypotheses", []):
        evs(f"hypothesis {h.get('id')}", h.get("evidenceIds"))
    for f in brief.get("findings", []):
        evs(f"finding {f.get('id')}", f.get("evidenceIds"))
        if f.get("segmentId"):
            r.ref(f["segmentId"] in seg_ids, f"finding {f.get('id')}", f["segmentId"], "segment")
    for c in brief.get("constraints", []):
        evs(f"constraint {c.get('dimension')}", (c.get("pushback") or {}).get("evidenceIds"))
    interest_ids = {g.get("id") for g in brief.get("interests", [])}
    for g in brief.get("interests", []):
        for d in g.get("demographics", []):
            evs(f"interest {g.get('id')}", d.get("evidenceIds"))
    for o in brief.get("overlaps", []):
        evs("overlap", o.get("evidenceIds"))
        for gid in o.get("groupIds", []):
            r.ref(gid in interest_ids, "overlap", gid, "interest group")
    for i, s in enumerate(brief.get("skeptic", [])):
        evs(f"skeptic[{i}]", s.get("evidenceIds"))
    icp = brief.get("icp")
    if icp:
        r.ref(icp.get("segmentId") in seg_ids, "icp", icp.get("segmentId"), "segment")


def readiness(brief: dict, messaging_ok: bool, r: Report) -> None:
    icp, hyps, segs = brief.get("icp"), brief.get("hypotheses", []), brief.get("segments", [])
    bucket = {c.get("dimension"): c.get("bucket") for c in brief.get("constraints", [])}
    primaries = [h for h in hyps if h.get("kind") == "primary"]
    if len(primaries) != 1 or len(hyps) - len(primaries) > 2:
        r.errors.append("hypotheses: need exactly 1 primary and at most 2 alternates")
    checks = {
        "ICP has a statement, 3+ must-haves and 1+ disqualifier":
            icp is None or (bool(icp.get("statement")) and len(icp.get("mustHaves", [])) >= 3 and len(icp.get("disqualifiers", [])) >= 1),
        "Geography and price are set (not unknown)":
            all(bucket.get(d) not in (None, "unknown") for d in ("geography", "price")),
        "One primary hypothesis with 'wrong if'": len(primaries) == 1 and bool(primaries[0].get("wrongIf")),
        "At least 2 customer groups, each with a verdict":
            len(segs) >= 2 and all(s.get("serviceability", {}).get("verdict") for s in segs),
        "Concern counts computed for every customer group": all(s.get("concernBundles") for s in segs),
        "3-5 messaging lines that pass the messaging check":
            3 <= len(brief.get("roughMessaging", [])) <= 5 and messaging_ok,
        "Every finding is typed and cites evidence":
            bool(brief.get("findings")) and all(f.get("kind") and f.get("evidenceIds") for f in brief["findings"]),
        "Skeptic pass logged with queries": bool(brief.get("skeptic")) and all(s.get("queries") for s in brief["skeptic"]),
        "No integrity errors": not r.errors,
    }
    block = brief.setdefault("readiness", {"status": "needs-more", "checks": []})
    checks["Owner confirmation recorded"] = any(
        c.get("check", "").startswith("Owner confirmed") and c.get("pass") for c in block.get("checks", []))
    kept = [c for c in block.get("checks", []) if not c.get("check", "").startswith(SCRIPT_PREFIX)]
    block["checks"] = kept + [{"check": SCRIPT_PREFIX + k, "pass": v} for k, v in checks.items()]
    if r.errors or not all(c.get("pass") for c in block["checks"]):
        block["status"] = "needs-more"
    elif icp is None:
        block["status"] = "no-supported-segment"
    else:
        block["status"] = "ready"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("intake")
    ap.add_argument("--log", help="research-log.jsonl; when given, web evidence must appear in it")
    ap.add_argument("--write", action="store_true", help="write computed fields back to the file")
    args = ap.parse_args()
    with open(args.intake, encoding="utf-8") as f:
        brief = json.load(f)

    r = Report()
    seg_ids = ids_of(brief.get("segments", []), "segment", r)
    con_ids = ids_of(brief.get("concerns", []), "concern", r)
    ids_of(brief.get("findings", []), "finding", r)
    ids_of(brief.get("hypotheses", []), "hypothesis", r)
    ids_of(brief.get("priorExperiments", []), "prior experiment", r)
    evidence = check_evidence(brief, seg_ids, con_ids, load_log(args.log), bool(args.log), r)
    ids_of(brief.get("evidence", []), "evidence", r)
    lex_ids = check_lexicon(brief, evidence, seg_ids, r)
    compute_segments(brief, set(evidence), con_ids, r)
    compute_ads(brief, r)
    messaging_ok = check_messaging(brief, seg_ids, lex_ids, r)
    check_refs(brief, set(evidence), seg_ids, r)
    readiness(brief, messaging_ok, r)

    for label, items in (("ERROR", r.errors), ("WARN", r.warnings), ("note", r.notes)):
        for item in items:
            print(f"{label:5} {item}")
    print(f"readiness: {brief['readiness']['status']}")
    if args.write:
        with open(args.intake, "w", encoding="utf-8") as f:
            json.dump(brief, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print(f"wrote {args.intake}")
    return 1 if r.errors else 0


if __name__ == "__main__":
    sys.exit(main())
