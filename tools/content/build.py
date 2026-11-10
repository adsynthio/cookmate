#!/usr/bin/env python3
"""Validate curated content and generate supabase/seed.sql.

Sources:
  content/catalog/ingredients.yaml, techniques.yaml, feature_flags.yaml
  content/recipes/*.yaml

Usage:
  python3 tools/content/build.py           # validate and write supabase/seed.sql
  python3 tools/content/build.py --check   # validate; exit 1 if seed.sql is stale (CI)

The SQL is idempotent: it upserts by natural key (ingredient canonical_name, technique slug, global recipe slug,
step number), so it can be re-run against a live project without breaking references such as cached step audio.
Feature flags are insert-only so the seed never undoes a flag changed in production.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
ARCH = ROOT / "docs" / "architecture"
OUT = ROOT / "supabase" / "seed.sql"

UNITS = {"g", "ml", "piece", "bunch", "packet"}
MEASURES = {"katori", "cup", "chammach", "chhota_chammach", "mutthi", "chutki", "piece", "clove", "inch", "bunch"}
GROUPS = {"dal", "sabzi", "greens", "fruit", "dairy", "protein", "grain"}
ALLERGENS = {"milk", "gluten", "peanut", "tree_nut", "sesame", "soy", "egg", "fish", "shellfish", "mustard"}
FLAGS = {"jain_avoid", "safety", "animal"}
TAGS = {"comforting", "quick", "high_protein", "kids_friendly", "light", "fasting", "one_pot", "tiffin", "festive"}
FLAVOR_KEYS = {"rich", "heat", "acid", "crunch", "starch", "sweet"}
AGE_GROUPS = {"child", "teen", "adult", "elder"}
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
TECH_SLUG = re.compile(r"^[a-z0-9]+(_[a-z0-9]+)*$")


class ContentError(Exception):
    pass


# --- enums from the architecture CSVs (same source as the schema) --------------------------------------------------


def load_enums() -> dict[tuple[str, str], list[str]]:
    enums: dict[tuple[str, str], list[str]] = {}
    with (ARCH / "03_database_columns.csv").open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            m = re.fullmatch(rf"\s*{re.escape(r['column'])}\s+in\s*\((.*)\)\s*", r["check_constraint"] or "")
            if m:
                enums[(r["table"], r["column"])] = re.findall(r"'([^']*)'", m.group(1))
    return enums


# --- loading and validation ----------------------------------------------------------------------------------------


class Validator:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.enums = load_enums()

    def err(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    def enum(self, where: str, table: str, column: str, value: Any) -> None:
        allowed = self.enums[(table, column)]
        if value not in allowed:
            self.err(where, f"{column} '{value}' not in {allowed}")

    def keys(self, where: str, obj: dict, required: set[str], optional: set[str]) -> None:
        missing = required - obj.keys()
        extra = obj.keys() - required - optional
        if missing:
            self.err(where, f"missing {sorted(missing)}")
        if extra:
            self.err(where, f"unknown keys {sorted(extra)}")


def read_yaml(path: Path) -> Any:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise ContentError(f"{path.relative_to(ROOT)}: invalid YAML: {e}") from e


def norm(s: str) -> str:
    return " ".join(s.lower().split())


def load_ingredients(v: Validator) -> dict[str, dict]:
    data = read_yaml(CONTENT / "catalog" / "ingredients.yaml")["ingredients"]
    out: dict[str, dict] = {}
    spoken: dict[str, str] = {}  # every name/alias -> ingredient, to catch ambiguous parsing
    for i, ing in enumerate(data):
        where = f"ingredients[{i}] {ing.get('name', '?')}"
        v.keys(where, ing, {"name", "hi", "latn", "category", "location", "life"},
               {"aliases", "unit", "measures", "groups", "staple", "allergens", "flags"})
        name = ing.get("name", "")
        if name != norm(name):
            v.err(where, "name must be lowercase with single spaces")
        if name in out:
            v.err(where, "duplicate name")
        v.enum(where, "ingredients", "category", ing.get("category"))
        v.enum(where, "ingredients", "default_location_kind", ing.get("location"))
        if ing.get("unit", "g") not in UNITS:
            v.err(where, f"unit must be one of {sorted(UNITS)}")
        kinds = set(v.enums[("storage_locations", "kind")])
        for k, days in (ing.get("life") or {}).items():
            if k not in kinds or not isinstance(days, int) or days <= 0:
                v.err(where, f"life.{k}={days!r}: kind must be one of {sorted(kinds)}, days a positive integer")
        if ing.get("location") not in (ing.get("life") or {}):
            v.err(where, f"life has no entry for its own location '{ing.get('location')}'")
        for k, grams in (ing.get("measures") or {}).items():
            if k not in MEASURES or not isinstance(grams, (int, float)) or grams <= 0:
                v.err(where, f"measures.{k}={grams!r}: measure must be one of {sorted(MEASURES)}, grams > 0")
        for field, allowed in (("groups", GROUPS), ("allergens", ALLERGENS), ("flags", FLAGS)):
            bad = set(ing.get(field) or []) - allowed
            if bad:
                v.err(where, f"{field} {sorted(bad)} not in {sorted(allowed)}")
        if ing.get("staple") and ing.get("location") != "staples":
            v.err(where, "staples must use location 'staples'")
        aliases = ing.get("aliases") or []
        if len(set(map(norm, aliases))) != len(aliases):
            v.err(where, "duplicate aliases")
        for term in {name, norm(str(ing.get("latn", ""))), *map(norm, aliases)}:
            owner = spoken.setdefault(term, name)
            if owner != name:
                v.err(where, f"'{term}' is also a name or alias of '{owner}' (ambiguous for parsing)")
        out[name] = ing
    return out


def load_techniques(v: Validator) -> dict[str, dict]:
    data = read_yaml(CONTENT / "catalog" / "techniques.yaml")["techniques"]
    out: dict[str, dict] = {}
    for i, t in enumerate(data):
        where = f"techniques[{i}] {t.get('slug', '?')}"
        v.keys(where, t, {"slug", "name", "hi", "latn", "difficulty", "description"}, set())
        if not TECH_SLUG.match(str(t.get("slug", ""))):
            v.err(where, "slug must be lowercase_with_underscores")
        if t.get("slug") in out:
            v.err(where, "duplicate slug")
        if not isinstance(t.get("difficulty"), int) or not 1 <= t["difficulty"] <= 5:
            v.err(where, "difficulty must be 1-5")
        out[t["slug"]] = t
    return out


def load_flags(v: Validator) -> list[dict]:
    data = read_yaml(CONTENT / "catalog" / "feature_flags.yaml")["feature_flags"]
    seen = set()
    for i, fl in enumerate(data):
        where = f"feature_flags[{i}] {fl.get('key', '?')}"
        v.keys(where, fl, {"key", "enabled", "rollout_pct", "rules"}, set())
        if fl.get("key") in seen:
            v.err(where, "duplicate key")
        seen.add(fl.get("key"))
        if not isinstance(fl.get("rollout_pct"), int) or not 0 <= fl["rollout_pct"] <= 100:
            v.err(where, "rollout_pct must be 0-100")
    return data


def diets_allowed(names: list[str], catalog: dict[str, dict]) -> set[str]:
    """Which diet labels a dish made of these ingredients can honestly carry."""
    cats = {catalog[n]["category"] for n in names}
    flags = set().union(*(catalog[n].get("flags") or [] for n in names)) if names else set()
    allergens = set().union(*(catalog[n].get("allergens") or [] for n in names)) if names else set()
    allowed = {"nonveg"}
    if not cats & {"meat", "seafood"}:
        allowed.add("eggetarian")
        if "egg" not in cats:
            allowed.add("veg")
            if "jain_avoid" not in flags:
                allowed.add("jain")
            if "dairy" not in cats and "milk" not in allergens and "animal" not in flags:
                allowed.add("vegan")
    return allowed


def rule_ingredient_refs(obj: Any) -> list[str]:
    """Ingredient names mentioned inside a variation rule's condition/action."""
    refs: list[str] = []
    if isinstance(obj, dict):
        for k, val in obj.items():
            if k in ("missing", "use") and isinstance(val, str):
                refs.append(val)
            elif k in ("omit", "have") and isinstance(val, list):
                refs.extend(x for x in val if isinstance(x, str))
            elif k == "add" and isinstance(val, list):
                refs.extend(x["ingredient"] for x in val if isinstance(x, dict) and "ingredient" in x)
            elif k == "replace" and isinstance(val, dict):
                refs.extend([*val.keys(), *val.values()])
            elif k == "reduce" and isinstance(val, dict):
                refs.extend(val.keys())
    return refs


