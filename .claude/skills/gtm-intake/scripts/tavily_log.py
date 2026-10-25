#!/usr/bin/env python3
"""Search or read pages with Tavily and write the results straight into research-log.jsonl.

Usage:
  python3 tavily_log.py search "<query>" --log <ws>/research-log.jsonl [--depth basic|advanced] [--max-results 8]
                        [--domains a.com,b.com] [--domains-mode prefer|restrict] [--exclude x.com] [--time-range year]
                        [--topic general|news] [--exact] [--country "united states"] [--skeptic]
  python3 tavily_log.py extract <url> [<url> ...] --log <ws>/research-log.jsonl [--pre-read]
  python3 tavily_log.py budget --log <ws>/research-log.jsonl

The script, not the model, writes every search and source line, so each excerpt in the log is
exactly the text Tavily returned (personal details replaced with [removed]). Claude then copies
evidence excerpts (at most 25 words) out of the logged text, and validate_intake.py checks they
match. It refuses anything that would run past the research cap (15 today; reading the owner's own
website with extract --pre-read doesn't count), never extracts Reddit pages, and keeps one short
snippet from each Reddit search result. Needs TAVILY_API_KEY in the environment; never put the
key in a file in this repo or paste it into chat. Standard library only.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # works under python -I too
from provenance import PERSONAL_DETAILS  # noqa: E402

API = "https://api.tavily.com"
RESEARCH_CAP = 15            # SKILL.md: at most 15 searches and fetches today
MAX_LOGGED_CHARS = 8000      # per extracted page; enough to quote from without bloating the log
REDDIT_SNIPPET_CHARS = 400   # Reddit search results: one short snippet, never page text (Reddit's Responsible Builder Policy)


def is_reddit(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower().rstrip(".")
    return host in ("reddit.com", "redd.it") or host.endswith((".reddit.com", ".redd.it"))
ERRORS = {401: "the Tavily API key was rejected", 429: "Tavily rate limit hit; wait a minute and retry",
          432: "your Tavily plan's credit limit is used up", 433: "Tavily's pay-as-you-go limit is used up"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def scrub(text: str) -> str:
    """The same personal-detail pattern validate_intake.py rejects, replaced before anything is logged."""
    return PERSONAL_DETAILS.sub("[removed]", text or "")


def read_log(path: str) -> list[dict]:
    if not os.path.exists(path):
        return []
    lines = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(entry, dict):
                lines.append(entry)
    return lines


def used(log: list[dict]) -> int:
    """Searches and fetches that count against the cap (the website pre-read doesn't)."""
    return sum(1 for e in log if e.get("kind") in ("search", "fetch") and not e.get("preRead"))


def append(path: str, entries: list[dict]) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def call(endpoint: str, body: dict, replay: str | None) -> dict:
    """POST to Tavily, or read a saved response (for tests and offline demos)."""
    if replay:
        with open(replay, encoding="utf-8") as f:
            return json.load(f)
    key = os.environ.get("TAVILY_API_KEY", "").strip()
    if not key:
        raise SystemExit("ERROR set TAVILY_API_KEY in your shell first (app.tavily.com → API Keys). "
                         "Never paste it into chat or commit it.")
    req = urllib.request.Request(f"{API}/{endpoint}", data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"ERROR Tavily {endpoint} failed: {ERRORS.get(e.code, f'HTTP {e.code}')}. Nothing was logged.")
    except (urllib.error.URLError, TimeoutError) as e:
        raise SystemExit(f"ERROR couldn't reach Tavily ({e}). Nothing was logged.")


def csv(value: str | None) -> list[str]:
    return [x.strip() for x in (value or "").split(",") if x.strip()]


def search(args: argparse.Namespace) -> list[dict]:
    body: dict = {"query": args.query, "search_depth": args.depth, "max_results": args.max_results, "topic": args.topic,
                  "chunks_per_source": 3, "include_usage": True, "include_published_date": True}
    if args.domains:
        body.update(include_domains=csv(args.domains), include_domains_mode=args.domains_mode)
    if args.exclude:
        body["exclude_domains"] = csv(args.exclude)
    if args.time_range:
        body["time_range"] = args.time_range
    if args.exact:
        body["exact_match"] = True
    if args.country and args.topic == "general":
        body["country"] = args.country
    data = call("search", body, args.replay)
    at = now()
    # The query is logged exactly as given, so skeptic queries match validate_intake.py's check.
    entries = [{"kind": "search", "query": args.query, "at": at, "tool": "tavily", "depth": args.depth,
                "skeptic": args.skeptic,
                "credits": (data.get("usage") or {}).get("credits")}]
    for r in data.get("results") or []:
        if isinstance(r, dict) and r.get("url") and r.get("content"):
            text = scrub(r["content"])
            if is_reddit(r["url"]):  # keep only a short snippet from Reddit, never the whole thread
                text = text.split(" [...] ")[0][:REDDIT_SNIPPET_CHARS]
            entries.append({"kind": "source", "url": r["url"], "title": scrub(r.get("title", "")),
                            "excerpt": text, "at": at, "tool": "tavily", "query": args.query,
                            "publishedDate": r.get("published_date")})
    return entries


def extract(args: argparse.Namespace) -> list[dict]:
    blocked = [u for u in args.urls if is_reddit(u)]
    if blocked:
        raise SystemExit(f"ERROR won't extract {', '.join(blocked)}: Reddit doesn't allow scraping. "
                         "Use search results (short quotes with links) instead. Nothing was logged.")
    # Plain text, not markdown, so excerpts copied from the log carry no link syntax or asterisks.
    data = call("extract", {"urls": args.urls, "format": "text", "include_usage": True}, args.replay)
    at = now()
    entries: list[dict] = []
    for r in data.get("results") or []:
        if isinstance(r, dict) and r.get("url") and r.get("raw_content"):
            text = scrub(r["raw_content"])
            entries.append({"kind": "fetch", "url": r["url"], "at": at, "tool": "tavily", "preRead": args.pre_read})
            entries.append({"kind": "source", "url": r["url"], "title": scrub(r.get("title") or ""),
                            "excerpt": text[:MAX_LOGGED_CHARS], "truncated": len(text) > MAX_LOGGED_CHARS,
                            "at": at, "tool": "tavily", "preRead": args.pre_read})
    for f in data.get("failed_results") or []:
        print(f"WARNING couldn't read {f.get('url')}: {f.get('error', 'unknown error')}")
    return entries


def show(entries: list[dict], log_path: str, total_used: int) -> None:
    """What Claude reads: numbered sources, so it never has to open or retype the log."""
    sources = [e for e in entries if e["kind"] == "source"]
    for n, e in enumerate(sources, 1):
        preview = " ".join(e["excerpt"].split())[:300]
        print(f"[{n}] {e['title'] or '(no title)'} — {e['url']}\n    {preview}{'…' if len(e['excerpt']) > 300 else ''}")
    print(f"OK logged {len(sources)} source(s) to {log_path}; research budget used: {total_used} of {RESEARCH_CAP}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="command", required=True)
    s = sub.add_parser("search")
    s.add_argument("query")
    s.add_argument("--depth", default="advanced", choices=["basic", "advanced"], help="advanced costs 2 credits, gives longer verbatim snippets")
    s.add_argument("--max-results", type=int, default=8)
    s.add_argument("--domains", help="comma-separated domains to favour (default) or, with --domains-mode restrict, to limit to")
    s.add_argument("--domains-mode", default="prefer", choices=["prefer", "restrict"])
    s.add_argument("--exclude", help="comma-separated domains to leave out")
    s.add_argument("--time-range", choices=["day", "week", "month", "year"])
    s.add_argument("--topic", default="general", choices=["general", "news"])
    s.add_argument("--exact", action="store_true", help="only pages containing the quoted phrase(s) in the query")
    s.add_argument("--country", help='boost one country, e.g. "united states" (general topic only)')
    s.add_argument("--skeptic", action="store_true", help="mark this as a skeptic-pass query")
    e = sub.add_parser("extract")
    e.add_argument("urls", nargs="+")
    b = sub.add_parser("budget")
    for p in (s, e, b):
        p.add_argument("--log", required=True, help="research-log.jsonl in the workspace")
    e.add_argument("--pre-read", action="store_true", help="the owner's own website; doesn't count against the cap")
    for p in (s, e):
        p.add_argument("--cap", type=int, default=RESEARCH_CAP)
        p.add_argument("--replay", help="use a saved Tavily response instead of calling the API (tests, offline demo)")
    args = ap.parse_args()

    log = read_log(args.log)
    if args.command == "budget":
        print(f"research budget used: {used(log)} of {RESEARCH_CAP}")
        return 0
    pre_read = getattr(args, "pre_read", False)
    if args.command == "search":
        args.pre_read = False
    cost = len(args.urls) if args.command == "extract" else 1
    if not pre_read and used(log) + cost > args.cap:
        print(f"ERROR this would go past the research cap ({used(log)} used + {cost} of {args.cap}). "
              "Put open questions in openQuestions instead. Nothing was logged.")
        return 1
    entries = search(args) if args.command == "search" else extract(args)
    append(args.log, entries)
    show(entries, args.log, used(log + entries))
    return 0


if __name__ == "__main__":
    sys.exit(main())
