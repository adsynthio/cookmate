#!/usr/bin/env python3
"""Copy pure TypeScript modules shared by the app and the Edge Functions.

The app is the source of truth; supabase/functions/_shared/ holds generated copies so each function deploys
self-contained. CI runs --check so the copies never drift.

  python3 scripts/sync-shared.py          # write copies
  python3 scripts/sync-shared.py --check  # exit 1 if a copy is stale
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED = {
    "apps/mobile/src/domain/pantryParse.ts": "supabase/functions/_shared/pantryParse.ts",
}
HEADER = "// GENERATED from {src} by scripts/sync-shared.py. Do not edit; edit the source and re-run.\n"


def main() -> int:
    check = "--check" in sys.argv
    stale = False
    for src, dst in SHARED.items():
        text = HEADER.format(src=src) + (ROOT / src).read_text(encoding="utf-8")
        out = ROOT / dst
        if check:
            if not out.exists() or out.read_text(encoding="utf-8") != text:
                print(f"stale: {dst} (run python3 scripts/sync-shared.py)", file=sys.stderr)
                stale = True
        else:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(text, encoding="utf-8")
            print(f"wrote {dst}")
    return 1 if stale else 0


if __name__ == "__main__":
    sys.exit(main())
