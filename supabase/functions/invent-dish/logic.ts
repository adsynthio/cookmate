// Pure helpers for invent-dish (KIT-056). Tested with `deno test`.
import catalogJson from "../_shared/catalog.json" with { type: "json" };
import type { CatalogEntry, InventItem } from "../_shared/invent.ts";
import type { Diet, FlavorKey } from "../_shared/ranking.ts";
import type { RecipeDoc } from "../_shared/recipes.ts";
import { looksLikeInstructions } from "../_shared/recipeSafety.ts";
import { avoids } from "../_shared/invent.ts";
import { type Job, jobOf, SWAPS } from "../_shared/swaps.ts";

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
  /** M3, "make it from my kitchen": what stands in for what, and the job it keeps. */
  swaps?: { instead_of: string; use: string; job: string; how: string }[] | null;
  /** How close to the usual dish, 50–100, and the honest note ("a little less crisp than the shop's"). */
  closeness?: number | null;
  closeness_note?: string | null;
};

export type KitchenSwap = { insteadOf: string; use: string; job: Job; how: string };

/**
 * M3: the model's swaps, kept only when they make sense for this kitchen: the stand-in is something the kitchen has
 * (or a staple) and is in the recipe, the original isn't, the job is one we know, and nothing is avoided.
 */
export function kitchenSwaps(d: ModelDish, doc: RecipeDoc, can: (key: string) => boolean, avoid: string[]): KitchenSwap[] {
  const used = new Set(doc.ingredients.map((i) => i.ingredient));
  const out: KitchenSwap[] = [];
  for (const x of d.swaps ?? []) {
    const insteadOf = x.instead_of.trim().toLowerCase();
    const use = x.use.trim().toLowerCase();
    const job = x.job.trim().toLowerCase() as Job;
    if (!insteadOf || !use || insteadOf === use || !JOB_NAMES.has(job)) continue;
    if (!used.has(use) || used.has(insteadOf) || !can(use) || avoids(avoid, use)) continue;
    if (out.some((o) => o.insteadOf === insteadOf) || looksLikeInstructions(x.how)) continue;
    out.push({ insteadOf, use, job, how: x.how.trim().slice(0, 200) });
  }
  return out.slice(0, 6);
}

const JOB_NAMES = new Set<string>(["rise", "bind", "sour", "rich", "sweet", "thick", "crunch", "set", "colour", "aroma", "fat", "heat", "base"]);

/** How close to the usual dish: a whole number from 50 to 100, or null when the model didn't say. */
export function closeness(d: ModelDish): number | null {
  if (typeof d.closeness !== "number" || !Number.isFinite(d.closeness)) return null;
  return Math.max(50, Math.min(100, Math.round(d.closeness / 5) * 5));
}

/** The kitchen's job swaps, as lines for the model: "baking soda → eno (rise): add it last...". */
export function jobSwapsPrompt(can: (key: string) => boolean): string {
  return SWAPS.filter((x) => can(x.to) && jobOf(x)).map((x) => `${x.from} → ${x.to} (${jobOf(x)}): ${x.how}`).join("; ");
}

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

// --- "Make Aloo Methi": a dish the cook named (from Home's search or Cookmate's new-dish idea) ------------------

export const MAX_DISH_CHARS = 60;
export const MAX_TO_BUY = 3;

/** A dish name worth asking for: letters, spaces and a few marks, in any script. */
export function cleanDishName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > MAX_DISH_CHARS || !/^[\p{L}\p{M} '&()-]+$/u.test(name)) return null;
  if (looksLikeInstructions(name)) return null; // G3: a dish name, not instructions for the model
  return name;
}

/**
 * Things a named dish needs that the kitchen doesn't have (not staples, not optional). A named dish may need a few
 * (they go on the list); more than MAX_TO_BUY means it isn't a dish for this kitchen tonight.
 */
export function toBuyFor(doc: RecipeDoc, have: Set<string>): string[] {
  return [...new Set(doc.ingredients
    .filter((i) => !i.optional && !have.has(i.ingredient) && !CATALOG.get(i.ingredient)?.staple)
    .map((i) => i.ingredient))];
}

/** The plan a named dish is judged against: no odds and ends to use up, but any cooked food it uses gets reheated. */
export function namedPlan(doc: RecipeDoc, items: InventItem[]) {
  const used = new Set(doc.ingredients.map((i) => i.ingredient));
  const cooked = items.filter((i) => (i.state === "cooked" || i.state === "leftover") && used.has(i.key)).map((i) => i.key);
  return { use: [], roles: [], gaps: [], cooked };
}
