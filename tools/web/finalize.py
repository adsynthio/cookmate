"""Finishes the exported web app for static hosting under a sub-path (GitHub Pages: /cookmate/app).

- Fills __BASE__ in index.html and manifest.webmanifest (links to the manifest and icons).
- Copies index.html to 404.html: Pages serves 404.html for any unknown path, so opening or reloading a deep link
  such as /cookmate/app/recipe/dal-tadka still starts the app, and the router shows the right screen.
- Adds .nojekyll so folders starting with "_" (Expo's _expo/) are served.
Run: python3 tools/web/finalize.py <export dir> <base path, e.g. /cookmate/app>
"""
import pathlib
import shutil
import sys

out, base = pathlib.Path(sys.argv[1]), sys.argv[2].rstrip("/")
for name in ("index.html", "manifest.webmanifest"):
    f = out / name
    f.write_text(f.read_text(encoding="utf-8").replace("__BASE__", base), encoding="utf-8")
assert "__BASE__" not in (out / "index.html").read_text(encoding="utf-8")
shutil.copyfile(out / "index.html", out / "404.html")
(out / ".nojekyll").write_text("")
print(f"web app ready in {out} for {base}/")
