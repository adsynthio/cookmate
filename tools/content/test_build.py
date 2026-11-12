"""Tests for the content validator: run with  python3 -m unittest discover -s tools/content"""

from __future__ import annotations

import copy
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build  # noqa: E402

REAL = build.CONTENT


class ContentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        shutil.copytree(REAL, self.tmp / "content")
        build.CONTENT = self.tmp / "content"

    def tearDown(self) -> None:
        build.CONTENT = REAL
        shutil.rmtree(self.tmp)

    def run_validation(self) -> tuple[list[str], str]:
        v = build.Validator()
        catalog = build.load_ingredients(v)
        techniques = build.load_techniques(v)
        flags = build.load_flags(v)
        recipes = build.load_recipes(v, catalog, techniques)
        calendar = build.load_calendar(v, catalog)
        sql = build.render(catalog, techniques, flags, recipes, calendar) if not v.errors else ""
        return v.errors, sql

    def edit_recipe(self, slug: str, fn) -> None:
        path = build.CONTENT / "recipes" / f"{slug}.yaml"
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        fn(data)
        path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")

    def assertError(self, needle: str) -> None:
        errors, _ = self.run_validation()
        self.assertTrue(any(needle in e for e in errors), f"expected an error containing {needle!r}, got {errors}")

    def test_real_content_is_valid(self) -> None:
        errors, sql = self.run_validation()
        self.assertEqual(errors, [])
        self.assertIn("on conflict (canonical_name)", sql)

    def test_calendar_is_seeded_without_touching_household_rows(self) -> None:
        errors, sql = self.run_validation()
        self.assertEqual(errors, [])
        self.assertIn("delete from public.calendar_events where household_id is null", sql)
        self.assertIn("'Sharad Navratri'", sql)

    def edit_calendar(self, fn) -> None:
        path = next((build.CONTENT / "calendar").glob("*.yaml"))
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        fn(data["events"])
        path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")

    def test_calendar_rules_name_real_ingredients_or_tags(self) -> None:
        self.edit_calendar(lambda evs: evs[0]["rules"].setdefault("avoid", []).append("dragon fruit"))
        self.assertError("rules.avoid 'dragon fruit' is neither a catalog ingredient nor a recipe tag")

    def test_calendar_regions_and_kinds(self) -> None:
        def bad(evs):
            evs[0]["regions"] = ["Bihar"]
            evs[1]["kind"] = "guests"
        self.edit_calendar(bad)
        self.assertError("region 'Bihar' is not a two-letter state code")
        self.assertError("global rows are festivals or fasts")

    def test_meat_dish_cannot_be_labelled_veg(self) -> None:
        self.edit_recipe("chicken-curry", lambda r: r.update(diet="veg"))
        self.assertError("diet 'veg' contradicts the ingredients")

    def test_onion_dish_cannot_be_jain(self) -> None:
        self.edit_recipe("jeera-aloo", lambda r: r.update(diet="jain"))
        self.assertError("diet 'jain' contradicts")

    def test_dairy_dish_cannot_be_vegan(self) -> None:
        self.edit_recipe("matar-paneer", lambda r: r.update(diet="vegan"))
        self.assertError("diet 'vegan' contradicts")

    def test_safety_flagged_ingredient_needs_a_safety_note(self) -> None:
        def strip(r):
            for st in r["steps"]:
                st.pop("safety", None)
        self.edit_recipe("rajma", strip)
        self.assertError("no step has a safety note")

    def test_unknown_ingredient(self) -> None:
        self.edit_recipe("dal-tadka", lambda r: r["ingredients"].append(
            {"ingredient": "unicorn tears", "qty": 1, "unit": "g", "role": "garnish"}))
        self.assertError("'unicorn tears' is not in the ingredient catalog")

    def test_whistles_need_pressure_cooking(self) -> None:
        self.edit_recipe("kanda-poha", lambda r: r["steps"][0].update(whistles=2))
        self.assertError("whistles need technique pressure_cook")

    def test_timer_needs_a_duration(self) -> None:
        self.edit_recipe("egg-bhurji", lambda r: r["steps"][0].update(timer=True, minutes=None))
        self.assertError("timer needs minutes or seconds")

    def test_ambiguous_alias(self) -> None:
        path = build.CONTENT / "catalog" / "ingredients.yaml"
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        extra = copy.deepcopy(next(i for i in data["ingredients"] if i["name"] == "tomato"))
        extra.update(name="cherry tomato", latn="cherry tamatar", aliases=["pyaz"])
        data["ingredients"].append(extra)
        path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
        self.assertError("'pyaz' is also a name or alias of 'onion'")

    def test_only_approved_recipes_are_published(self) -> None:
        self.edit_recipe("jeera-aloo", lambda r: r.update(review_status="approved"))
        errors, sql = self.run_validation()
        self.assertEqual(errors, [])
        self.assertIn("-- Recipe: jeera-aloo (approved, published)", sql)
        self.assertIn("-- Recipe: rajma (draft, not published)", sql)

    def test_variation_rule_ingredients_must_exist(self) -> None:
        self.edit_recipe("kadhi-pakora", lambda r: r["variation_rules"].append(
            {"type": "omit", "action": {"omit": ["dragon fruit"]}}))
        self.assertError("'dragon fruit' is not in the ingredient catalog")


if __name__ == "__main__":
    unittest.main()
