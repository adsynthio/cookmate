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
  /** What the cook should notice, one sentence per sense; `avoid` is the warning. */
  cues?: StepCues;
  heat?: Heat;
  safety?: string;
  branch?: { age_group: AgeGroup; action: string };
  /** The step in Hindi and Hinglish: text, cues, safety and the family note. */
  say?: Partial<Record<"hi" | "hi-Latn", StepSay>>;
};

export type StepSay = Partial<Record<"text" | "look" | "sound" | "smell" | "touch" | "taste" | "avoid" | "safety" | "branch", string>>;

export const SENSES = ["look", "sound", "smell", "touch", "taste"] as const;
export type Sense = (typeof SENSES)[number];
export type StepCues = Partial<Record<Sense | "avoid", string>>;
export type Heat = "low" | "medium" | "high";

export type VariationRuleDoc = {
  type: string;
  condition?: Record<string, unknown>;
  action: Record<string, unknown>;
  note?: string;
};

export type RecipeDoc = {
  /** Database id when it came from the backend; the slug for bundled recipes. */
  id?: string;
  /** For a household's adapted variant: the recipe it was adapted from (KIT-051). */
  parent_id?: string;
  slug: string;
  title: string;
  titles?: { hi?: string; "hi-Latn"?: string; en?: string };
  description: string;
  descriptions?: { hi?: string; "hi-Latn"?: string };
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

export function recipeDescription(doc: Pick<RecipeDoc, "description" | "descriptions">, locale: Locale): string {
  if (locale === "hi") return doc.descriptions?.hi ?? doc.description;
  if (locale === "hinglish") return doc.descriptions?.["hi-Latn"] ?? doc.description;
  return doc.description;
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

export type PieceSize = "small" | "big";
/** An amount as a cook says it: { qty: 2, unit: "katori" }, { qty: 1, unit: "piece", size: "big", and: { qty: 1, size: "small" } }. */
export type LocalAmount = { qty: number; unit: string; size?: PieceSize; and?: { qty: number; size?: PieceSize } };

/** Small and big against a medium piece, and the ways people actually say a count of onions or tomatoes. */
const SMALL = 0.65;
const BIG = 1.4;
const PIECE_WAYS: { n: number; out: Omit<LocalAmount, "unit"> }[] = [
  { n: 0.25, out: { qty: 0.25 } },
  { n: 0.5, out: { qty: 0.5 } },
  { n: SMALL, out: { qty: 1, size: "small" } },
  { n: 1, out: { qty: 1 } },
  { n: 2 * SMALL, out: { qty: 2, size: "small" } },
  { n: BIG, out: { qty: 1, size: "big" } },
  { n: 1.5, out: { qty: 1.5 } },
  { n: 1 + SMALL, out: { qty: 1, and: { qty: 1, size: "small" } } },
  { n: 2, out: { qty: 2 } },
  { n: BIG + SMALL, out: { qty: 1, size: "big", and: { qty: 1, size: "small" } } },
  { n: 2.5, out: { qty: 2.5 } },
  { n: 2 * BIG, out: { qty: 2, size: "big" } },
  { n: 3, out: { qty: 3 } },
];

/**
 * Grams or ml in the household's own measures where the catalog knows them. Vegetables and fruit that are counted
 * (`sized`: onion, tomato, potato, lemon) read as "1 small", "½", "1 big + 1 small"; garlic in cloves; ginger in
 * inches; other things in katori, pieces, chammach, chhota chammach or chutki; a speck of anything is a chutki.
 */
export function inLocalUnits(grams: number, unit: string, measures: Measures | undefined, sized = false): LocalAmount {
  if (unit !== "g" && unit !== "ml") return { qty: grams, unit };
  if (measures?.clove) return { qty: Math.max(1, Math.round(grams / measures.clove)), unit: "clove" };
  if (measures?.inch) return { qty: Math.max(0.5, Math.round((grams / measures.inch) * 2) / 2), unit: "inch" };
  const piece = measures?.piece;
  if (sized && piece && piece >= 40 && piece <= 300) {
    const n = grams / piece;
    if (n > 3.25) return { qty: Math.round(n * 2) / 2, unit: "piece" };
    let best = PIECE_WAYS[0]!;
    for (const way of PIECE_WAYS) if (Math.abs(Math.log(n / way.n)) < Math.abs(Math.log(n / best.n))) best = way;
    return { ...best.out, unit: "piece" };
  }
  const tries: [string, number, number, number][] = [
    // measure, smallest sensible amount, largest, how far off it may be (spoons are always roughly measured)
    ["katori", 0.5, 8, 0.2],
    ["piece", 0.5, 20, 0.2],
    ["cup", 0.5, 8, 0.2],
    ["chammach", 0.5, 8, 0.35],
    ["chhota_chammach", 0.25, 6, 0.35],
  ];
  for (const [m, lo, hi, off] of tries) {
    const per = measures?.[m];
    if (!per) continue;
    const n = grams / per;
    const quarters = Math.round(n * 4) / 4;
    if (quarters >= lo && quarters <= hi && Math.abs(quarters - n) / n < off) return { qty: quarters, unit: m };
  }
  const pinch = measures?.chutki;
  if (pinch) {
    const n = Math.round(grams / pinch);
    if (n >= 1 && n <= 4) return { qty: n, unit: "chutki" };
  }
  // Nobody weighs out 0.08 g of soda.
  if (unit === "g" && grams < 1) return { qty: 1, unit: "chutki" };
  return { qty: grams, unit };
}

const FRACTIONS: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };

/** 1.5 -> "1½", 0.25 -> "¼"; other numbers as they are. */
export function prettyQty(n: number): string {
  const whole = Math.floor(n);
  const frac = FRACTIONS[String(Math.round((n - whole) * 100) / 100)];
  if (frac) return whole ? `${whole}${frac}` : frac;
  return String(Math.round(n * 100) / 100);
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

/** List-row view of a recipe (search results, saved recipes). */
export function toSummary(doc: RecipeDoc) {
  return {
    id: doc.id ?? doc.slug,
    slug: doc.slug,
    title: doc.title,
    titles: doc.titles,
    course: doc.course,
    diet: doc.diet,
    totalTimeMin: totalTime(doc) || null,
    spiceLevel: doc.spice_level,
    tags: doc.tags ?? [],
  };
}

export function searchRecipes<T extends RecipeDoc>(docs: T[], query: string, names: SearchNames, limit = 20): T[] {
  return docs
    .map((d) => ({ d, s: searchScore(query, searchText(d, names)) }))
    .filter((x) => x.s >= 0.6)
    .sort((a, b) => b.s - a.s || a.d.title.localeCompare(b.d.title))
    .slice(0, limit)
    .map((x) => x.d);
}

// --- database rows -> documents (live mode and the Edge Functions) -------------------------------------------------

export type RecipeRow = {
  id: string;
  parent_recipe_id?: string | null;
  slug: string | null;
  title: string;
  titles: RecipeDoc["titles"] | null;
  description: string | null;
  descriptions?: { hi?: string; "hi-Latn"?: string } | null;
  cuisine_region: string | null;
  course: Course;
  diet: Diet;
  base_servings: number;
  prep_time_min: number | null;
  cook_time_min: number | null;
  difficulty: number;
  spice_level: number;
  equipment: string[] | null;
  tags: string[] | null;
  flavor_profile: RecipeDoc["flavor_profile"] | null;
  food_groups: string[] | null;
  review_status: RecipeDoc["review_status"];
  recipe_ingredients?: {
    display_name: string;
    quantity: number | null;
    unit: string | null;
    local_measure: string | null;
    is_optional: boolean;
    group_name: string | null;
    role: string | null;
    substitutes: { ingredient?: string; ratio?: number; note?: string | null }[] | null;
    sort_order: number | null;
    ingredients: { canonical_name: string } | null;
  }[];
  recipe_steps?: {
    step_no: number;
    instruction: string;
    instructions?: Record<string, unknown> | null;
    duration_sec: number | null;
    timer_required: boolean;
    whistles: number | null;
    sensory_cue: string | null;
    sensory_cues?: Record<string, unknown> | null;
    member_branch: { age_group: AgeGroup; action: string } | null;
    safety_note: string | null;
    techniques: { slug: string } | null;
  }[];
  recipe_variation_rules?: { rule_type: string; condition: Record<string, unknown> | null; action: Record<string, unknown>; note: string | null }[];
};

/** PostgREST select for a full recipe (used by the app and the Edge Functions). */
export const RECIPE_SELECT =
  "id, parent_recipe_id, slug, title, titles, description, descriptions, cuisine_region, course, diet, base_servings, prep_time_min, " +
  "cook_time_min, difficulty, spice_level, equipment, tags, flavor_profile, food_groups, review_status, " +
  "recipe_ingredients(display_name, quantity, unit, local_measure, is_optional, group_name, role, substitutes, sort_order, ingredients(canonical_name)), " +
  "recipe_steps(step_no, instruction, instructions, duration_sec, timer_required, whistles, sensory_cue, sensory_cues, member_branch, safety_note, techniques(slug)), " +
  "recipe_variation_rules(rule_type, condition, action, note)";

/** The `sensory_cues` jsonb column: `{en, look, sound, smell, touch, taste, avoid, heat}`; anything else is ignored. */
export function stepCuesFromJson(raw: unknown): { cues?: StepCues; heat?: Heat } {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const cues: StepCues = {};
  for (const k of [...SENSES, "avoid"] as const) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) cues[k] = v.trim();
  }
  const heat = r.heat === "low" || r.heat === "medium" || r.heat === "high" ? r.heat : undefined;
  return { ...(Object.keys(cues).length ? { cues } : {}), ...(heat ? { heat } : {}) };
}

