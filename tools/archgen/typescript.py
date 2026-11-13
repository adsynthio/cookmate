"""Render TypeScript database types (Supabase `Database` shape) from the schema."""

from __future__ import annotations

import re

from schema import Column, Table

_SCALAR = {
    "uuid": "string",
    "text": "string",
    "date": "string",
    "timestamptz": "string",
    "boolean": "boolean",
    "smallint": "number",
    "integer": "number",
    "bigint": "number",
    "numeric": "number",
    "jsonb": "Json",
}


def _enum_values(check: str, column: str) -> list[str] | None:
    m = re.fullmatch(rf"\s*{re.escape(column)}\s+in\s*\((.*)\)\s*", check)
    if not m:
        return None
    return re.findall(r"'([^']*)'", m.group(1))


def ts_type(c: Column) -> str:
    t = c.type
    if t.startswith("numeric"):
        base = "number"
    elif t.startswith("vector("):
        base = "string"
    elif t.endswith("[]"):
        base = _SCALAR[t[:-2]] + "[]"
    else:
        base = _SCALAR[t]
    if c.check and base == "string":
        values = _enum_values(c.check, c.name)
        if values:
            base = " | ".join(f'"{v}"' for v in values)
    return f"{base} | null" if c.nullable else base


# Hand-written RPCs (supabase/migrations/*_functions.sql, *_pantry.sql). Keep in step with the SQL signatures.
FUNCTIONS: dict[str, tuple[str, str]] = {
    "create_household": ("{ p_name: string; p_language: string; p_members: Json }", "Json"),
    "match_ingredient": ("{ p_name: string }", "string | null"),
    "add_inventory_items": ("{ p_household: string; p_items: Json; p_added_via?: string }", "string[]"),
    "update_inventory_item": ("{ p_item: string; p_changes: Json }", "undefined"),
    "finish_inventory_item": ("{ p_item: string; p_discarded?: boolean }", "undefined"),
    "reopen_inventory_item": ("{ p_item: string }", "undefined"),
    "get_use_soon": (
        "{ p_household: string; p_days?: number }",
        "{ id: string; name: string; quantity: number | null; unit: string | null; location_kind: string; "
        "expiry_date: string; days_left: number; confidence: number }[]",
    ),
    "add_to_shopping_list": ("{ p_household: string; p_items: Json }", "string[]"),
    "guess_pantry_from_recipe": ("{ p_household: string; p_recipe: string }", "string[]"),
    "clear_pantry_guesses": ("{ p_household: string; p_items?: string[] }", "number"),
    "start_cooking_session": (
        "{ p_household: string; p_recipe: string; p_servings?: number; p_who_eating?: string[]; p_mode?: string; "
        "p_recommendation?: string; p_language?: string }",
        "string",
    ),
    "advance_session_step": ("{ p_session: string; p_delta?: number; p_channel?: string }", "Json"),
    "complete_cooking_session": (
        "{ p_session: string }",
        "{ item_id: string; ingredient: string; quantity: number | null; unit: string | null; "
        "current_quantity: number | null; staple: boolean }[]",
    ),
    "apply_session_deduction": ("{ p_session: string; p_adjustments?: Json }", "string[]"),
    "submit_feedback": (
        "{ p_session: string; p_rating: string; p_tags?: string[]; p_comment?: string; p_make_again?: boolean }",
        "string",
    ),
    "save_memory": (
        "{ p_household: string; p_statement: string; p_member?: string; p_category?: string; p_scope?: string; "
        "p_source?: string; p_polarity?: number; p_attributes?: Json; p_subject_ingredient?: string; "
        "p_subject_recipe?: string; p_provenance?: Json; p_expires_at?: string }",
        "string",
    ),
    "forget_memory": ("{ p_memory: string }", "undefined"),
    "keep_memory": ("{ p_memory: string }", "undefined"),
    "update_memory": ("{ p_memory: string; p_statement: string }", "undefined"),
    "mark_list_items_bought": ("{ p_household: string; p_item_ids?: string[]; p_add_to_pantry?: boolean }", "string[]"),
    "remove_list_item": ("{ p_item: string }", "undefined"),
    "log_session_change": ("{ p_session: string; p_change: string; p_notes?: Json; p_channel?: string }", "Json"),
    "get_voice_context": ("{ p_household: string; p_member?: string; p_session?: string }", "Json"),
    "search_recipes": (
        "{ p_query: string; p_limit?: number }",
        "{ id: string; slug: string | null; title: string; titles: Json; course: string; diet: string; "
        "prep_time_min: number | null; cook_time_min: number | null; spice_level: number; tags: string[] | null; "
        "score: number }[]",
    ),
    "pantry_check_today": ("{ p_household: string; p_item?: string | null }", "string | null"),
    "get_notification_settings": ("{ p_household: string }", "Json"),
    "set_notification_settings": ("{ p_household: string; p_settings: Json; p_policy_version?: string }", "Json"),
    "restock_due": ("{ p_household: string; p_days?: number }", "{ ingredient_id: string; name: string; every_days: number; last_bought: string; due_in_days: number }[]"),
    "weekly_plate": ("{ p_household: string; p_weeks?: number }", "{ week_start: string; meals: number; food_groups: Json }[]"),
    "week_recap": ("{ p_household: string }", "Json"),
    "community_circles": ("{ p_household: string }", "{ id: string; name: string; role: string; members: Json }[]"),
    "community_create_circle": ("{ p_household: string; p_name: string; p_display_name: string }", "string"),
    "community_create_invite": ("{ p_circle: string; p_household: string }", "string"),
    "community_join": ("{ p_code: string; p_household: string; p_display_name: string }", "string"),
    "community_leave": ("{ p_circle: string; p_household: string }", "undefined"),
    "community_share": (
        "{ p_circle: string; p_household: string; p_recipe_id: string | null; p_recipe_slug: string | null; "
        "p_dish_title: string; p_note: string | null; p_changes: string[] }",
        "string",
    ),
    "community_remove_post": ("{ p_post: string; p_household: string }", "undefined"),
    "community_report": ("{ p_post: string; p_household: string; p_reason: string }", "undefined"),
    "community_feed": (
        "{ p_household: string; p_circle?: string | null; p_limit?: number }",
        "{ id: string; circle_id: string; circle_name: string; author_name: string; recipe_id: string | null; "
        "recipe_slug: string | null; dish_title: string; note: string | null; changes: string[] | null; "
        "created_at: string; mine: boolean; can_remove: boolean }[]",
    ),
}


