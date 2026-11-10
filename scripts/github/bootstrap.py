#!/usr/bin/env python3
"""Create GitHub labels, milestones and one issue per user story from docs/architecture CSVs.

Idempotent: existing labels, milestones and issues (matched by title prefix "[KIT-xxx]") are skipped.
Dry run by default; pass --apply to make changes. Needs the `gh` CLI authenticated for the repo.

  python3 scripts/github/bootstrap.py --repo adsynthio/cookmate            # show what would happen
  python3 scripts/github/bootstrap.py --repo adsynthio/cookmate --apply    # do it
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
from pathlib import Path

ARCH = Path(__file__).resolve().parents[2] / "docs" / "architecture"


def rows(name: str) -> list[dict[str, str]]:
    with (ARCH / name).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def gh(*args: str, apply: bool, read: bool = False) -> str:
    if not apply and not read:
        print("  would run: gh", " ".join(a if len(a) < 60 else a[:57] + "..." for a in args))
        return ""
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--repo", required=True)
    p.add_argument("--apply", action="store_true")
    a = p.parse_args()

    existing_labels = {l["name"] for l in json.loads(gh("label", "list", "-R", a.repo, "-L", "500", "--json", "name", apply=a.apply, read=True) or "[]")}
    for l in rows("16_github_labels.csv"):
        if l["name"] not in existing_labels:
            gh("label", "create", l["name"], "-R", a.repo, "--color", l["color"], "--description", l["description"], apply=a.apply)

    existing_ms = {m["title"] for m in json.loads(gh("api", f"repos/{a.repo}/milestones?state=all&per_page=100", apply=a.apply, read=True) or "[]")}
    for m in rows("17_github_milestones.csv"):
        if m["title"] not in existing_ms:
            gh("api", f"repos/{a.repo}/milestones", "-f", f"title={m['title']}", "-f", f"due_on={m['due_on']}T23:59:59Z",
               "-f", f"description={m['description']}", apply=a.apply)

    existing_issues = json.loads(gh("issue", "list", "-R", a.repo, "-s", "all", "-L", "1000", "--json", "title", apply=a.apply, read=True) or "[]")
    have = {i["title"].split("]")[0] + "]" for i in existing_issues if i["title"].startswith("[")}
    for s in rows("14_user_stories.csv"):
        prefix = f"[{s['story_id']}]"
        if prefix in have:
            continue
        body = (
            f"{s['user_story']}\n\n### Acceptance criteria\n{s['acceptance_criteria']}\n\n"
            f"**Epic:** {s['epic_id']} · **Requirements:** {s['prd_requirements']} · "
            f"**Points:** {s['story_points']} · **Depends on:** {s['depends_on'] or '—'}"
        )
        labels = [x.strip() for x in s["labels"].split(",") if x.strip()]
        args = ["issue", "create", "-R", a.repo, "--title", f"{prefix} {s['title']}", "--body", body, "--milestone", s["milestone"]]
        for label in labels:
            args += ["--label", label]
        gh(*args, apply=a.apply)

    print("done" if a.apply else "dry run complete; pass --apply to make these changes")


if __name__ == "__main__":
    main()
