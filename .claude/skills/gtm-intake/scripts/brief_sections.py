"""Plain-words tables and the owner-input sections of brief.md (used by render_brief.py).

Kept apart from render_brief.py so both files stay small: the enum-to-plain-words tables, the money helpers,
and the sections built from what the owner told us (must-haves, best guess, what a customer is worth).
"""
from __future__ import annotations

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
EXPERIMENT_VERDICTS = {"worked": "Worked: it cost less per sign-up than the most you can spend.",
                       "didnt-work": "Didn't work: it cost more per sign-up than the most you can spend.",
                       "inconclusive": "Too early to tell."}
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
DIMENSIONS = {"geography": "Where", "age": "Ages", "sex": "Sex", "income": "Income", "lifeStage": "Life stage",
              "healthCondition": "Health", "audienceType": "Who", "price": "Price", "channel": "Channels",
              "language": "Language", "regulatory": "Rules", "ethics": "Ethics", "interest": "Interests"}
GUESS_STATUS = {"supported": "Supported so far", "weakened": "Weakened by research",
                "untested": "Not tested yet", "refuted": "Contradicted by research"}
# Readiness check name (matched by prefix, "[script] " stripped) -> what is still missing, said to the owner.
NOT_DONE = {
    "Owner confirmed": "You haven't confirmed the brief yet",
    "Owner confirmation": "Your confirmation isn't recorded yet",
    "Today's targeting dimensions": "We haven't covered where you sell, ages, price, channels, claim limits and interests yet",
    "ICP has": "Your target customer isn't fully described yet (who they are, who fits, who doesn't)",
    "Geography and price": "You haven't told us where you sell and what you charge yet",
    "One primary": "Your best guess, and what would prove it wrong, isn't agreed yet",
    "At least 2": "You don't have two customer groups to compare yet",
    "Concern counts": "Your customers' worries aren't counted yet",
    "3-5 messaging": "You don't have 3 to 5 message lines that pass the wording check yet",
    "Every finding": "Some findings in your brief aren't tied to a source yet",
    "Skeptic pass": "Your brief hasn't been through the 'try to prove it wrong' step yet",
    "No integrity errors": "Your brief's data has problems we still need to fix",
}
PUSHBACK_KEPT = " (we checked this against research once; you kept it)"


def money(amount: float | None, currency: str, decimals: int = 0) -> str:
    if amount is None:
        return "not recorded"
    value = f"{amount:,.{decimals}f}"
    return f"${value}" if currency == "USD" else f"{value} {currency}"


def currency_of(brief: Json) -> str:
    return ((brief.get("business") or {}).get("pricing") or {}).get("currency", "USD")


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def not_done(check: str) -> str:
    """A failed readiness check, said to the owner; unknown checks fall back to their own name."""
    name = check.replace("[script] ", "")
    return next((said for prefix, said in NOT_DONE.items() if name.startswith(prefix)), name)


