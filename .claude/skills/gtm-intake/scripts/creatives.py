"""The owner's existing creatives: links to results, image files, guardrail flags, per-creative results.

Used by validate_intake.py. Creatives are the owner's own work: guardrail risks become warnings and
plain-words flags, never errors and never rewrites. Results come only from linked prior experiments and
are judged with economics.judge_ad, so a creative and its experiment can never disagree.
"""
from __future__ import annotations

import os
from typing import TYPE_CHECKING

from economics import judge_ad, num
from guardrails import banned_reasons
from provenance import norm

if TYPE_CHECKING:  # avoid a runtime import cycle; only the type is needed
    from validate_intake import Report

CHANNELS = {"meta", "google", "reddit", "tiktok", "email", "website", "other"}
FORMATS = {"text", "image"}
STATUSES = {"live", "past", "draft"}
CREATIVE_SOURCES = {"owner-text", "owner-file", "website"}
EXPERIMENT_SOURCES = {"file", "manual"}
CONVERSION_TYPES = {"paying", "trial", "unknown"}
COPY_FIELDS = ("headline", "body", "cta")
SOURCES_DIR = "sources"
MIXED_REASON = "these results mix paying customers with free trials or unconfirmed sign-ups, so they can't be added up"


def copy_text(cr: dict) -> str:
    """The owner's own words on a creative (never the model-written image description)."""
    return " ".join(str(cr.get(f) or "") for f in COPY_FIELDS).strip()


def enum(r: Report, where: str, field: str, value: object, allowed: set, required: bool = True) -> None:
    if (value is not None or required) and value not in allowed:
        r.errors.append(f"{where}: {field} must be one of {sorted(allowed)} (got '{value}')")


def check_experiment_side(experiments: list, cr_by_id: dict, r: Report) -> None:
    for px in experiments:
        pid, where = px.get("id"), f"prior experiment {px.get('id')}"
        enum(r, where, "channel", px.get("channel"), CHANNELS)
        enum(r, where, "source", px.get("source"), EXPERIMENT_SOURCES, required=False)
        enum(r, where, "conversionType", px.get("conversionType"), CONVERSION_TYPES, required=False)
        if px.get("source", "file") == "file" and not px.get("sourceFile"):
            r.warnings.append(f"{where}: no sourceFile; if the owner typed these numbers, set source to 'manual'")
        for cid in px.get("creativeIds") or []:
            cr = cr_by_id.get(cid)
            r.ref(cr is not None, where, cid, "creative")
            if cr is not None and pid not in (cr.get("experimentIds") or []):
                r.errors.append(f"{where}: lists creative {cid}, but {cid}.experimentIds doesn't list {pid} "
                                "(link both sides or neither)")
        if not px.get("creativeIds"):
            r.notes.append(f"{where}: results with no creative linked (fine; add the ad's wording if the owner has it)")


def check_image(cr: dict, where: str, base_dir: str, r: Report) -> None:
    path, described = cr.get("imageFile"), cr.get("imageDescription")
    if cr.get("format") == "text" and (path or described):
        r.warnings.append(f"{where}: text creative carries image fields; set format to 'image' or drop them")
    if cr.get("format") != "image":  # a bad format is already an error; don't pile image warnings on it
        return
    if not described:
        r.warnings.append(f"{where}: image creative has no imageDescription; describe what is visible in it")
    if not path:
        r.warnings.append(f"{where}: image creative has no imageFile; keep a copy under {SOURCES_DIR}/")
        return
    parts = os.path.normpath(str(path)).split(os.sep)
    if os.path.isabs(str(path)) or parts[0] != SOURCES_DIR or ".." in parts:
        r.errors.append(f"{where}: imageFile must be a relative path under {SOURCES_DIR}/ (got '{path}')")
    elif not os.path.isfile(os.path.join(base_dir, *parts)):
        r.warnings.append(f"{where}: image file '{path}' not found; copy the owner's upload there")


def flag_guardrails(cr: dict, where: str, r: Report) -> None:
    """Script-computed guardrailFlags: the owner's ad is theirs, so we warn and never rewrite it."""
    flags = banned_reasons(copy_text(cr))
    flags += [f"image: {why}" for why in banned_reasons(str(cr.get("imageDescription") or ""))]
    cr["guardrailFlags"] = flags
    for why in flags:
        r.warnings.append(f"{where} (the owner's own creative): {why}; ad platforms may restrict it. "
                          "Tell the owner; don't rewrite it")


def total(linked: list, key: str) -> float | None:
    """Sum spend or one metric across linked results; None if any is missing, so a partial sum never flatters a cost.

    Values were already checked by compute_ads, so a bad one counts as missing here rather than as a second error.
    """
    values = [num(px.get("spend") if key == "spend" else (px.get("metrics") or {}).get(key), None, key) for px in linked]
    if any(v is None for v in values):
        return None
    summed = sum(v for v in values if v is not None)
    return int(summed) if summed.is_integer() else round(summed, 2)  # whole counts stay whole in the save file