const SAY_KEYS = ["text", ...SENSES, "avoid", "safety", "branch"] as const;

/** `recipe_steps.instructions`: `{en: "...", hi: {text, look, ...}, "hi-Latn": {...}}`; anything else is ignored. */
export function stepSayFromJson(raw: unknown): RecipeStepDoc["say"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: NonNullable<RecipeStepDoc["say"]> = {};
  for (const lang of ["hi", "hi-Latn"] as const) {
    const tr = (raw as Record<string, unknown>)[lang];
    if (!tr || typeof tr !== "object") continue;
    const clean: StepSay = {};
    for (const k of SAY_KEYS) {
      const v = (tr as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) clean[k] = v.trim();
    }
    if (clean.text) out[lang] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}

/** A step in the cook's language: the translation where there is one, the English for anything it doesn't cover. */
export function localStep(step: RecipeStepDoc, locale: Locale): RecipeStepDoc {
  const tr = locale === "hi" ? step.say?.hi : locale === "hinglish" ? step.say?.["hi-Latn"] : undefined;
  if (!tr?.text) return step;
  const cues: StepCues = {};
  for (const k of [...SENSES, "avoid"] as const) {
    const v = step.cues?.[k] ? (tr[k] ?? step.cues[k]) : undefined;
    if (v) cues[k] = v;
  }
  const line = [...SENSES, "avoid"].map((k) => cues[k as keyof StepCues]).filter(Boolean).join(" ");
  return {
    ...step,
    text: tr.text,
    ...(step.cues ? { cues } : {}),
    ...(step.cue ? { cue: line || step.cue } : {}),
    ...(step.safety ? { safety: tr.safety ?? step.safety } : {}),
    ...(step.branch ? { branch: { ...step.branch, action: tr.branch ?? step.branch.action } } : {}),
  };
}

/** The whole recipe's steps in the cook's language (titles go through recipeTitle). */
export function localDoc<T extends Pick<RecipeDoc, "steps">>(doc: T, locale: Locale): T {
  return locale === "en" ? doc : { ...doc, steps: doc.steps.map((s) => localStep(s, locale)) };
}

/** The senses a step has cues for, in a fixed order, warning excluded. */
export function cueSenses(step: Pick<RecipeStepDoc, "cues">): { sense: Sense; text: string }[] {
  return SENSES.flatMap((sense) => (step.cues?.[sense] ? [{ sense, text: step.cues[sense]! }] : []));
}

export function recipeDocFromRow(row: RecipeRow): RecipeDoc {
  const ingredients = [...(row.recipe_ingredients ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((i) => {
      const out: RecipeIngredientDoc = {
        ingredient: i.ingredients?.canonical_name ?? i.display_name,
        qty: Number(i.quantity ?? 0),
        unit: i.unit ?? "g",
        role: i.role ?? "base",
      };
      if (i.local_measure) out.local = i.local_measure;
      if (i.is_optional) out.optional = true;
      if (i.group_name) out.group = i.group_name;
      const subs = (i.substitutes ?? []).filter((s) => s.ingredient);
      if (subs.length) out.substitutes = subs.map((s) => ({ ingredient: s.ingredient!, ratio: s.ratio ?? 1, ...(s.note ? { note: s.note } : {}) }));
      return out;
    });
  const steps = [...(row.recipe_steps ?? [])]
    .sort((a, b) => a.step_no - b.step_no)
    .map((s) => {
      const out: RecipeStepDoc = { text: s.instruction };
      if (s.techniques?.slug) out.technique = s.techniques.slug;
      if (s.duration_sec) {
        if (s.duration_sec % 60 === 0) out.minutes = s.duration_sec / 60;
        else out.seconds = s.duration_sec;
      }
      if (s.timer_required) out.timer = true;
      if (s.whistles) out.whistles = s.whistles;
      if (s.sensory_cue) out.cue = s.sensory_cue;
      const cues = stepCuesFromJson(s.sensory_cues);
      if (cues.cues) out.cues = cues.cues;
      if (cues.heat) out.heat = cues.heat;
      if (s.safety_note) out.safety = s.safety_note;
      if (s.member_branch?.age_group && s.member_branch.action) out.branch = s.member_branch;
      const say = stepSayFromJson(s.instructions);
      if (say) out.say = say;
      return out;
    });
  return {
    id: row.id,
    ...(row.parent_recipe_id ? { parent_id: row.parent_recipe_id } : {}),
    slug: row.slug ?? row.id,
    title: row.title,
    titles: row.titles ?? undefined,
    description: row.description ?? "",
    ...(row.descriptions && (row.descriptions.hi || row.descriptions["hi-Latn"]) ? { descriptions: row.descriptions } : {}),
    cuisine_region: row.cuisine_region ?? undefined,
    course: row.course,
    diet: row.diet,
    base_servings: row.base_servings,
    prep_time_min: row.prep_time_min ?? undefined,
    cook_time_min: row.cook_time_min ?? undefined,
    difficulty: row.difficulty,
    spice_level: row.spice_level,
    equipment: row.equipment ?? [],
    tags: row.tags ?? [],
    flavor_profile: row.flavor_profile ?? {},
    food_groups: row.food_groups ?? [],
    review_status: row.review_status,
    ingredients,
    steps,
    variation_rules: (row.recipe_variation_rules ?? []).map((r) => ({
      type: r.rule_type,
      ...(r.condition ? { condition: r.condition } : {}),
      action: r.action,
      ...(r.note ? { note: r.note } : {}),
    })),
  };
}

// --- why this works (KIT-053, REC-05) ---------------------------------------------------------------------------

const FLAVOR_WORDS: Record<FlavorKey, Record<Locale, string>> = {
  rich: { en: "rich", hinglish: "rich", hi: "भरपूर" },
  heat: { en: "warm with chilli", hinglish: "mirch ki garmi", hi: "मिर्च की गर्माहट" },
  acid: { en: "a sour edge", hinglish: "khatta touch", hi: "हल्की खटास" },
  crunch: { en: "crunch", hinglish: "crunch", hi: "कुरकुरापन" },
  starch: { en: "filling", hinglish: "pet bharne wala", hi: "पेट भरने वाला" },
  sweet: { en: "a little sweetness", hinglish: "thodi mithaas", hi: "थोड़ी मिठास" },
};
const WHY: Record<Locale, string> = {
  en: "Mostly {a}, with {b} to balance it.",
  hinglish: "Zyada {a}, aur balance ke liye {b}.",
  hi: "ज़्यादातर {a}, और संतुलन के लिए {b}।",
};
const WHY_ONE: Record<Locale, string> = { en: "Mostly {a}.", hinglish: "Zyada {a}.", hi: "ज़्यादातर {a}।" };

/** Flavour bars for rich, heat, crunch and acid, and one sentence on how they balance. */
export function whyThisWorks(
  flavor: Partial<Record<FlavorKey, number>> | undefined,
  locale: Locale,
): { bars: { key: FlavorKey; value: number }[]; sentence: string } | null {
  const f = flavor ?? {};
  const bars = (["rich", "heat", "crunch", "acid"] as FlavorKey[]).map((key) => ({ key, value: Math.max(0, Math.min(1, f[key] ?? 0)) }));
  const ranked = (Object.keys(FLAVOR_WORDS) as FlavorKey[])
    .map((k) => ({ k, v: f[k] ?? 0 }))
    .filter((x) => x.v >= 0.3)
    .sort((a, b) => b.v - a.v);
  if (!ranked.length) return null;
  const a = FLAVOR_WORDS[ranked[0]!.k][locale];
  // The balancing note: the strongest flavour from a different family than the main one.
  const contrast = ranked.slice(1).find((x) => !(ranked[0]!.k === "rich" && x.k === "starch") && !(ranked[0]!.k === "starch" && x.k === "rich"));
  const sentence = contrast
    ? WHY[locale].replace("{a}", a).replace("{b}", FLAVOR_WORDS[contrast.k][locale])
    : WHY_ONE[locale].replace("{a}", a);
  return { bars, sentence };
}
