"""Messaging and targeting guardrails for health-related briefs (used by validate_intake.py).

Kept separate so the rules are easy to find and extend: what messaging may never say,
which proxies may never name a condition, and which locks a health brief must carry.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # avoid a runtime import cycle; only the type is needed
    from validate_intake import Report

# Brand and generic names, plus "GLP-1" however it is hyphenated or spaced.
DRUG_TERMS = (r"ozempic|wegovy|mounjaro|zepbound|semaglutide|tirzepatide|saxenda|liraglutide|glp[\s\-\u2010-\u2015]?1"
              r"|\bmedications?\b|\bmeds\b|\bprescri|\binjections?\b|\bjabs?\b|weight[- ]loss (shots?|drugs?)")
CONDITION_TERMS = DRUG_TERMS + r"|diabet|obes|bariatric"
MESSAGING_BANNED = {
    "names a medication, drug class or treatment": DRUG_TERMS,
    "assumes the reader's condition": r"\bare you on\b|\byour (meds|medication|shots?|injections?)\b",
    "superlative or guarantee": r"\bbest\b|#1|\bnumber one\b|\bguarantee",
    "medical claim": r"\bcures?\b|\btreats?\b|\btreatment\b|\bprevents?\b|\bdiagnos|\bclinically\b|\bdoctor[- ]approved\b",
}

def check_messaging(brief: dict, seg_ids: set, lex_ids: set, r: Report) -> bool:
    ok = True
    for i, msg in enumerate(brief.get("roughMessaging", [])):
        where = f"roughMessaging[{i}]"
        r.ref(msg.get("segmentId") in seg_ids, where, msg.get("segmentId"), "segment")
        if not msg.get("lexiconIds"):
            r.errors.append(f"{where}: must borrow at least one real customer phrase (lexiconIds)")
            ok = False
        for lid in msg.get("lexiconIds", []):
            r.ref(lid in lex_ids, where, lid, "lexicon")
        text = f"{msg.get('headline', '')} {msg.get('subheadline', '')}"
        for why, pattern in MESSAGING_BANNED.items():
            if re.search(pattern, text, re.IGNORECASE):
                r.errors.append(f"{where}: {why}: \"{text.strip()}\"")
                ok = False
    health_topic = False
    for g in brief.get("interests", []):
        health_topic |= bool(re.search(CONDITION_TERMS, g.get("researchDefinition", ""), re.IGNORECASE))
        for proxy in g.get("targetableProxies", []):
            if re.search(CONDITION_TERMS, proxy, re.IGNORECASE):
                r.errors.append(f"interest {g.get('id')}: targetable proxy names a health condition: \"{proxy}\"")
    if health_topic:  # a health-related brief must carry both guardrail locks
        locked = {c.get("dimension") for c in brief.get("constraints", []) if c.get("bucket") == "locked"}
        for dim in ("healthCondition", "regulatory"):
            if dim not in locked:
                r.errors.append(f"constraints: health-related brief needs a locked '{dim}' constraint")
    return ok