def load_recipes(v: Validator, catalog: dict[str, dict], techniques: dict[str, dict]) -> list[dict]:
    recipes = []
    equipment = set(v.enums[("kitchen_equipment", "equipment_type")])
    for path in sorted((CONTENT / "recipes").glob("*.yaml")):
        r = read_yaml(path)
        where = f"recipes/{path.name}"
        v.keys(where, r, {"slug", "title", "titles", "description", "course", "diet", "base_servings", "difficulty",
                          "spice_level", "review_status", "ingredients", "steps"},
               {"cuisine_region", "prep_time_min", "cook_time_min", "equipment", "tags", "flavor_profile",
                "food_groups", "variation_rules"})
        if r.get("slug") != path.stem or not SLUG.match(str(r.get("slug", ""))):
            v.err(where, "slug must be lowercase-hyphenated and match the file name")
        v.enum(where, "recipes", "course", r.get("course"))
        v.enum(where, "recipes", "diet", r.get("diet"))
        v.enum(where, "recipes", "review_status", r.get("review_status"))
        for f, lo, hi in (("difficulty", 1, 5), ("spice_level", 1, 5), ("base_servings", 1, 50)):
            if not isinstance(r.get(f), int) or not lo <= r[f] <= hi:
                v.err(where, f"{f} must be an integer {lo}-{hi}")
        bad = set(r.get("equipment") or []) - equipment
        if bad:
            v.err(where, f"equipment {sorted(bad)} not in {sorted(equipment)}")
        bad = set(r.get("tags") or []) - TAGS
        if bad:
            v.err(where, f"tags {sorted(bad)} not in {sorted(TAGS)}")
        bad = set(r.get("food_groups") or []) - GROUPS
        if bad:
            v.err(where, f"food_groups {sorted(bad)} not in {sorted(GROUPS)}")
        for k, x in (r.get("flavor_profile") or {}).items():
            if k not in FLAVOR_KEYS or not isinstance(x, (int, float)) or not 0 <= x <= 1:
                v.err(where, f"flavor_profile.{k}={x!r}: keys {sorted(FLAVOR_KEYS)}, values 0-1")
        if set((r.get("titles") or {}).keys()) - {"hi", "hi-Latn", "en"}:
            v.err(where, "titles keys must be hi, hi-Latn, en")

        names = []
        for j, ing in enumerate(r.get("ingredients") or []):
            w = f"{where} ingredients[{j}]"
            v.keys(w, ing, {"ingredient", "qty", "unit", "role"}, {"local", "group", "optional", "substitutes"})
            name = ing.get("ingredient")
            if name not in catalog:
                v.err(w, f"'{name}' is not in the ingredient catalog")
                continue
            names.append(name)
            v.enum(w, "recipe_ingredients", "role", ing.get("role"))
            if ing.get("unit") not in UNITS:
                v.err(w, f"unit must be one of {sorted(UNITS)}")
            if not isinstance(ing.get("qty"), (int, float)) or ing["qty"] <= 0:
                v.err(w, "qty must be > 0")
            for s in ing.get("substitutes") or []:
                if s.get("ingredient") not in catalog:
                    v.err(w, f"substitute '{s.get('ingredient')}' is not in the catalog")
                if not isinstance(s.get("ratio"), (int, float)) or s["ratio"] <= 0:
                    v.err(w, "substitute ratio must be > 0")
        if not names:
            v.err(where, "no ingredients")

        allowed = diets_allowed(names, catalog)
        if r.get("diet") not in allowed:
            v.err(where, f"diet '{r.get('diet')}' contradicts the ingredients; it can be one of {sorted(allowed)}")

        steps = r.get("steps") or []
        if not steps:
            v.err(where, "no steps")
        for k, st in enumerate(steps, start=1):
            w = f"{where} step {k}"
            v.keys(w, st, {"text"}, {"technique", "minutes", "seconds", "timer", "whistles", "cue", "safety", "branch"})
            if "minutes" in st and "seconds" in st:
                v.err(w, "use minutes or seconds, not both")
            if st.get("timer") and not (st.get("minutes") or st.get("seconds")):
                v.err(w, "timer needs minutes or seconds")
            if st.get("technique") and st["technique"] not in techniques:
                v.err(w, f"technique '{st['technique']}' not in techniques.yaml")
            if st.get("whistles") is not None:
                if st.get("technique") != "pressure_cook":
                    v.err(w, "whistles need technique pressure_cook")
                if not isinstance(st["whistles"], int) or st["whistles"] <= 0:
                    v.err(w, "whistles must be a positive integer")
            if st.get("technique") == "pressure_cook" and "pressure_cooker" not in (r.get("equipment") or []):
                v.err(w, "pressure_cook step but pressure_cooker is not in equipment")
            br = st.get("branch")
            if br is not None and (not isinstance(br, dict) or br.get("age_group") not in AGE_GROUPS or not br.get("action")):
                v.err(w, f"branch needs age_group in {sorted(AGE_GROUPS)} and an action")

        needs_safety = sorted(n for n in names if "safety" in (catalog[n].get("flags") or []))
        if needs_safety and not any(st.get("safety") for st in steps):
            v.err(where, f"uses {needs_safety} but no step has a safety note")

        for k, rule in enumerate(r.get("variation_rules") or []):
            w = f"{where} variation_rules[{k}]"
            v.keys(w, rule, {"type", "action"}, {"condition", "note"})
            v.enum(w, "recipe_variation_rules", "rule_type", rule.get("type"))
            for ref in rule_ingredient_refs(rule.get("condition")) + rule_ingredient_refs(rule.get("action")):
                if ref not in catalog:
                    v.err(w, f"'{ref}' is not in the ingredient catalog")
            at = (rule.get("action") or {}).get("at_step")
            if at is not None and not 1 <= at <= len(steps):
                v.err(w, f"at_step {at} is outside 1-{len(steps)}")
            for s in (rule.get("action") or {}).get("skip_steps", []):
                if not 1 <= s <= len(steps):
                    v.err(w, f"skip_steps {s} is outside 1-{len(steps)}")
        recipes.append(r)
    return recipes


