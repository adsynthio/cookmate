"""Turn the generator's JSON drafts (content/recipes/<slug>.json) into recipe YAML, in the house style, and remove
the JSON. Run after generate.ts and before tools/content/build.py."""
import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
RECIPES = ROOT / "content" / "recipes"
ORDER = ["slug", "title", "titles", "description", "descriptions", "cuisine_region", "course", "diet", "base_servings",
         "prep_time_min", "cook_time_min", "difficulty", "spice_level", "equipment", "tags", "flavor_profile",
         "food_groups", "review_status", "ingredients", "steps"]


def main() -> int:
    n = 0
    for path in sorted(RECIPES.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        out = {k: doc[k] for k in ORDER if doc.get(k) not in (None, [], {})}
        text = "# Draft written by the library generator; waiting for review (review_status in_review).\n"
        text += yaml.safe_dump(out, allow_unicode=True, sort_keys=False, width=120)
        (RECIPES / f"{doc['slug']}.yaml").write_text(text, encoding="utf-8")
        path.unlink()
        n += 1
    print(f"wrote {n} recipe YAML files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
