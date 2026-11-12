// Pure helpers for invent-dish (KIT-056). Tested with `deno test`.
import catalogJson from "../_shared/catalog.json" with { type: "json" };
import type { CatalogEntry, InventItem } from "../_shared/invent.ts";
import type { Diet, FlavorKey } from "../_shared/ranking.ts";
import type { RecipeDoc } from "../_shared/recipes.ts";

export const CATALOG = new Map((catalogJson as CatalogEntry[]).map((c) => [c.name, c]));
const ROLES: FlavorKey[] = ["rich", "heat", "acid", "crunch", "starch", "sweet"];

/** The diet the whole table can eat: the strictest one among the people who eat here. */
export function tableDiet(diets: (Diet | null)[]): Diet {
  const d = new Set(diets.map((x) => x ?? "veg"));
  if (d.has("jain")) return "jain";
  if (d.has("vegan")) return "vegan";
  if (d.has("veg")) return "veg";
  if (d.has("eggetarian")) return "eggetarian";
  return "nonveg";
}

export type ItemRow = {
  id: string;
  custom_name: string | null;
  state: string;
  flavor_roles: string[] | null;
  confidence: number;
  expiry_date: string | null;
  ingredients: { canonical_name: string } | null;
};

export function inventItems(rows: ItemRow[], today: string): InventItem[] {
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  return rows
    .map((r) => ({
      itemId: r.id,
      key: (r.ingredients?.canonical_name ?? r.custom_name ?? "").trim().toLowerCase(),
      state: r.state,
      roles: (r.flavor_roles ?? []).filter((x): x is FlavorKey => (ROLES as string[]).includes(x)),
      confidence: Number(r.confidence),
      daysLeft: r.expiry_date ? Math.round((day(r.expiry_date) - day(today)) / 86_400_000) : null,
    }))
    .filter((i) => i.key);
}

export type ModelDish = {
  title: string;
  title_hi: string;
  title_hinglish: string;
  description: string;
  servings: number;
  prep_min: number;
  cook_min: number;
  spice_level: number;
  ingredients: { ingredient: string; qty: number; unit: string; local?: string | null }[];
  steps: { text: string; minutes?: number | null; cue?: string | null; safety?: string | null }[];
};

const UNITS = new Set(["g", "ml", "piece", "bunch", "packet"]);

/** The model's dish as a recipe document, labelled a new creation. */
export function docFromModel(d: ModelDish, diet: Diet): RecipeDoc {
  return {
    slug: "new-creation",
    title: d.title.trim(),
    titles: { en: d.title.trim(), hi: d.title_hi.trim() || undefined, "hi-Latn": d.title_hinglish.trim() || undefined },
    description: d.description.trim().slice(0, 300),
    course: "main",
    diet,
    base_servings: Math.max(1, Math.min(8, Math.round(d.servings) || 2)),
    prep_time_min: Math.max(0, Math.round(d.prep_min) || 0),
    cook_time_min: Math.max(0, Math.round(d.cook_min) || 0),
    difficulty: 2,
    spice_level: Math.max(1, Math.min(5, Math.round(d.spice_level) || 2)),
    tags: ["new_creation"],
    review_status: "draft",
    ingredients: d.ingredients.map((i) => ({
      ingredient: i.ingredient.trim().toLowerCase(),
      qty: Number(i.qty),
      unit: UNITS.has(i.unit) ? i.unit : "g",
      local: i.local ?? undefined,
      role: "base",
    })),
    steps: d.steps.map((s) => ({
      text: s.text.trim(),
      minutes: s.minutes && s.minutes > 0 ? Math.round(s.minutes) : undefined,
      timer: !!(s.minutes && s.minutes >= 3),
      cue: s.cue?.trim() || undefined,
      safety: s.safety?.trim() || undefined,
    })),
  };
}
