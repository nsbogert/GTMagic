#!/usr/bin/env python3
"""Render the owner-facing brief.md from intake.json: render_brief.py <intake.json> [-o brief.md] [--no-links]

Plain language only ("customer group", not "segment"; no "ICP"). Numbers come from the JSON, computed by
validate_intake.py; the only math here is cost per sign-up, for display. Estimates are always labeled.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any

Json = dict[str, Any]

# Plain-words versions of the schema's enum values.
SEGMENT_VERDICTS = {"serviceable": "Worth going after", "marginal": "Possible, but a weaker bet",
                    "not-serviceable": "Not worth going after right now",
                    "insufficient-evidence": "Not enough evidence to judge yet"}
READINESS = {
    "ready": "Ready. The brief is complete and you confirmed it.",
    "no-supported-segment": "No customer group we can stand behind yet. That is a useful answer, not a failure.",
    "needs-more": "Not finished. A few questions still need answers before the next step.",
}
EXPERIMENT_VERDICTS = {"worked": "Worked: it beat your target cost per sign-up.",
                       "didnt-work": "Didn't work: it cost more per sign-up than your target.",
                       "inconclusive": "Too early to tell: not enough clicks or sign-ups to judge."}
FINDING_KINDS = [("observed", "What we saw directly"),
                 ("estimated", "What we estimated (calculated from other numbers, so treat as rough)"),
                 ("inferred", "What we concluded (our reading of the evidence)")]
SKEPTIC_RESULTS = {"nothing-found": "found nothing against it", "resolved": "the evidence backed it up",
                   "unresolved": "an open doubt we could not settle, so treat this with care"}
SOURCE_TYPES = {"forum-post": "forum post", "review": "app review", "review-aggregate": "app store rating",
                "survey": "survey", "official-stats": "official statistics", "news-report": "news report",
                "competitor-site": "competitor's website", "first-party": "your own data"}
CHANNELS = {"meta": "Meta (Facebook/Instagram)", "google": "Google", "reddit": "Reddit",
            "tiktok": "TikTok", "email": "Email", "other": "Other"}
QUOTE_SOURCES = {"forum-post", "review"}  # first-hand customer words, not stats
NO_GROUP = "We didn't find a group we can stand behind yet."
MAX_WORRIES = 5  # keep the list scannable; the full counts stay in intake.json


def plain(text: str) -> str:
    """Strip internal IDs like '(ev_15)' or '(see concernBundles)', and speak to the owner directly."""
    text = re.sub(r"\s*\((?:see [A-Za-z]+|(?:ev|seg|con|px|fnd|lex|int)_\w+(?:,\s*\w+)*)\)", "", text)
    text = re.sub(r"\bthe owner's\b", "your", text)
    return re.sub(r"\bThe owner's\b", "Your", text).strip()


def cell(items: list[str], empty: str) -> str:
    """Join items into one Markdown table cell."""
    return "<br>".join(s.replace("|", "\\|").replace("\n", " ") for s in items) or empty


def money(amount: float | None, currency: str, decimals: int = 0) -> str:
    if amount is None:
        return "not recorded"
    value = f"{amount:,.{decimals}f}"
    return f"${value}" if currency == "USD" else f"{value} {currency}"


def count(value: int | None) -> str:
    return "not recorded" if value is None else f"{value:,}"


def people(n: float) -> str:
    return f"{n / 1_000_000:.1f} million" if n >= 1_000_000 else f"{n:,.0f}"


def ranked_segments(brief: Json) -> list[Json]:
    return sorted(brief.get("segments") or [], key=lambda s: s.get("ownerRank") or 99)


def target_message(brief: Json) -> Json | None:
    """First message line for the chosen group, else the first line overall."""
    lines: list[Json] = brief.get("roughMessaging") or []
    seg_id = (brief.get("icp") or {}).get("segmentId")
    return next((m for m in lines if m.get("segmentId") == seg_id), lines[0] if lines else None)


def short_version(brief: Json) -> list[str]:
    icp: Json | None = brief.get("icp")
    readiness: Json = brief.get("readiness") or {}
    status = readiness.get("status", "needs-more")
    out = ["## The short version", ""]
    if icp and status != "no-supported-segment":
        out.append(f"**Who to target:** {icp.get('statement', '')}")
        if icp.get("mustHaves"):
            out.append(f"- Good fit if they are: {'; '.join(icp['mustHaves']).lower()}.")
        if icp.get("disqualifiers"):
            out.append(f"- Not a fit: {'; '.join(icp['disqualifiers']).lower()}.")
    else:
        out.append(f"**Who to target:** {NO_GROUP}")
    msg = target_message(brief)
    what = f"\"{msg.get('headline', '')}\" — {msg.get('subheadline', '')}" if msg else "No message lines yet."
    out += ["", f"**What to say:** {what}", "", f"**Where things stand:** {READINESS.get(status, status)}"]
    out += [f"- Not done yet: {c.get('check', '')}" for c in readiness.get("checks", []) if not c.get("pass")]
    return out + [""]


def before_after(brief: Json) -> list[str]:
    base: Json = brief.get("baseline") or {}
    icp: Json | None = brief.get("icp")
    out = ["## Before and after", ""]
    if base.get("ownerFirstDescription"):
        out += [f"You started with: \"{base['ownerFirstDescription']}\"", ""]
    after_who = [icp.get("statement", "")] if icp else [NO_GROUP]
    after_say = [m.get("headline", "") for m in brief.get("roughMessaging") or []]
    return out + [
        "| | Before research (plain AI, no evidence) | After research |",
        "|---|---|---|",
        f"| **Who** | {cell(base.get('icps', []), '(none)')} | {cell(after_who, '(none)')} |",
        f"| **What to say** | {cell(base.get('taglines', []), '(none)')} | {cell(after_say, '(none yet)')} |",
        "",
    ]


def customer_groups(brief: Json) -> list[str]:
    out = ["## Customer groups we looked at", ""]
    segs = ranked_segments(brief)
    if not segs:
        return out + ["No customer groups yet.", ""]
    for seg in segs:
        svc: Json = seg.get("serviceability") or {}
        rank = f" (your #{seg['ownerRank']} pick)" if seg.get("ownerRank") else ""
        origin = "This was your original guess." if seg.get("isOwnerGuess") else "Research found this group."
        out += [f"### {seg.get('name', 'Unnamed group')}{rank}", ""]
        out += [seg["description"], ""] if seg.get("description") else []
        out.append(f"- **Where it came from:** {origin}")
        if svc.get("verdict"):
            out.append(f"- **Our verdict:** {SEGMENT_VERDICTS.get(svc['verdict'], svc['verdict'])} "
                       f"({svc.get('confidence', 'low')} confidence)")
        if svc.get("reasoning"):
            out.append(f"- **Why:** {plain(svc['reasoning'])}")
        size: Json = svc.get("size") or {}
        pop = size.get("population")
        if pop:
            label = " (estimate)" if size.get("isEstimate") else ""
            how = f" How we got there: {plain(size['logic'])}" if size.get("logic") else ""
            out.append(f"- **How many people:** about {people(pop)}{label}.{how}")
        else:
            out.append("- **How many people:** we couldn't estimate this yet.")
        # sizeMath is zero until the validator fills it in; only show it once computed.
        math: Json = svc.get("sizeMath") or {}
        need, minimum = math.get("customersNeeded") or 0, math.get("minPopulation") or 0
        if need and minimum:
            clears = "" if not pop else (" This group clears that bar." if pop >= minimum
                                         else " This group may be too small.")
            out.append(f"- **Is it big enough?** To hit your revenue goal you need about {need:,.0f} customers, "
                       f"so the group must have at least {minimum:,.0f} people (assuming about "
                       f"{math.get('adoptionRate') or 0:.0%} of them would buy).{clears}")
        out.append("")
    return out


def segment_quotes(brief: Json, seg_id: str, limit: int = 3) -> list[Json]:
    """Customer quotes for this group, preferring ones tagged to this group alone."""
    mine = [e for e in brief.get("evidence") or [] if seg_id in e.get("segmentIds", [])
            and e.get("sourceType") in QUOTE_SOURCES and e.get("origin") != "owner-file"]
    return sorted(mine, key=lambda e: len(e.get("segmentIds", [])) > 1)[:limit]


def worries(brief: Json, links: bool) -> list[str]:
    out = ["## What they worry about", ""]
    labels = {c["id"]: c.get("label", c["id"]) for c in brief.get("concerns") or [] if "id" in c}
    quote_heading = "**Real quotes**" + (" (fictional examples in this demo)" if brief.get("mode") == "demo" else "")
    for seg in ranked_segments(brief):
        seg_id = seg.get("id", "")
        out += [f"### {seg.get('name', 'Unnamed group')}", ""]
        bundles: list[Json] = sorted(seg.get("concernBundles") or [], key=lambda b: -b.get("observedCount", 0))
        # Bundles count exact combinations; owners need each worry's total across all posts.
        posts = sum(b.get("observedCount", 0) for b in bundles)
        totals: dict[str, int] = {}
        for b in bundles:
            for cid in b.get("concernIds", []):
                totals[cid] = totals.get(cid, 0) + b.get("observedCount", 0)
        for cid, n in sorted(totals.items(), key=lambda kv: -kv[1])[:MAX_WORRIES]:
            out.append(f"- {labels.get(cid, cid)}: in {n} of {posts} posts")
        combos = [b for b in bundles if len(b.get("concernIds", [])) > 1][:3]
        if combos:
            out.append("- Often raised together: " + "; ".join(
                " + ".join(labels.get(c, c) for c in b["concernIds"]) + f" ({b.get('observedCount', 0)})" for b in combos))
        if not bundles:  # not counted yet: list the worries tagged in this group's evidence, no numbers
            tagged = {cid for e in brief.get("evidence") or [] if seg_id in e.get("segmentIds", [])
                      for cid in e.get("concernIds", [])}
            out += [f"- {label}" for cid, label in labels.items() if cid in tagged] or ["- None recorded yet."]
        quotes = segment_quotes(brief, seg_id)
        out += ["", quote_heading, ""] if quotes else [""]
        for q in quotes:
            source = SOURCE_TYPES.get(q.get("sourceType", ""), "source")
            cite = f"[{source}]({q['url']})" if links and q.get("url") else source
            out += [f"> \"{q.get('excerpt', '')}\"", f"> — {cite}", ""]
    return out


def tried(brief: Json) -> list[str]:
    out = ["## What you've already tried", ""]
    business: Json = brief.get("business") or {}
    currency = (business.get("pricing") or {}).get("currency", "USD")
    target = business.get("targetCpa")
    goal = f" (your target: {money(target, currency)})" if target else ""
    experiments: list[Json] = brief.get("priorExperiments") or []
    if not experiments:
        return out + ["You didn't share any past ad results.", ""]
    for px in experiments:
        headline = (px.get("message") or {}).get("headline") or px.get("hypothesis") or "Untitled ad"
        metrics: Json = px.get("metrics") or {}
        spend, signups = px.get("spend"), metrics.get("conversions")
        cost = (money(spend / signups, currency, 2) if spend is not None and signups
                else "no sign-ups" if signups == 0 else "not recorded")
        out += [f"### {CHANNELS.get(px.get('channel', ''), 'Ad')}: \"{headline}\"", "",
                f"- **Who saw it:** {px.get('audience', 'not recorded')}",
                f"- **Spent:** {money(spend, currency)} · **Clicks:** {count(metrics.get('clicks'))} "
                f"· **Sign-ups:** {count(signups)}",
                f"- **Cost per sign-up:** {cost}{goal}",
                f"- **Result:** {EXPERIMENT_VERDICTS.get(px.get('verdict', ''), 'Not judged yet.')}", ""]
    return out


def how_sure(brief: Json) -> list[str]:
    out = ["## How sure we are", ""]
    findings: list[Json] = brief.get("findings") or []
    for kind, heading in FINDING_KINDS:
        group = [f for f in findings if f.get("kind") == kind]
        if group:
            out += [f"**{heading}**", ""]
            for f in group:
                caveat = f" Caveat: {plain(f['limitations'])}." if f.get("limitations") else ""
                out.append(f"- {plain(f.get('claim', ''))} _({f.get('confidence', 'low')} confidence.{caveat})_")
            out.append("")
    if not findings:
        out += ["No findings recorded yet.", ""]
    skeptic: list[Json] = brief.get("skeptic") or []
    if skeptic:
        out += ["**We tried to prove this wrong:**", ""]
        for s in skeptic:
            searched = ", ".join(f"\"{q}\"" for q in s.get("queries", [])) or "nothing yet"
            result = SKEPTIC_RESULTS.get(s.get("result", ""), "result not recorded")
            out.append(f"- *{s.get('claim', '')}.* We searched for {searched}. Result: {result}.")
        out.append("")
    return out


def render(brief: Json, links: bool = True) -> str:
    name = (brief.get("business") or {}).get("name", "Your business")
    out = [f"# {name}: your GTMagic brief", ""]
    if brief.get("mode") == "demo":
        out += ["**Demo run — all data is fictional.**", ""]
    for section in (short_version(brief), before_after(brief), customer_groups(brief),
                    worries(brief, links), tried(brief), how_sure(brief)):
        out += section
    out += ["## Still open", ""] + ([f"- {q}" for q in brief.get("openQuestions") or []] or ["Nothing open right now."])
    return "\n".join(out).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Render brief.md from an intake.json save file.")
    parser.add_argument("intake", help="path to intake.json")
    parser.add_argument("-o", "--output", help="write here instead of stdout")
    parser.add_argument("--no-links", action="store_true", help="hide source links (e.g. for video)")
    args = parser.parse_args()
    try:
        with open(args.intake, encoding="utf-8") as fh:
            brief = json.load(fh)
        if not isinstance(brief, dict):
            raise ValueError("top level is not a JSON object")
        text = render(brief, links=not args.no_links)
        if not args.output:
            sys.stdout.write(text)
            return 0
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(text)
    except (OSError, ValueError) as err:  # JSONDecodeError is a ValueError
        print(f"render_brief: failed on {args.intake}: {err}", file=sys.stderr)
        return 1
    print(f"render_brief: wrote {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
