"""Unit economics, size math and prior-ad verdicts (used by validate_intake.py).

Every figure comes from the owner's own inputs: price, purchases per year, minimum revenue, cost
to serve, the share they choose to spend on acquisition, and their adoption estimate. Nothing here
is a benchmark: a missing input leaves its figure null instead of falling back to a default.
"""
from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # avoid a runtime import cycle; only the type is needed
    from validate_intake import Report

# Minimum volume before an ad result means anything: validation thresholds, not business assumptions.
MIN_CLICKS, MIN_CONVERSIONS = 100, 10


def num(value: object, r: Report, field: str) -> float | None:
    """Parse a number the model or a file supplied; record an error instead of crashing."""
    if value is None or value == "":
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        r.errors.append(f"{field}: '{value}' is not a number")
        return None


def share(biz: dict, field: str, r: Report) -> float | None:
    """An owner-confirmed share between 0 and 1 (0 is valid). Out of range is an error, not a guess."""
    value = num(biz.get(field), r, field)
    if value is not None and not 0 <= value <= 1:
        r.errors.append(f"business.{field}: {value:g} must be a share between 0 and 1 (e.g. 0.4 for 40%)")
        return None
    return value


def annual_revenue(biz: dict, r: Report) -> float | None:
    pricing = biz.get("pricing") or {}
    price = num(pricing.get("amount"), r, "pricing.amount")
    per_year = num(pricing.get("purchasesPerYear"), r, "purchasesPerYear")
    for field, value in (("pricing.amount", price), ("purchasesPerYear", per_year)):
        if value is not None and value <= 0:
            r.errors.append(f"{field}: {value:g} must be greater than zero")
            return None
    return round(price * per_year, 2) if price is not None and per_year is not None else None


def size_math(biz: dict, r: Report) -> dict:
    """Customers needed to reach the owner's minimum revenue, and the smallest group that could supply them."""
    annual = annual_revenue(biz, r)
    goal = num(biz.get("revenueGoal12mo"), r, "revenueGoal12mo")
    rate = share(biz, "adoptionRate", r)
    needed = math.ceil(goal / annual) if goal is not None and annual else None
    min_pop = math.ceil(needed / rate) if needed is not None and rate else None
    return {"customersNeeded": needed, "adoptionRate": rate, "minPopulation": min_pop}


def compute_unit_economics(brief: dict, r: Report) -> tuple[float | None, str]:
    """What a customer is worth, the break-even and chosen max cost per sign-up, and the margin left."""
    biz = brief.setdefault("business", {})
    annual = annual_revenue(biz, r)
    owner_target = num(biz.get("targetCpa"), r, "targetCpa")
    acq, serve = share(biz, "acquisitionShare", r), share(biz, "costToServeShare", r)
    max_cac = round(annual * acq, 2) if annual is not None and acq is not None else None
    break_even = round(annual * (1 - serve), 2) if annual is not None and serve is not None else None
    margin = round(1 - serve - acq, 4) if serve is not None and acq is not None else None
    if margin is not None and margin < 0:
        r.warnings.append(f"business: serving costs ({serve:.0%}) plus acquisition ({acq:.0%}) exceed first-year revenue; "
                          "each new customer loses money in year one")
    elif margin == 0:
        r.warnings.append("business: serving costs plus acquisition use all first-year revenue; each new customer only breaks even")
    target = owner_target if owner_target is not None else max_cac
    source = "owner" if owner_target is not None else "derived" if max_cac is not None else "none"
    biz["unitEconomics"] = {"annualRevenuePerCustomer": annual, "maxCac": max_cac, "breakEvenCac": break_even,
                            "firstYearMarginShare": margin,
                            "firstYearMargin": round(annual * margin, 2) if annual is not None and margin is not None else None,
                            "targetCpaUsed": target, "targetCpaSource": source}
    r.notes.append(f"unit economics: {annual} per customer per year; break-even {break_even}; max cost per sign-up {max_cac}; "
                   f"judging ads by {target} ({source})")
    return target, source


def compute_ads(brief: dict, r: Report) -> None:
    target, source = compute_unit_economics(brief, r)
    for px in brief.get("priorExperiments", []):
        pid, m = px.get("id"), px.get("metrics") or {}
        spend = num(px.get("spend"), r, f"{pid}.spend")
        clicks = num(m.get("clicks"), r, f"{pid}.clicks") or 0
        conv = num(m.get("conversions"), r, f"{pid}.conversions") or 0
        kind = px.get("conversionType")
        # The first blocking reason wins, so the brief explains *why* a result is inconclusive.
        reason = ("no target cost per sign-up, and not enough numbers to work one out" if target is None else
                  "these sign-ups were free trials, not paying customers" if kind == "trial" else
                  "we don't know whether these sign-ups were paying customers" if kind != "paying" else
                  "no spend was recorded" if spend is None else
                  f"fewer than {MIN_CLICKS} clicks" if clicks < MIN_CLICKS else
                  f"fewer than {MIN_CONVERSIONS} sign-ups" if conv < MIN_CONVERSIONS else None)
        if reason:
            px["verdict"], px["verdictReason"] = "inconclusive", reason
        else:
            cpa = spend / conv
            px["verdict"] = "worked" if cpa <= target else "didnt-work"
            label = "most you can spend, worked out from your numbers" if source == "derived" else "target"
            px["verdictReason"] = f"cost per sign-up {cpa:.2f} {'within' if cpa <= target else 'above'} the {target:g} {label}"
        r.notes.append(f"ad {pid}: {clicks:g} clicks, {conv:g} conversions -> {px['verdict']} ({px['verdictReason']})")