def performance(cr: dict, linked: list, known: dict, target: float | None, source: str) -> dict | None:
    """Per-creative results from its linked experiments (script-computed); None when nothing is linked.

    known: the brief's creatives by id, so a dangling id (already an error) never makes a result look shared.
    """
    if not linked:
        return None
    spend, impressions = total(linked, "spend"), total(linked, "impressions")
    clicks, conversions = total(linked, "clicks"), total(linked, "conversions")
    kinds = {px.get("conversionType") or "unknown" for px in linked}
    kind = kinds.pop() if len(kinds) == 1 else "mixed"
    if kind == "mixed":
        verdict, reason = "inconclusive", MIXED_REASON
    else:
        verdict, reason = judge_ad(spend, clicks or 0, conversions or 0, kind, target, source)
    shared = sorted({c for px in linked for c in px.get("creativeIds") or [] if c != cr.get("id") and c in known})
    return {"basis": "shared" if shared else "own", "sharedWith": shared,
            "spend": spend, "impressions": impressions, "clicks": clicks, "conversions": conversions,
            "ctr": round(clicks / impressions, 4) if clicks is not None and impressions else None,
            "costPerSignup": round(spend / conversions, 2) if spend is not None and conversions else None,
            "conversionType": kind, "verdict": verdict, "verdictReason": reason}


def check_creative_evidence(brief: dict, cr_by_id: dict, r: Report) -> None:
    """Evidence quoting a creative must be the owner's words, copied word for word from it."""
    for ev in brief.get("evidence", []):
        cid = ev.get("creativeId")
        if not cid:
            continue
        where, cr = f"evidence {ev.get('id')}", cr_by_id.get(cid)
        r.ref(cr is not None, where, cid, "creative")
        if ev.get("origin") != "owner-text" or ev.get("sourceType") != "first-party":
            r.errors.append(f"{where}: a creative's wording is the owner's own: origin 'owner-text', sourceType 'first-party'")
        if cr is not None and norm(str(ev.get("excerpt") or "")) not in norm(copy_text(cr)):
            r.errors.append(f"{where}: excerpt is not word for word in {cid}'s headline, body or CTA")


def check_creatives(brief: dict, base_dir: str, target: float | None, source: str, r: Report) -> None:
    """base_dir is the save file's folder; imageFile paths resolve against it."""
    creatives, experiments = brief.get("creatives") or [], brief.get("priorExperiments") or []
    cr_by_id = {c.get("id"): c for c in creatives}
    px_by_id = {p.get("id"): p for p in experiments}
    check_experiment_side(experiments, cr_by_id, r)
    for cr in creatives:
        cid, where = cr.get("id"), f"creative {cr.get('id')}"
        enum(r, where, "format", cr.get("format"), FORMATS)
        enum(r, where, "status", cr.get("status"), STATUSES)
        enum(r, where, "source", cr.get("source"), CREATIVE_SOURCES)
        enum(r, where, "channel", cr.get("channel"), CHANNELS, required=False)
        if not copy_text(cr) and not cr.get("imageDescription"):
            r.errors.append(f"{where}: no headline, body, CTA or image description; there's nothing to record")
        if cr.get("source") == "owner-file" and not cr.get("sourceFile"):
            r.warnings.append(f"{where}: source is owner-file but no sourceFile is named")
        linked, ids = [], cr.get("experimentIds") or []
        if len(set(ids)) < len(ids):  # counted once each: a repeated link would double the spend and sign-ups
            r.warnings.append(f"{where}: lists the same result more than once; counted once")
        for pid in dict.fromkeys(ids):
            px = px_by_id.get(pid)
            r.ref(px is not None, where, pid, "prior experiment")
            if px is None:
                continue
            linked.append(px)
            if cid not in (px.get("creativeIds") or []):
                r.errors.append(f"{where}: lists {pid}, but {pid}.creativeIds doesn't list {cid} (link both sides or neither)")
            headline = (px.get("message") or {}).get("headline")
            if cr.get("headline") and headline and norm(str(cr["headline"])) != norm(str(headline)):
                r.warnings.append(f"{where}: headline differs from {pid}'s; check they're the same ad")
        if linked and cr.get("status") == "draft":
            r.warnings.append(f"{where}: marked draft but has results; is it live or past?")
        check_image(cr, where, base_dir, r)
        flag_guardrails(cr, where, r)
        cr["performance"] = performance(cr, linked, cr_by_id, target, source)
        perf = cr["performance"]
        r.notes.append(f"{where}: " + (f"{perf['verdict']} ({perf['verdictReason']}; {perf['basis']} results)"
                                       if perf else "no results linked"))
    check_creative_evidence(brief, cr_by_id, r)