def customer_worth(brief: Json) -> list[str]:
    """What a customer brings in a year, what the owner can spend to win one, and what's left.

    Only the owner's own numbers, never a benchmark. Each line appears only once the validator has computed it.
    """
    business: Json = brief.get("business") or {}
    econ: Json = business.get("unitEconomics") or {}
    annual, cur = econ.get("annualRevenuePerCustomer"), currency_of(brief)
    share, serve = business.get("acquisitionShare"), business.get("costToServeShare")
    if not is_number(annual) or annual <= 0:
        return []
    text = f"**What a customer is worth:** about {money(annual, cur, 2)} in their first year."
    if is_number(share) and is_number(econ.get("maxCac")):
        text += (f" You said you can spend up to {share:.0%} of that to win one, so the most a sign-up "
                 f"should cost is about {money(econ['maxCac'], cur, 2)}.")
    if econ.get("targetCpaSource") == "owner" and is_number(econ.get("targetCpaUsed")):
        text += f" You told us your target cost per sign-up is {money(econ['targetCpaUsed'], cur, 2)}."
    out = ["", text]
    if is_number(serve) and is_number(econ.get("breakEvenCac")):
        out.append(f"- Serving a customer costs you about {serve:.0%} of what they pay, so you break even in year one "
                   f"if a new customer costs less than {money(econ['breakEvenCac'], cur, 2)}.")
    margin_share, margin = econ.get("firstYearMarginShare"), econ.get("firstYearMargin")
    if is_number(margin_share) and margin_share < 0:
        out.append("- At these numbers you'd lose money on each new customer in their first year.")
    elif is_number(margin_share) and margin_share == 0:
        out.append("- At these numbers each new customer only breaks even in their first year: nothing is left as margin.")
    elif is_number(margin_share) and is_number(serve) and is_number(share):
        dollars = f" ({money(margin, cur, 2)})" if is_number(margin) else ""
        out.append(f"- After serving costs ({serve:.0%}) and what you'll spend to win them ({share:.0%}), about "
                   f"{margin_share:.0%}{dollars} of a customer's first-year revenue is left as margin.")
    return out


def constraint_text(con: Json) -> str:
    """One constraint in plain words: 'Only in: US', 'Ages 35–64', 'Never in messaging: medical claims'."""
    rule: Json = con.get("rule") or {}
    dim = con.get("dimension", "")
    label = DIMENSIONS.get(dim, "Other")
    values = ", ".join(CHANNELS.get(v, v) if dim == "channel" else str(v) for v in rule.get("values") or [])
    values = values or "not set"
    if rule.get("op") == "exclude":
        where = " in messaging" if con.get("appliesTo") == "messaging" else ""
        return f"Never{where}: {values}"
    if rule.get("op") == "range":
        low, high = (f"{v:,.0f}" if is_number(v) else "" for v in (rule.get("min"), rule.get("max")))
        span = f"{low}–{high}" if low and high else f"{low} and up" if low else f"up to {high}" if high else "not set"
        return f"Ages {span}" if dim == "age" else f"{label}: {span}"
    return f"{'Only in' if dim == 'geography' else label}: {values}"


def must_be_true(brief: Json) -> list[str]:
    """Must-haves (locked constraints), then nice-to-haves (preferences)."""
    constraints: list[Json] = brief.get("constraints") or []
    musts = [c for c in constraints if c.get("bucket") == "locked"]
    nice = [c for c in constraints if c.get("bucket") == "preference"]
    out = ["## What you told us must be true", ""]
    for con in musts:
        kept = PUSHBACK_KEPT if (con.get("pushback") or {}).get("ownerKept") else ""
        out.append(f"- {constraint_text(con)}{kept}")
    if not musts:
        out.append("You haven't told us anything that must be true yet.")
    if nice:
        out += ["", f"**Nice-to-haves:** {'; '.join(constraint_text(c) for c in nice)}."]
    return out + [""]


def best_guess(brief: Json) -> list[str]:
    """Each hypothesis as one plain sentence, main guess first."""
    out = ["## Our best guess", ""]
    guesses = sorted(brief.get("hypotheses") or [], key=lambda h: h.get("kind") != "primary")
    if not guesses:
        return out + ["No best guess written down yet.", ""]
    for guess in guesses:
        part = {k: str(guess.get(k) or "(not filled in yet)").rstrip(".")
                for k in ("segment", "motivation", "insteadOf", "price", "wrongIf")}
        label = "Main guess" if guess.get("kind") == "primary" else "Other possibility"
        action = "switch" if guess.get("action") == "switch" else "buy"
        status = GUESS_STATUS.get(guess.get("status", ""), "Not tested yet")
        out += [f"{label}: **{part['segment']}** will {action} because {part['motivation']}, "
                f"instead of {part['insteadOf']}, at {part['price']}.", "",
                f"- We'd be wrong if: {part['wrongIf']}.", f"- Where it stands: {status}.", ""]
    return out
