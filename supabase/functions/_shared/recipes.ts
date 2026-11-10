// GENERATED from apps/mobile/src/domain/recipes.ts by scripts/sync-shared.py. Do not edit; edit the source and re-run.
// Curated recipe documents (content/recipes/*.yaml, bundled as src/data/recipes.json) and pure helpers on them:
// ranking input, servings scaling, local measures, family-plate branches and multilingual search (REC-08).
// Pure TypeScript, imports types only, so it is shared with the Edge Functions by scripts/sync-shared.py.
import type { AgeGroup, Course, Diet, FlavorKey, Locale, RankRecipe } from "./ranking.ts";

export type RecipeIngredientDoc = {
  ingredient: string;
  qty: number;
  unit: string;
  local?: string;
  role: string;
  optional?: boolean;
  group?: string;
  substitutes?: { ingredient: string; ratio: number; note?: string }[];
};

export type RecipeStepDoc = {
  text: string;
  technique?: string;
  minutes?: number;
  seconds?: number;
  timer?: boolean;
  whistles?: number;
  cue?: string;
  safety?: string;
  branch?: { age_group: AgeGroup; action: string };
};

export type VariationRuleDoc = {
  type: string;
  condition?: Record<string, unknown>;
  action: Record<string, unknown>;
  note?: string;
};

export type RecipeDoc = {
  /** Database id when it came from the backend; the slug for bundled recipes. */
  id?: string;
  slug: string;
  title: string;
  titles?: { hi?: string; "hi-Latn"?: string; en?: string };
  description: string;
  cuisine_region?: string;
  course: Course;
  diet: Diet;
  base_servings: number;
  prep_time_min?: number;
  cook_time_min?: number;
  difficulty: number;
  spice_level: number;
  equipment?: string[];
  tags?: string[];
  flavor_profile?: Partial<Record<FlavorKey, number>>;
  food_groups?: string[];
  review_status: "draft" | "in_review" | "approved";
  ingredients: RecipeIngredientDoc[];
  steps: RecipeStepDoc[];
  variation_rules?: VariationRuleDoc[];
};

export function totalTime(doc: Pick<RecipeDoc, "prep_time_min" | "cook_time_min">): number {
  return (doc.prep_time_min ?? 0) + (doc.cook_time_min ?? 0);
}

export function recipeTitle(doc: Pick<RecipeDoc, "title" | "titles">, locale: Locale): string {
  if (locale === "hi") return doc.titles?.hi ?? doc.title;
  if (locale === "hinglish") return doc.titles?.["hi-Latn"] ?? doc.title;
  return doc.titles?.en ?? doc.title;
}

export function toRankRecipe(doc: RecipeDoc): RankRecipe {
  const fallbacks = (doc.variation_rules ?? [])
    .filter((r) => r.type === "equipment")
    .map((r) => r.condition?.missing_equipment)
    .filter((e): e is string => typeof e === "string");
  return {
    id: doc.id ?? doc.slug,
    slug: doc.slug,
    title: doc.title,
    course: doc.course,
    diet: doc.diet,
    timeMin: totalTime(doc),
    spiceLevel: doc.spice_level,
    equipment: doc.equipment ?? [],
    tags: doc.tags ?? [],
    flavor: doc.flavor_profile ?? {},
    ingredients: doc.ingredients.map((i) => ({
      key: i.ingredient,
      optional: !!i.optional,
      role: i.role,
      substitutes: (i.substitutes ?? []).map((s) => s.ingredient),
    })),
    equipmentFallbacks: fallbacks,
  };
}

// --- servings and measures ----------------------------------------------------------------------------------------

/** Quantity for the number of people eating, rounded the way a cook would measure it. */
export function scaleQty(qty: number, baseServings: number, servings: number): number {
  const x = (qty * servings) / baseServings;
  if (x >= 100) return Math.round(x / 5) * 5;
  if (x >= 10) return Math.round(x);
  if (x >= 1) return Math.round(x * 4) / 4;
  return Math.round(x * 100) / 100;
}

export type Measures = Record<string, number>;

