#!/usr/bin/env python3
"""Generate the init schema migration and TypeScript types from docs/architecture.

Usage:
  python3 tools/archgen/build.py          # write generated files
  python3 tools/archgen/build.py --check  # exit 1 if generated files are stale (CI)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from schema import load, render_sql  # noqa: E402
from typescript import render_ts  # noqa: E402

ROOT = HERE.parent.parent
ARCH = ROOT / "docs" / "architecture"
SOURCE_NOTE = "docs/architecture/02,03,05 CSVs"

OUTPUTS = {
    ROOT / "supabase" / "migrations" / "20261116000000_init_schema.sql": "sql",
    ROOT / "apps" / "mobile" / "src" / "types" / "database.ts": "ts",
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if outputs are out of date")
    args = parser.parse_args()

    tables = load(ARCH)
    rendered = {"sql": render_sql(tables, SOURCE_NOTE), "ts": render_ts(tables, SOURCE_NOTE)}

    stale = []
    for path, kind in OUTPUTS.items():
        content = rendered[kind]
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == content:
            continue
        if args.check:
            stale.append(path.relative_to(ROOT))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            print(f"wrote {path.relative_to(ROOT)}")

    if stale:
        print("Generated files are out of date; run python3 tools/archgen/build.py:")
        for p in stale:
            print(f"  {p}")
        return 1
    print(f"{len(tables)} tables, {sum(len(t.columns) for t in tables)} columns, "
          f"{sum(len(t.policies) for t in tables)} policies")
    return 0


if __name__ == "__main__":
    sys.exit(main())
