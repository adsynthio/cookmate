"""Checks docs/play/LISTING.md against Play's limits: name 30, short description 80, full description 4,000 characters.

Each language section holds three fenced blocks, marked <!-- name -->, <!-- short --> and <!-- full -->.
Play counts characters (code points), so Kannada and Devanagari combining marks count one each.
Run: python3 tools/play/check_listing.py   (exits 1 if anything is over or missing)
"""
import pathlib
import re
import sys

LIMITS = {"name": 30, "short": 80, "full": 4000}
text = (pathlib.Path(__file__).resolve().parents[2] / "docs/play/LISTING.md").read_text(encoding="utf-8")

ok = True
sections = re.split(r"^## ", text, flags=re.M)[1:]
langs = [s for s in sections if re.search(r"`[a-z]{2}-[A-Z]{2}`", s.splitlines()[0])]
for sec in langs:
    lang = re.search(r"`([a-z]{2}-[A-Z]{2})`", sec.splitlines()[0]).group(1)
    for field, limit in LIMITS.items():
        m = re.search(rf"<!-- {field} -->\s*```\n(.*?)\n```", sec, flags=re.S)
        if not m:
            print(f"{lang} {field}: MISSING")
            ok = False
            continue
        n = len(m.group(1))
        flag = "ok" if n <= limit else "TOO LONG"
        ok &= n <= limit
        print(f"{lang} {field}: {n}/{limit} {flag}")
if len(langs) < 3:
    print(f"expected 3 languages, found {len(langs)}")
    ok = False
sys.exit(0 if ok else 1)
