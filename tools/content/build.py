#!/usr/bin/env python3
"""Validate curated content and generate supabase/seed.sql.

Sources:
  content/catalog/ingredients.yaml, techniques.yaml, feature_flags.yaml
  content/recipes/*.yaml
  content/calendar/*.yaml (festivals and fasts, KIT-144; dates from tools/content/festivals.py)

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
CATALOG_OUT = ROOT / "apps" / "mobile" / "src" / "data" / "catalog.json"
RECIPES_OUT = ROOT / "apps" / "mobile" / "src" / "data" / "recipes.json"

# Step cues by sense, in the order they are read out; "avoid" is the warning (\"don't let it...\").
SENSES = ("look", "sound", "smell", "touch", "taste", "avoid")
HEATS = {"low", "medium", "high"}
# Each step in the app's other languages: the instruction, the cues, safety and the family note, translated.
SAY_LANGS = ("hi", "hi-Latn")
SAY_KEYS = ("text",) + SENSES + ("safety", "branch")
CALENDAR_OUT = ROOT / "apps" / "mobile" / "src" / "data" / "calendar.json"

UNITS = {"g", "ml", "piece", "bunch", "packet"}
MEASURES = {"katori", "cup", "chammach", "chhota_chammach", "mutthi", "chutki", "piece", "clove", "inch", "bunch"}
GROUPS = {"dal", "sabzi", "greens", "fruit", "dairy", "protein", "grain"}
ALLERGENS = {"milk", "gluten", "peanut", "tree_nut", "sesame", "soy", "egg", "fish", "shellfish", "mustard"}
FLAGS = {"jain_avoid", "safety", "animal"}
TAGS = {"comforting", "quick", "high_protein", "kids_friendly", "light", "fasting", "one_pot", "tiffin", "festive", "basics"}
FLAVOR_KEYS = {"rich", "heat", "acid", "crunch", "starch", "sweet"}
AGE_GROUPS = {"child", "teen", "adult", "elder"}
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
REGION = re.compile(r"^[A-Z]{2}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
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
                "food_groups", "variation_rules", "descriptions"})
        ds = r.get("descriptions")
        if ds is not None and (not isinstance(ds, dict) or not set(ds) <= set(SAY_LANGS)
                               or not all(isinstance(x, str) and x.strip() for x in ds.values())):
            v.err(where, f"descriptions must map some of {list(SAY_LANGS)} to a sentence")
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
            v.keys(w, st, {"text"}, {"technique", "minutes", "seconds", "timer", "whistles", "cue", "cues", "heat", "safety", "branch", "say"})
            if st.get("heat") is not None and st["heat"] not in HEATS:
                v.err(w, f"heat must be one of {sorted(HEATS)}")
            cues = st.get("cues")
            if cues is not None:
                if not isinstance(cues, dict) or not cues or not set(cues) <= set(SENSES):
                    v.err(w, f"cues must map some of {list(SENSES)} to sentences")
                elif not all(isinstance(x, str) and x.strip() for x in cues.values()):
                    v.err(w, "every cue must be a sentence")
                elif not st.get("cue"):
                    # The one-line cue (voice agent, older app builds) is the senses joined, warning last.
                    st["cue"] = " ".join(cues[k].strip() for k in SENSES if k in cues)
            say = st.get("say")
            if say is not None:
                if not isinstance(say, dict) or not set(say) <= set(SAY_LANGS):
                    v.err(w, f"say must map some of {list(SAY_LANGS)} to the translated step")
                else:
                    # A translation says everything the English does, so nothing is left in English.
                    needed = {"text"} | set(st.get("cues") or {}) | ({"safety"} if st.get("safety") else set()) | ({"branch"} if st.get("branch") else set())
                    for lang, tr in say.items():
                        if not isinstance(tr, dict) or not set(tr) <= set(SAY_KEYS):
                            v.err(w, f"say.{lang} keys must be some of {list(SAY_KEYS)}")
                        elif not all(isinstance(x, str) and x.strip() for x in tr.values()):
                            v.err(w, f"say.{lang}: every line must be a sentence")
                        elif needed - set(tr):
                            v.err(w, f"say.{lang} is missing {sorted(needed - set(tr))}")
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


def load_calendar(v: Validator, catalog: dict[str, dict]) -> list[dict]:
    """Global festival and fast rows. Rule words must be catalog ingredients or recipe tags."""
    events: list[dict] = []
    for path in sorted((CONTENT / "calendar").glob("*.yaml")):
        data = read_yaml(path) or {}
        for i, ev in enumerate(data.get("events") or []):
            where = f"{path.name}[{i}] {ev.get('name', '?')}"
            v.keys(where, ev, {"kind", "name", "date", "regions", "rules"}, {"end", "names", "check", "note"})
            v.enum(where, "calendar_events", "kind", ev.get("kind"))
            if ev.get("kind") not in ("festival", "fast"):
                v.err(where, "global rows are festivals or fasts")
            for k in ("date", "end"):
                if k in ev and not DATE.match(str(ev[k])):
                    v.err(where, f"{k} must be YYYY-MM-DD")
            if ev.get("end") and str(ev["end"]) < str(ev.get("date")):
                v.err(where, "end is before date")
            for r in ev.get("regions") or []:
                if not REGION.match(str(r)):
                    v.err(where, f"region '{r}' is not a two-letter state code")
            rules = ev.get("rules") or {}
            v.keys(where + " rules", rules, set(), {"avoid", "prefer", "note"})
            for k in ("avoid", "prefer"):
                for word in rules.get(k) or []:
                    if word not in catalog and word not in TAGS:
                        v.err(where, f"rules.{k} '{word}' is neither a catalog ingredient nor a recipe tag")
            names = ev.get("names") or {}
            v.keys(where + " names", names, set(), {"hi", "hi-Latn"})
            events.append(ev)
    return events


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


def render(catalog: dict[str, dict], techniques: dict[str, dict], flags: list[dict], recipes: list[dict],
           calendar: list[dict] | None = None) -> str:
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
            "insert into public.recipes (slug, title, titles, description, descriptions, cuisine_region, course, diet, base_servings,",
            "  prep_time_min, cook_time_min, difficulty, spice_level, equipment, tags, flavor_profile, food_groups,",
            "  source, review_status, is_published) values",
            f"  ({q(slug)}, {q(r['title'])}, {j(titles)}, {q(' '.join(r['description'].split()))}, "
            f"{j(r.get('descriptions') or {})}, {q(r.get('cuisine_region'))}, {q(r['course'])}, {q(r['diet'])}, {r['base_servings']}, "
            f"{q(r.get('prep_time_min'))}, {q(r.get('cook_time_min'))}, {r['difficulty']}, {r['spice_level']}, "
            f"{arr(r.get('equipment'))}, {arr(r.get('tags'))}, {j(r.get('flavor_profile') or {})}, "
            f"{arr(r.get('food_groups'))}, 'curated', {q(r['review_status'])}, {q(published)})",
            "on conflict (slug) where household_id is null do update set title = excluded.title, titles = excluded.titles,",
            "  description = excluded.description, descriptions = excluded.descriptions, cuisine_region = excluded.cuisine_region, course = excluded.course,",
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
            # sensory_cues: {en: the one-line cue, look/sound/smell/touch/taste/avoid: one sentence each, heat}.
            sensory = ({"en": cue} if cue else {}) | dict(st.get("cues") or {}) | ({"heat": st["heat"]} if st.get("heat") else {})
            rows.append(
                f"  ({rid}, {k}, {q(st['text'])}, {j({'en': st['text']} | dict(st.get('say') or {}))}, {tech}, {q(secs)}, "
                f"{q(bool(st.get('timer')))}, {q(st.get('whistles'))}, {q(cue)}, {j(sensory)}, "
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

    if calendar:
        first = min(str(e["date"]) for e in calendar)
        last = max(str(e.get("end") or e["date"]) for e in calendar)
        out += ["", f"-- Calendar ({len(calendar)} festivals and fasts, {first} to {last}): global rows in the window are",
                "-- replaced; households' own rows (and copies of fasts they keep) are never touched.",
                f"delete from public.calendar_events where household_id is null and event_date between {q(first)} and {q(last)};",
                "insert into public.calendar_events (household_id, event_date, end_date, kind, name, regions, rules) values"]
        out.append(",\n".join(
            f"  (null, {q(str(e['date']))}, {q(str(e['end'])) if e.get('end') else 'null'}, {q(e['kind'])}, {q(e['name'])}, "
            f"{arr(e.get('regions'))}, {j(calendar_rules(e))})" for e in calendar
        ) + ";")

    out += ["", "commit;", ""]
    return "\n".join(out)


def calendar_rules(e: dict) -> dict:
    """What the app and suggest-meals read: food rules plus display names."""
    r = {k: e["rules"][k] for k in ("avoid", "prefer", "note") if e["rules"].get(k)}
    if e.get("names"):
        r["names"] = {"en": e["name"], **e["names"]}
    return r


def render_calendar(calendar: list[dict]) -> str:
    """Calendar bundled with the app for mock mode and offline picks."""
    rows = [{"date": str(e["date"]), "end": str(e["end"]) if e.get("end") else None, "kind": e["kind"], "name": e["name"],
             "regions": e.get("regions") or [], "rules": calendar_rules(e)} for e in calendar]
    return json.dumps(rows, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"


def render_catalog(catalog: dict[str, dict]) -> str:
    """Compact catalog for the app: offline parsing, display names and storage tips (KIT-036)."""
    rows = []
    for name, ing in catalog.items():
        row = {"name": name, "hi": ing["hi"], "latn": ing["latn"], "category": ing["category"],
               "location": ing["location"], "unit": ing.get("unit", "g"), "life": ing["life"]}
        if ing.get("aliases"):
            row["aliases"] = ing["aliases"]
        if ing.get("staple"):
            row["staple"] = True
        if ing.get("measures"):
            row["measures"] = ing["measures"]
        if ing.get("flags"):
            row["flags"] = ing["flags"]
        if ing.get("allergens"):
            row["allergens"] = ing["allergens"]
        rows.append(row)
    return json.dumps(rows, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"


def render_recipes(recipes: list[dict]) -> str:
    """Recipes bundled with the app: mock mode, offline ranking and recipe detail. Drafts carry review_status."""
    return json.dumps(recipes, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"


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
        calendar = load_calendar(v, catalog)
    except ContentError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    if v.errors:
        for e in v.errors:
            print(f"error: {e}", file=sys.stderr)
        print(f"{len(v.errors)} content error(s)", file=sys.stderr)
        return 1

    sql = render(catalog, techniques, flags, recipes, calendar)
    approved = sum(r["review_status"] == "approved" for r in recipes)
    summary = (f"{len(catalog)} ingredients, {len(techniques)} techniques, {len(flags)} flags, "
               f"{len(recipes)} recipes ({approved} approved), {len(calendar)} calendar events")
    catalog_json = render_catalog(catalog)
    recipes_json = render_recipes(recipes)
    calendar_json = render_calendar(calendar)
    if a.check:
        for path, text in ((OUT, sql), (CATALOG_OUT, catalog_json), (RECIPES_OUT, recipes_json), (CALENDAR_OUT, calendar_json)):
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                print(f"stale: {path.relative_to(ROOT)} (run python3 tools/content/build.py)", file=sys.stderr)
                return 1
        print(f"content OK: {summary}")
        return 0
    OUT.write_text(sql, encoding="utf-8")
    CATALOG_OUT.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_OUT.write_text(catalog_json, encoding="utf-8")
    RECIPES_OUT.write_text(recipes_json, encoding="utf-8")
    CALENDAR_OUT.write_text(calendar_json, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} and the app's catalog, recipes and calendar JSON: {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