def _function_types() -> list[str]:
    lines = []
    for name, (args, returns) in FUNCTIONS.items():
        lines += [f"      {name}: {{", f"        Args: {args};", f"        Returns: {returns};", "      };"]
    return lines


def render_ts(tables: list[Table], source_note: str) -> str:
    lines: list[str] = [
        f"// GENERATED by tools/archgen from {source_note}. Do not edit by hand.",
        "// Regenerate with: python3 tools/archgen/build.py",
        "",
        "export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];",
        "",
        "export type Database = {",
        "  public: {",
        "    Tables: {",
    ]
    for t in sorted(tables, key=lambda x: x.name):
        lines.append(f"      {t.name}: {{")
        for section in ("Row", "Insert", "Update"):
            lines.append(f"        {section}: {{")
            for c in t.columns:
                typ = ts_type(c)
                if section == "Row":
                    opt = ""
                elif section == "Insert":
                    if c.is_identity:
                        continue
                    opt = "?" if (c.nullable or c.default) else ""
                else:
                    if c.is_identity:
                        continue
                    opt = "?"
                if section == "Row" and c.description:
                    lines.append(f"          /** {c.description.replace('*/', '* /')} */")
                lines.append(f"          {c.name}{opt}: {typ};")
            lines.append("        };")
        rels = []
        for c in t.columns:
            if not c.foreign_key or c.foreign_key.startswith("auth."):
                continue
            target, col = c.foreign_key.rsplit(".", 1)
            one_to_one = "true" if (c.primary_key or c.unique) else "false"
            rels.append(
                "          {\n"
                f'            foreignKeyName: "{t.name}_{c.name}_fkey";\n'
                f'            columns: ["{c.name}"];\n'
                f"            isOneToOne: {one_to_one};\n"
                f'            referencedRelation: "{target}";\n'
                f'            referencedColumns: ["{col}"];\n'
                "          },"
            )
        if rels:
            lines.append("        Relationships: [")
            lines.extend(rels)
            lines.append("        ];")
        else:
            lines.append("        Relationships: [];")
        lines.append("      };")
    lines += [
        "    };",
        "    Views: { [_ in never]: never };",
        "    Functions: {",
        *_function_types(),
        "    };",
        "    Enums: { [_ in never]: never };",
        "    CompositeTypes: { [_ in never]: never };",
        "  };",
        "};",
        "",
        "type PublicTables = Database[\"public\"][\"Tables\"];",
        "export type TableName = keyof PublicTables;",
        "export type Row<T extends TableName> = PublicTables[T][\"Row\"];",
        "export type Insert<T extends TableName> = PublicTables[T][\"Insert\"];",
        "export type Update<T extends TableName> = PublicTables[T][\"Update\"];",
        "",
    ]
    return "\n".join(lines)