/**
 * Grams or ml in the household's own measures where the catalog knows them (katori, piece), else metric.
 * Returns e.g. { qty: 2, unit: "katori" } or { qty: 250, unit: "g" }.
 */
export function inLocalUnits(grams: number, unit: string, measures: Measures | undefined): { qty: number; unit: string } {
  if (unit !== "g" && unit !== "ml") return { qty: grams, unit };
  for (const m of ["katori", "piece", "cup"]) {
    const per = measures?.[m];
    if (!per) continue;
    const n = grams / per;
    const quarters = Math.round(n * 4) / 4;
    if (quarters >= 0.5 && quarters <= 8 && Math.abs(quarters - n) / n < 0.15) return { qty: quarters, unit: m };
  }
  return { qty: grams, unit };
}

// --- family plates (KIT-052, HH-02) ---------------------------------------------------------------------------------

export type Branch = { step: number; ageGroup: AgeGroup; action: string; members: string[] };

/** Branch steps that apply to the people eating today, naming them ("Aarav: take out his portion..."). */
export function familyBranches(
  doc: Pick<RecipeDoc, "steps">,
  eaters: { name: string; ageGroup: AgeGroup }[],
): Branch[] {
  const out: Branch[] = [];
  doc.steps.forEach((s, i) => {
    if (!s.branch) return;
    const members = eaters.filter((e) => e.ageGroup === s.branch!.age_group).map((e) => e.name);
    if (members.length) out.push({ step: i + 1, ageGroup: s.branch.age_group, action: s.branch.action, members });
  });
  return out;
}

// --- search (REC-08: "rajma", "राजमा" and "kidney bean curry" find the same dish) --------------------------------

export function normaliseSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.,!?'"()\-–—/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(w: string): string {
  return w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w;
}

/** Words that say nothing about which dish ("curry", "recipe", "wali") are ignored unless they're all there is. */
const STOP = new Set(["recipe", "recipes", "dish", "how", "to", "make", "the", "a", "of", "with", "wala", "wali", "wale", "ki", "ka", "ke", "bana", "banana"]);
const SOFT = new Set(["curry", "sabzi", "sabji", "subzi", "masala", "dish"]);

export type SearchNames = (ingredientKey: string) => string[];

/** Text a recipe can be found by: titles in every script, slug, description and ingredient names and aliases. */
export function searchText(doc: RecipeDoc, names: SearchNames): { title: string; body: string } {
  const title = normaliseSearch([doc.title, doc.titles?.hi, doc.titles?.["hi-Latn"], doc.titles?.en, doc.slug.replace(/-/g, " ")].filter(Boolean).join(" "));
  const main = doc.ingredients.filter((i) => ["base", "protein", "vegetable"].includes(i.role)).flatMap((i) => [i.ingredient, ...names(i.ingredient)]);
  const body = normaliseSearch([doc.description, ...main, ...(doc.tags ?? []), doc.course].join(" "));
  return { title, body };
}

/** 0..1: share of meaningful query words found, title hits weigh double. */
export function searchScore(query: string, text: { title: string; body: string }): number {
  const words = normaliseSearch(query).split(" ").filter((w) => w && !STOP.has(w));
  const meaningful = words.filter((w) => !SOFT.has(w));
  const terms = meaningful.length ? meaningful : words;
  if (!terms.length) return 0;
  const has = (hay: string, w: string) => {
    const s = stem(w);
    return ` ${hay} `.includes(` ${w}`) || (s.length >= 3 && ` ${hay} `.includes(` ${s}`));
  };
  let score = 0;
  for (const w of terms) score += has(text.title, w) ? 1 : has(text.body, w) ? 0.75 : 0;
  return score / terms.length;
}

export function searchRecipes<T extends RecipeDoc>(docs: T[], query: string, names: SearchNames, limit = 20): T[] {
  return docs
    .map((d) => ({ d, s: searchScore(query, searchText(d, names)) }))
    .filter((x) => x.s >= 0.6)
    .sort((a, b) => b.s - a.s || a.d.title.localeCompare(b.d.title))
    .slice(0, limit)
    .map((x) => x.d);
}