# --- SQL rendering -------------------------------------------------------------------------------------------------


def q(s: Any) -> str:
    if s is None:
        return "null"
    if isinstance(s, bool):
        return "true" if s else "false"
    if isinstance(s, (int, float)):
        return repr(s)
    return "'" + str(s).replace("'", "''") + "'"


def j(obj: Any) -> str:
    return q(json.dumps(obj, ensure_ascii=False, sort_keys=True)) + "::jsonb"


def arr(items: list[str] | None) -> str:
    items = items or []
    return "array[" + ", ".join(q(x) for x in items) + "]::text[]" if items else "'{}'::text[]"


def ing_id(name: str) -> str:
    return f"(select id from public.ingredients where canonical_name = {q(name)})"


def recipe_id(slug: str) -> str:
    return f"(select id from public.recipes where household_id is null and slug = {q(slug)})"


def render(catalog: dict[str, dict], techniques: dict[str, dict], flags: list[dict], recipes: list[dict]) -> str:
    out = [
        "-- GENERATED by tools/content/build.py from content/. Do not edit by hand.",
        "-- Idempotent: safe to re-run against local or hosted databases (run as the service role / postgres).",
        "",
        "begin;",
        "",
        f"-- Ingredients ({len(catalog)})",
        "insert into public.ingredients (canonical_name, names, aliases, category, default_unit, default_location_kind,",
        "  shelf_life_days, grams_per_measure, food_groups, is_staple, allergens) values",
    ]
    rows = []
    for name, ing in catalog.items():
        names = {"en": name, "hi": ing["hi"], "hi-Latn": ing["latn"]}
        rows.append(
            f"  ({q(name)}, {j(names)}, {arr(ing.get('aliases'))}, {q(ing['category'])}, {q(ing.get('unit', 'g'))}, "
            f"{q(ing['location'])}, {j(ing['life'])}, {j(ing.get('measures') or {})}, {arr(ing.get('groups'))}, "
            f"{q(bool(ing.get('staple')))}, {arr(ing.get('allergens'))})"
        )
    out.append(",\n".join(rows))
    out.append(
        "on conflict (canonical_name) do update set names = excluded.names, aliases = excluded.aliases,\n"
        "  category = excluded.category, default_unit = excluded.default_unit,\n"
        "  default_location_kind = excluded.default_location_kind, shelf_life_days = excluded.shelf_life_days,\n"
        "  grams_per_measure = excluded.grams_per_measure, food_groups = excluded.food_groups,\n"
        "  is_staple = excluded.is_staple, allergens = excluded.allergens;"
    )

    out += ["", f"-- Techniques ({len(techniques)})",
            "insert into public.techniques (slug, name, names, description, difficulty) values"]
    out.append(",\n".join(
        f"  ({q(t['slug'])}, {q(t['name'])}, {j({'en': t['name'], 'hi': t['hi'], 'hi-Latn': t['latn']})}, "
        f"{q(' '.join(t['description'].split()))}, {t['difficulty']})"
        for t in techniques.values()
    ))
    out.append("on conflict (slug) do update set name = excluded.name, names = excluded.names,\n"
               "  description = excluded.description, difficulty = excluded.difficulty;")

    out += ["", "-- Feature flags: insert missing keys only, never overwrite live values",
            "insert into public.feature_flags (key, enabled, rollout_pct, rules) values"]
    out.append(",\n".join(f"  ({q(f['key'])}, {q(f['enabled'])}, {f['rollout_pct']}, {j(f['rules'])})" for f in flags))
    out.append("on conflict (key) do nothing;")

    for r in recipes:
        slug = r["slug"]
        rid = recipe_id(slug)
        titles = {"en": r["title"], **(r.get("titles") or {})}
        published = r["review_status"] == "approved"
        out += [
            "",
            f"-- Recipe: {slug} ({r['review_status']}{', published' if published else ', not published'})",
            "insert into public.recipes (slug, title, titles, description, cuisine_region, course, diet, base_servings,",
            "  prep_time_min, cook_time_min, difficulty, spice_level, equipment, tags, flavor_profile, food_groups,",
            "  source, review_status, is_published) values",
            f"  ({q(slug)}, {q(r['title'])}, {j(titles)}, {q(' '.join(r['description'].split()))}, "
            f"{q(r.get('cuisine_region'))}, {q(r['course'])}, {q(r['diet'])}, {r['base_servings']}, "
            f"{q(r.get('prep_time_min'))}, {q(r.get('cook_time_min'))}, {r['difficulty']}, {r['spice_level']}, "
            f"{arr(r.get('equipment'))}, {arr(r.get('tags'))}, {j(r.get('flavor_profile') or {})}, "
            f"{arr(r.get('food_groups'))}, 'curated', {q(r['review_status'])}, {q(published)})",
            "on conflict (slug) where household_id is null do update set title = excluded.title, titles = excluded.titles,",
            "  description = excluded.description, cuisine_region = excluded.cuisine_region, course = excluded.course,",
            "  diet = excluded.diet, base_servings = excluded.base_servings, prep_time_min = excluded.prep_time_min,",
            "  cook_time_min = excluded.cook_time_min, difficulty = excluded.difficulty,",
            "  spice_level = excluded.spice_level, equipment = excluded.equipment, tags = excluded.tags,",
            "  flavor_profile = excluded.flavor_profile, food_groups = excluded.food_groups,",
            "  review_status = excluded.review_status, is_published = excluded.is_published;",
            "",
            f"delete from public.recipe_ingredients where recipe_id = {rid};",
            "insert into public.recipe_ingredients (recipe_id, ingredient_id, display_name, quantity, unit, local_measure,",
            "  is_optional, group_name, role, substitutes, sort_order) values",
        ]
        rows = []
        for n, ing in enumerate(r["ingredients"]):
            subs = ing.get("substitutes") or []
            subs_sql = (
                "jsonb_build_array(" + ", ".join(
                    f"jsonb_build_object('ingredient_id', {ing_id(s['ingredient'])}, 'ingredient', {q(s['ingredient'])}, "
                    f"'ratio', {s['ratio']}, 'note', {q(s.get('note'))})" for s in subs
                ) + ")"
            ) if subs else "'[]'::jsonb"
            rows.append(
                f"  ({rid}, {ing_id(ing['ingredient'])}, {q(ing['ingredient'])}, {ing['qty']}, {q(ing['unit'])}, "
                f"{q(ing.get('local'))}, {q(bool(ing.get('optional')))}, {q(ing.get('group'))}, {q(ing['role'])}, "
                f"{subs_sql}, {n})"
            )
        out.append(",\n".join(rows) + ";")

        out += [
            "",
            "insert into public.recipe_steps (recipe_id, step_no, instruction, instructions, technique_id, duration_sec,",
            "  timer_required, whistles, sensory_cue, sensory_cues, member_branch, safety_note) values",
        ]
        rows = []
        for k, st in enumerate(r["steps"], start=1):
            secs = st.get("seconds") or (st["minutes"] * 60 if st.get("minutes") else None)
            tech = f"(select id from public.techniques where slug = {q(st['technique'])})" if st.get("technique") else "null"
            cue = st.get("cue")
            rows.append(
                f"  ({rid}, {k}, {q(st['text'])}, {j({'en': st['text']})}, {tech}, {q(secs)}, "
                f"{q(bool(st.get('timer')))}, {q(st.get('whistles'))}, {q(cue)}, {j({'en': cue} if cue else {})}, "
                f"{j(st['branch']) if st.get('branch') else 'null'}, {q(st.get('safety'))})"
            )
        out.append(",\n".join(rows))
        out += [
            "on conflict (recipe_id, step_no) do update set instruction = excluded.instruction,",
            "  instructions = excluded.instructions, technique_id = excluded.technique_id,",
            "  duration_sec = excluded.duration_sec, timer_required = excluded.timer_required,",
            "  whistles = excluded.whistles, sensory_cue = excluded.sensory_cue, sensory_cues = excluded.sensory_cues,",
            "  member_branch = excluded.member_branch, safety_note = excluded.safety_note;",
            f"delete from public.recipe_steps where recipe_id = {rid} and step_no > {len(r['steps'])};",
            "",
            f"delete from public.recipe_variation_rules where recipe_id = {rid};",
        ]
        rules = r.get("variation_rules") or []
        if rules:
            out.append("insert into public.recipe_variation_rules (recipe_id, rule_type, condition, action, note) values")
            out.append(",\n".join(
                f"  ({rid}, {q(x['type'])}, {j(x.get('condition') or {})}, {j(x['action'])}, {q(x.get('note'))})"
                for x in rules
            ) + ";")

    out += ["", "commit;", ""]
    return "\n".join(out)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--check", action="store_true", help="exit 1 if supabase/seed.sql is stale")
    a = p.parse_args()

    v = Validator()
    try:
        catalog = load_ingredients(v)
        techniques = load_techniques(v)
        flags = load_flags(v)
        recipes = load_recipes(v, catalog, techniques)
    except ContentError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    if v.errors:
        for e in v.errors:
            print(f"error: {e}", file=sys.stderr)
        print(f"{len(v.errors)} content error(s)", file=sys.stderr)
        return 1

    sql = render(catalog, techniques, flags, recipes)
    approved = sum(r["review_status"] == "approved" for r in recipes)
    summary = (f"{len(catalog)} ingredients, {len(techniques)} techniques, {len(flags)} flags, "
               f"{len(recipes)} recipes ({approved} approved)")
    if a.check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != sql:
            print(f"stale: {OUT.relative_to(ROOT)} (run python3 tools/content/build.py)", file=sys.stderr)
            return 1
        print(f"content OK: {summary}")
        return 0
    OUT.write_text(sql, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
