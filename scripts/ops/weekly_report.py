#!/usr/bin/env python3
"""Weekly AI cost and voice latency report (KIT-132, KIT-069).

Reads private.ai_cost_report and private.voice_report for the last seven full days (India time) and prints
Markdown. Needs psql and SUPABASE_DB_URL (the database connection string). In CI the output goes to the run summary.

  SUPABASE_DB_URL=postgresql://... python3 scripts/ops/weekly_report.py [--days 7]
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


class QueryError(RuntimeError):
    pass


def redact(text: str, url: str) -> str:
    """Hides every piece of the URL's user and password, even when the password holds an @ or a colon and psql
    misreads part of it as the host name."""
    rest = url.split("://", 1)[-1]
    userinfo = rest.rsplit("@", 1)[0] if "@" in rest else ""
    pieces = {p for chunk in userinfo.split("@") for p in chunk.split(":") if len(p) >= 3}
    pieces.add(userinfo)
    for p in sorted(pieces, key=len, reverse=True):
        if p:
            text = text.replace(p, "***")
    return text


def query(url: str, sql: str) -> list[list[str]]:
    r = subprocess.run(
        ["psql", url, "-X", "-q", "-A", "-t", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        # psql's message says what went wrong; anything from the URL's login part is hidden.
        raise QueryError(f"psql exit {r.returncode}: {redact(r.stderr.strip(), url)}")
    out = r.stdout
    return [line.split("\t") for line in out.splitlines() if line.strip()]


def table(headers: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return "_Nothing recorded._\n"
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    lines += ["| " + " | ".join(c or "–" for c in r) + " |" for r in rows]
    return "\n".join(lines) + "\n"


def num(x: str) -> float:
    try:
        return float(x)
    except ValueError:
        return 0.0


def render(start: date, end: date, ai: list[list[str]], voice: list[list[str]], targets: dict[str, float]) -> str:
    total = sum(num(r[8]) for r in ai)
    unpriced = sorted({r[1] for r in ai if r[9] == "f"})
    out = [f"# Cookmate weekly report: {start:%d %b} to {end - timedelta(days=1):%d %b %Y}\n"]
    out.append(f"**AI and speech cost:** ₹{total:,.2f} across {sum(int(num(r[2])) for r in ai):,} calls.\n")
    if unpriced:
        out.append(f"No price set for: {', '.join(unpriced)} (add them to `private.usage_prices`).\n")
    out.append("## Cost by task\n")
    out.append(
        table(
            ["Task", "Model", "Calls", "Failed", "Input", "Cache reads", "Output", "p50 ms", "₹"],
            [r[:9] for r in ai],
        )
    )
    out.append("## Voice sessions by day\n")
    p50, p95, budget = targets.get("voice_p50_target_ms"), targets.get("voice_p95_target_ms"), targets.get("voice_budget_inr")
    out.append(f"Targets: p50 ≤ {p50:.0f} ms, p95 ≤ {p95:.0f} ms, ≤ ₹{budget:.0f} per session.\n" if p50 and p95 and budget else "")
    out.append(
        table(
            ["Day", "Sessions", "Turns", "Fast-path share", "p50 ms", "p95 ms", "Avg ₹", "p95 ₹", "Over budget", "Cached TTS share"],
            voice,
        )
    )
    misses = [r[0] for r in voice if (p50 and num(r[4]) > p50) or (p95 and num(r[5]) > p95)]
    if misses:
        out.append(f"**Latency over target on:** {', '.join(misses)}\n")
    return "\n".join(out)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        print("SUPABASE_DB_URL is not set", file=sys.stderr)
        return 2
    end = datetime.now(IST).date()
    start = end - timedelta(days=args.days)
    span = f"'{start.isoformat()} 00:00+05:30'::timestamptz, '{end.isoformat()} 00:00+05:30'::timestamptz"
    try:
        ai = query(url, f"select * from private.ai_cost_report({span})")
        voice = query(url, f"select * from private.voice_report({span})")
        targets = {k: num(v) for k, v in query(url, "select key, value from private.telemetry_settings")}
    except QueryError as err:
        print(str(err), file=sys.stderr)
        return 1
    print(render(start, end, ai, voice, targets))
    return 0


if __name__ == "__main__":
    sys.exit(main())
