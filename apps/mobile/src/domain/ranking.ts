// Deterministic ranking for "Tonight, decided" (KIT-040/041, HOME-02). The model never ranks: it only rewords the
// reason. Every pick can be explained from its score breakdown.
// Pure TypeScript with no imports: the same file runs in the app (mock mode, offline), in node tests and in the
// suggest-meals Edge Function (supabase/functions/_shared/ranking.ts is a generated copy; edit this file).

export type Diet = "veg" | "eggetarian" | "nonveg" | "jain" | "vegan";
export type Course = "breakfast" | "main" | "side" | "snack" | "dessert" | "drink" | "tiffin" | "chutney_pickle" | "component";
export type MealSlot = "breakfast" | "lunch" | "tiffin" | "dinner" | "snack";
export type AgeGroup = "child" | "teen" | "adult" | "elder";
export type FlavorKey = "rich" | "heat" | "acid" | "crunch" | "starch" | "sweet";
export type Locale = "hi" | "hinglish" | "en";

export type RankIngredient = { key: string; optional: boolean; role: string; substitutes: string[] };

export type RankRecipe = {
  id: string;
  slug: string;
  title: string;
  course: Course;
  diet: Diet;
  timeMin: number;
  spiceLevel: number;
  equipment: string[];
  tags: string[];
  flavor: Partial<Record<FlavorKey, number>>;
  ingredients: RankIngredient[];
  /** Equipment a variation rule can do without, e.g. no pressure cooker -> boil. */
  equipmentFallbacks: string[];
};

export type PantryEntry = {
  itemId: string;
  key: string;
  confidence: number;
  daysLeft: number | null;
  /** Staple marked Out. */
  out: boolean;
};

export type Eater = { id: string; name: string; ageGroup: AgeGroup; diet: Diet; spice: number };

export type Craving = {
  tags: string[];
  maxTimeMin: number | null;
  spiceDelta: number;
  course: Course | null;
  /** Ingredients named in the craving ("kuch paneer wala"). */
  ingredients: string[];
};

export const NO_CRAVING: Craving = { tags: [], maxTimeMin: null, spiceDelta: 0, course: null, ingredients: [] };

export type Weights = {
  coverage: number;
  useSoon: number;
  taste: number;
  novelty: number;
  time: number;
  equipment: number;
  calendar: number;
  craving: number;
  slot: number;
};

/** Defaults; production values live in feature_flags.ranking_weights.rules.weights for tuning without a release. */
export const DEFAULT_WEIGHTS: Weights = {
  coverage: 3,
  useSoon: 2,
  taste: 1.5,
  novelty: 1.5,
  time: 1,
  equipment: 1,
  calendar: 0.5,
  craving: 2.5,
  slot: 1.5,
};

export type RankContext = {
  slot: MealSlot;
  eaters: Eater[];
  pantry: PantryEntry[];
  /** Catalog keys that most kitchens keep (salt, oil, haldi...). Counted as "probably have" unless marked Out. */
  staples: string[];
  /** Equipment the household has; null when unknown (assume a normal kitchen). */
  equipment: string[] | null;
  /** Ingredients to leave out: dislikes from memories, fasts and festivals. */
  avoid: string[];
  /** Ingredients the household likes. */
  like: string[];
  /** Calendar preferences (ingredient keys or recipe tags). */
  prefer: string[];
  /** Recipes cooked or accepted recently. */
  recent: { recipeId: string; daysAgo: number }[];
  craving: Craving;
  timeBudgetMin: number;
  weights: Weights;
  /** "Use these first" from the Use Soon strip: only recipes using at least one of these. */
  focus?: string[];
  /** Names of cooked food already in the kitchen ("Kadhi Pakora leftovers", "leftover dal"): the same dish is not
   * suggested again, since there is some ready to eat. */
  alreadyCooked?: string[];
};

export const CONFIDENT = 0.5;

// --- hard filters ----------------------------------------------------------------------------------------------

const DIET_ALLOWS: Record<Diet, Diet[]> = {
  nonveg: ["nonveg", "eggetarian", "veg", "jain", "vegan"],
  eggetarian: ["eggetarian", "veg", "jain", "vegan"],
  veg: ["veg", "jain", "vegan"],
  jain: ["jain"],
  vegan: ["vegan"],
};

export function dietAllows(eater: Diet, recipe: Diet): boolean {
  return DIET_ALLOWS[eater].includes(recipe);
}

const SLOT_COURSES: Record<MealSlot, Partial<Record<Course, number>>> = {
  breakfast: { breakfast: 1, tiffin: 0.7, snack: 0.5 },
  lunch: { main: 1, side: 0.7 },
  dinner: { main: 1, side: 0.7 },
  tiffin: { tiffin: 1, breakfast: 0.8, snack: 0.7, side: 0.5 },
  snack: { snack: 1, breakfast: 0.7, tiffin: 0.7 },
};

export type FilterReason = "course" | "diet" | "avoid" | "time" | "equipment" | "focus" | "leftover";

// --- dishes already cooked ----------------------------------------------------------------------------------------

export type DishKind = "dal" | "rajma" | "rice" | "khichdi" | "roti" | "sabzi" | "curry" | "kadhi" | "poha" | "other";

/** Most specific first: "rajma chawal" is rajma, "dal khichdi" is khichdi, "paneer sabzi" is a curry. */
const DISH_WORDS: [DishKind, RegExp][] = [
  ["khichdi", /khichd|खिचड़ी|खिचडी/i],
  ["rajma", /rajma|chole|chhole|chana masala|राजमा|छोले/i],
  ["kadhi", /kadhi|kadi\b|कढ़ी|कढी/i],
  ["poha", /poha|chilla|cheela|पोहा|चीला|चिल्ला/i],
  ["curry", /chicken|mutton|fish|egg|anda|paneer|kofta|curry|चिकन|मटन|मछली|अंडा|अंडे|पनीर|कोफ्ता/i],
  ["dal", /\bdal|daal|sambar|दाल|सांभर/i],
  ["roti", /roti|chapati|chapat|phulka|paratha|रोटी|चपाती|पराठा|फुलका/i],
  ["rice", /rice|chawal|pulao|biryani|चावल|पुलाव|बिरयानी|भात/i],
  ["sabzi", /sabzi|sabji|aloo|bhaji|bhindi|gobhi|matar|baingan|सब्ज़ी|सब्जी|आलू|भिंडी|गोभी|मटर|बैंगन/i],
];

/** The kind of dish a name is, in English, Hindi or Hinglish ("बची हुई दाल" is dal). */
export function dishKind(name: string | null | undefined): DishKind {
  const n = (name ?? "").trim();
  for (const [kind, re] of DISH_WORDS) if (re.test(n)) return kind;
  return "other";
}

/** A recipe is already cooked when the kitchen holds cooked food of the same kind (plain rice and roti go with
 * anything, so they never rule a dish out). */
export function alreadyCooked(r: Pick<RankRecipe, "slug" | "title">, cooked: readonly string[] | undefined): boolean {
  if (!cooked?.length) return false;
  const kind = dishKind(`${r.title} ${r.slug.replace(/-/g, " ")}`);
  if (kind === "other" || kind === "rice" || kind === "roti") return false;
  return cooked.some((c) => dishKind(c) === kind);
}

export function excludedBecause(r: RankRecipe, ctx: RankContext): FilterReason | null {
  const course = ctx.craving.course;
  if (course ? r.course !== course : !(r.course in SLOT_COURSES[ctx.slot])) return "course";
  if (ctx.eaters.some((e) => !dietAllows(e.diet, r.diet))) return "diet";
  const avoid = new Set(ctx.avoid);
  if (r.ingredients.some((i) => !i.optional && avoid.has(i.key))) return "avoid";
  if (ctx.craving.maxTimeMin !== null && r.timeMin > ctx.craving.maxTimeMin) return "time";
  if (equipmentFactor(r, ctx.equipment) === 0) return "equipment";
  if (ctx.focus?.length && !r.ingredients.some((i) => ctx.focus!.includes(i.key))) return "focus";
  if (alreadyCooked(r, ctx.alreadyCooked)) return "leftover";
  return null;
}

// --- pantry match ----------------------------------------------------------------------------------------------

export type MatchStatus = "have" | "substitute" | "assumed" | "missing";

export type IngredientMatch = {
  key: string;
  status: MatchStatus;
  /** Pantry entry used (for have / substitute). */
  entry?: PantryEntry;
  /** Substitute key used, or substitutes the cook could buy instead. */
  substitute?: string;
};

export type PantryMatch = {
  /** Non-optional ingredients. */
  total: number;
  /** Confidently in the pantry, plus staples nobody marked Out. */
  have: number;
  items: IngredientMatch[];
};

function usable(e: PantryEntry | undefined): boolean {
  return !!e && !e.out && e.confidence >= CONFIDENT;
}

export function pantryMatch(r: RankRecipe, pantry: PantryEntry[], staples: string[]): PantryMatch {
  const byKey = new Map<string, PantryEntry>();
  for (const e of pantry) {
    const prev = byKey.get(e.key);
    // Prefer the entry that will spoil first, so a pick uses it up.
    if (!prev || (usable(e) && (!usable(prev) || (e.daysLeft ?? 999) < (prev.daysLeft ?? 999)))) byKey.set(e.key, e);
  }
  const stapleSet = new Set(staples);
  const items: IngredientMatch[] = r.ingredients
    .filter((i) => !i.optional)
    .map((i) => {
      const e = byKey.get(i.key);
      if (e && usable(e)) return { key: i.key, status: "have", entry: e };
      const sub = i.substitutes.find((s) => usable(byKey.get(s)));
      if (sub) return { key: i.key, status: "substitute", entry: byKey.get(sub), substitute: sub };
      if (stapleSet.has(i.key) && !e?.out) return { key: i.key, status: "assumed" };
      return { key: i.key, status: "missing", substitute: i.substitutes[0] };
    });
  const have = items.filter((m) => m.status === "have" || m.status === "assumed").length;
  return { total: items.length, have, items };
}

// --- factors (each 0..1) ---------------------------------------------------------------------------------------

export type Breakdown = Record<keyof Weights, number>;

/** Share of the dish you can make now, squared: missing several things should hurt far more than missing one. */
export function coverageFactor(m: PantryMatch): number {
  if (m.total === 0) return 0;
  const points = m.items.reduce(
    (s, i) => s + (i.status === "have" ? 1 : i.status === "assumed" ? 0.9 : i.status === "substitute" ? 0.7 : 0),
    0,
  );
  return (points / m.total) ** 2;
}

/** 1 for using something that spoils today, 0.25 for three days out; summed and capped at 1. */
export function useSoonFactor(m: PantryMatch): number {
  let total = 0;
  for (const i of m.items) {
    const d = i.entry?.daysLeft;
    if (d === null || d === undefined || d > 3) continue;
    total += (4 - Math.max(0, d)) / 4;
  }
  return Math.min(1, total);
}

/** The spice the table can take: the mildest eater, nudged by the craving ("kuch teekha"). */
export function targetSpice(ctx: Pick<RankContext, "eaters" | "craving">): number {
  const base = ctx.eaters.length ? Math.min(...ctx.eaters.map((e) => e.spice)) : 3;
  return Math.max(1, Math.min(5, base + ctx.craving.spiceDelta));
}

export function tasteFactor(r: RankRecipe, ctx: Pick<RankContext, "eaters" | "craving" | "like">): number {
  const target = targetSpice(ctx);
  // Milder than wanted is easy to fix at the table; hotter than the mildest eater is not.
  const spiceFit = r.spiceLevel <= target ? 1 - (target - r.spiceLevel) * 0.1 : Math.max(0, 1 - (r.spiceLevel - target) * 0.35);
  const liked = r.ingredients.filter((i) => ctx.like.includes(i.key)).length;
  return Math.max(0, Math.min(1, spiceFit + Math.min(0.3, liked * 0.15)));
}

/** No repeat within 3 days; half marks within a week. */
export function noveltyFactor(r: RankRecipe, recent: RankContext["recent"]): number {
  const days = recent.filter((x) => x.recipeId === r.id).map((x) => x.daysAgo);
  if (!days.length) return 1;
  const last = Math.min(...days);
  return last <= 3 ? 0 : last <= 7 ? 0.5 : 1;
}

export function timeFactor(r: RankRecipe, budgetMin: number): number {
  if (r.timeMin <= budgetMin) return 1;
  return Math.max(0, 1 - (r.timeMin - budgetMin) / budgetMin);
}

/** 1 = everything needed is there (or unknown), 0.7 = a variation rule works around it, 0 = can't be cooked. */
export function equipmentFactor(r: RankRecipe, have: string[] | null): number {
  if (have === null) return 1;
  const missing = r.equipment.filter((e) => !have.includes(e));
  if (!missing.length) return 1;
  return missing.every((e) => r.equipmentFallbacks.includes(e)) ? 0.7 : 0;
}

export function calendarFactor(r: RankRecipe, prefer: string[]): number {
  if (!prefer.length) return 0;
  return r.tags.some((t) => prefer.includes(t)) || r.ingredients.some((i) => prefer.includes(i.key)) ? 1 : 0;
}

export function cravingFactor(r: RankRecipe, c: Craving): number {
  const asked = c.tags.length + c.ingredients.length;
  if (!asked) return 0;
  const tags = c.tags.filter((t) => r.tags.includes(t)).length;
  const ings = c.ingredients.filter((k) => r.ingredients.some((i) => i.key === k)).length;
  return (tags + ings) / asked;
}

export function slotFactor(r: RankRecipe, slot: MealSlot): number {
  return SLOT_COURSES[slot][r.course] ?? 0;
}

// --- ranking ---------------------------------------------------------------------------------------------------

export type Ranked = {
  recipe: RankRecipe;
  score: number;
  breakdown: Breakdown;
  match: PantryMatch;
};

export function scoreRecipe(r: RankRecipe, ctx: RankContext): Ranked {
  const match = pantryMatch(r, ctx.pantry, ctx.staples);
  const breakdown: Breakdown = {
    coverage: coverageFactor(match),
    useSoon: useSoonFactor(match),
    taste: tasteFactor(r, ctx),
    novelty: noveltyFactor(r, ctx.recent),
    time: timeFactor(r, ctx.timeBudgetMin),
    equipment: equipmentFactor(r, ctx.equipment),
    calendar: calendarFactor(r, ctx.prefer),
    craving: cravingFactor(r, ctx.craving),
    slot: slotFactor(r, ctx.slot),
  };
  const w = ctx.weights;
  const totalWeight = (Object.keys(w) as (keyof Weights)[]).reduce((s, k) => s + w[k], 0);
  const sum = (Object.keys(w) as (keyof Weights)[]).reduce((s, k) => s + w[k] * breakdown[k], 0);
  const round = (x: number) => Math.round(x * 1000) / 1000;
  for (const k of Object.keys(breakdown) as (keyof Weights)[]) breakdown[k] = round(breakdown[k]);
  return { recipe: r, score: round(totalWeight ? sum / totalWeight : 0), breakdown, match };
}

export function rankRecipes(recipes: RankRecipe[], ctx: RankContext): Ranked[] {
  let pool = recipes.filter((r) => excludedBecause(r, ctx) === null);
  // Nothing uses the items the cook wanted to use up: show ordinary picks rather than nothing.
  if (!pool.length && ctx.focus?.length) pool = recipes.filter((r) => excludedBecause(r, { ...ctx, focus: [] }) === null);
  return pool
    .map((r) => scoreRecipe(r, ctx))
    .sort((a, b) => shoppingTier(a.match) - shoppingTier(b.match) || b.score - a.score || a.recipe.slug.localeCompare(b.recipe.slug));
}

/**
 * Cook from what's in the kitchen first: dishes with nothing to buy come before dishes missing one or two things,
 * and those before dishes that need a shop. The score orders dishes within each group.
 */
export function shoppingTier(m: PantryMatch): number {
  const missing = m.items.filter((i) => i.status === "missing").length;
  return missing === 0 ? 0 : missing <= 2 ? 1 : 2;
}

function mainIngredient(r: RankRecipe): string | undefined {
  return r.ingredients.find((i) => i.role === "base" || i.role === "protein")?.key;
}

/** Hero plus alternates, avoiding three variations of the same main ingredient. */
export function choosePicks(ranked: Ranked[], n = 3): Ranked[] {
  const picks: Ranked[] = [];
  const used = new Set<string>();
  for (const r of ranked) {
    const main = mainIngredient(r.recipe);
    if (main && used.has(main)) continue;
    picks.push(r);
    if (main) used.add(main);
    if (picks.length === n) return picks;
  }
  for (const r of ranked) {
    if (picks.length === n) break;
    if (!picks.includes(r)) picks.push(r);
  }
  return picks;
}

// --- craving interpretation (keyword fallback for craving_interpret) --------------------------------------------

export const CHIP_TAGS: Record<string, Partial<Craving>> = {
  comforting: { tags: ["comforting"] },
  under_20: { tags: ["quick"], maxTimeMin: 20 },
  high_protein: { tags: ["high_protein"] },
  kids_friendly: { tags: ["kids_friendly"] },
  light: { tags: ["light"] },
};

const KEYWORDS: { words: string[]; apply: Partial<Craving> }[] = [
  { words: ["comfort", "comforting", "cozy", "warm", "ghar jaisa", "sukoon", "garam garam", "आराम", "सुकून", "घर जैसा"], apply: { tags: ["comforting"] } },
  { words: ["quick", "fast", "jaldi", "jhatpat", "jaldi se", "जल्दी", "झटपट"], apply: { tags: ["quick"], maxTimeMin: 25 } },
  { words: ["protein", "प्रोटीन"], apply: { tags: ["high_protein"] } },
  { words: ["kids", "children", "bachche", "bachchon", "bacchon", "बच्चों", "बच्चे"], apply: { tags: ["kids_friendly"] } },
  { words: ["light", "halka", "halki", "हल्का", "हल्की"], apply: { tags: ["light"] } },
  { words: ["spicy", "teekha", "tikha", "chatpata", "तीखा", "चटपटा"], apply: { spiceDelta: 1 } },
  { words: ["mild", "kam mirch", "feeka", "fika", "फीका", "कम मिर्च"], apply: { spiceDelta: -1 } },
  { words: ["breakfast", "nashta", "naashta", "नाश्ता"], apply: { course: "breakfast" } },
  { words: ["snack", "evening snack", "chai ke saath"], apply: { course: "snack" } },
];

function normaliseText(s: string): string {
  return ` ${s.toLowerCase().replace(/[.,!?'"()]/g, " ").replace(/\s+/g, " ").trim()} `;
}

/** Chips plus free text in Hindi, Hinglish or English -> filters. `findIngredients` maps text to catalog keys. */
export function interpretCraving(
  text: string,
  chips: string[] = [],
  findIngredients: (text: string) => string[] = () => [],
): Craving {
  const out: Craving = { tags: [], maxTimeMin: null, spiceDelta: 0, course: null, ingredients: [] };
  const apply = (p: Partial<Craving>) => {
    for (const t of p.tags ?? []) if (!out.tags.includes(t)) out.tags.push(t);
    if (p.maxTimeMin !== undefined && p.maxTimeMin !== null)
      out.maxTimeMin = out.maxTimeMin === null ? p.maxTimeMin : Math.min(out.maxTimeMin, p.maxTimeMin);
    if (p.spiceDelta) out.spiceDelta = Math.max(-2, Math.min(2, out.spiceDelta + p.spiceDelta));
    if (p.course) out.course = p.course;
  };
  for (const c of chips) if (CHIP_TAGS[c]) apply(CHIP_TAGS[c]!);
  const t = normaliseText(text);
  if (t.trim()) {
    for (const k of KEYWORDS) if (k.words.some((w) => t.includes(` ${w} `))) apply(k.apply);
    const minutes = /(\d{1,3})\s*(min|mins|minute|minutes|मिनट)/.exec(t);
    if (minutes) apply({ maxTimeMin: Number(minutes[1]) });
    out.ingredients = [...new Set(findIngredients(text))];
  }
  return out;
}

// --- meal slot --------------------------------------------------------------------------------------------------

/** Slot from the local hour in the household's timezone (KIT-046). */
export function slotForHour(hour: number): MealSlot {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 18) return "snack";
  return "dinner";
}

export function localHour(date: Date, timeZone: string): number {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(date);
    return Number(h) % 24;
  } catch {
    return date.getHours();
  }
}

/** Default time budget by slot when the household hasn't set one. */
export function defaultBudget(slot: MealSlot): number {
  return slot === "breakfast" || slot === "tiffin" ? 25 : slot === "snack" ? 20 : 45;
}

// --- reasons (template fallback for pick_reasons; must cite a real factor) --------------------------------------

const R = {
  useSoon: { en: "Uses your {item} before it goes off", hinglish: "Aapka {item} kharab hone se pehle use ho jayega", hi: "आपका {item} खराब होने से पहले इस्तेमाल हो जाएगा" },
  craving: { en: "{tag}, as you asked", hinglish: "{tag}, jaisa aapne kaha", hi: "{tag}, जैसा आपने कहा" },
  liked: { en: "Has {item}, a favourite here", hinglish: "Isme {item} hai, jo yahan pasand hai", hi: "इसमें {item} है, जो यहाँ पसंद है" },
  all: { en: "Everything's in your kitchen", hinglish: "Sab kuch aapki rasoi mein hai", hi: "सब कुछ आपकी रसोई में है" },
  most: { en: "You have {have} of {total} things", hinglish: "{total} mein se {have} cheezein aapke paas hain", hi: "{total} में से {have} चीज़ें आपके पास हैं" },
  mild: { en: "Mild enough for {name}", hinglish: "{name} ke liye bhi theek, kam teekha", hi: "{name} के लिए भी ठीक, कम तीखा" },
  quick: { en: "Ready in {min} min", hinglish: "{min} min mein taiyaar", hi: "{min} मिनट में तैयार" },
  festival: { en: "Fits today's rules", hinglish: "Aaj ke niyam ke hisaab se", hi: "आज के नियम के हिसाब से" },
  fallback: { en: "A good fit for today", hinglish: "Aaj ke liye accha rahega", hi: "आज के लिए अच्छा रहेगा" },
} as const;

const TAG_LABELS: Record<string, Record<Locale, string>> = {
  comforting: { en: "Comforting", hinglish: "Comforting", hi: "आरामदायक" },
  quick: { en: "Quick", hinglish: "Jaldi wala", hi: "जल्दी बनने वाला" },
  high_protein: { en: "High in protein", hinglish: "Protein wala", hi: "प्रोटीन वाला" },
  kids_friendly: { en: "Kid-friendly", hinglish: "Bachchon ke liye", hi: "बच्चों के लिए" },
  light: { en: "Light", hinglish: "Halka", hi: "हल्का" },
};

function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ""));
}

const MAX_REASON = 90;

/** One line, ≤ 90 characters, built only from factors that actually scored. */
export function reasonFor(p: Ranked, ctx: RankContext, locale: Locale, nameOf: (key: string) => string): string {
  const parts: string[] = [];
  const soon = p.match.items
    .filter((i) => i.entry && i.entry.daysLeft !== null && i.entry.daysLeft <= 2)
    .sort((a, b) => (a.entry!.daysLeft ?? 9) - (b.entry!.daysLeft ?? 9))[0];
  if (soon) parts.push(fill(R.useSoon[locale], { item: nameOf(soon.entry!.key) }));
  const tag = ctx.craving.tags.find((t) => p.recipe.tags.includes(t));
  if (tag && TAG_LABELS[tag]) parts.push(fill(R.craving[locale], { tag: TAG_LABELS[tag][locale] }));
  // KIT-104: a pick that has something the household said it likes says so.
  const liked = p.recipe.ingredients.find((i) => ctx.like.includes(i.key));
  if (liked) parts.push(fill(R.liked[locale], { item: nameOf(liked.key) }));
  if (p.breakdown.calendar === 1) parts.push(R.festival[locale]);
  if (p.match.total && p.match.have === p.match.total) parts.push(R.all[locale]);
  else if (p.match.total >= 3 && p.match.have >= Math.max(p.match.total - 2, Math.ceil(p.match.total * 0.7))) parts.push(fill(R.most[locale], { have: p.match.have, total: p.match.total }));
  const child = ctx.eaters.find((e) => e.ageGroup === "child");
  if (child && p.recipe.spiceLevel <= child.spice + 1) parts.push(fill(R.mild[locale], { name: child.name }));
  if (p.recipe.timeMin <= 25) parts.push(fill(R.quick[locale], { min: p.recipe.timeMin }));

  let out = "";
  for (const part of parts) {
    const next = out ? `${out} · ${part}` : part;
    if (next.length > MAX_REASON) break;
    out = next;
    if (out !== part) break; // two facts at most
  }
  return out || R.fallback[locale];
}

// --- targeted pantry check (KIT-035, KIT-08) -------------------------------------------------------------------

export type PantryCheck = {
  itemId: string;
  key: string;
  /** Hero pick if the cook says the item is there. */
  ifYes: string;
  /** Hero pick if it isn't. */
  ifNo: string;
};

/** Items we're unsure about: low enough that we might be wrong either way (PLAN.md §5.1). */
export const CHECK_RANGE = { min: 0.3, max: 0.6 } as const;

/**
 * The one question worth asking today: an item we're unsure of whose answer changes tonight's hero pick. Returns
 * null when no answer would change the pick, so the cook isn't asked anything. Ties go to the item that spoils
 * first, then the one closest to "we have no idea" (0.5).
 */
export function pantryCheck(recipes: RankRecipe[], ctx: RankContext): PantryCheck | null {
  const hero = (pantry: PantryEntry[]) => choosePicks(rankRecipes(recipes, { ...ctx, pantry }), 1)[0]?.recipe.id ?? null;
  const unsure = ctx.pantry
    .filter((e) => !e.out && e.confidence >= CHECK_RANGE.min && e.confidence <= CHECK_RANGE.max)
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999) || Math.abs(a.confidence - 0.5) - Math.abs(b.confidence - 0.5) || a.itemId.localeCompare(b.itemId));
  const used = new Set(recipes.flatMap((r) => r.ingredients.flatMap((i) => [i.key, ...i.substitutes])));
  for (const e of unsure) {
    if (!used.has(e.key)) continue;
    const set = (confidence: number) => ctx.pantry.map((p) => (p.itemId === e.itemId ? { ...p, confidence } : p));
    const ifYes = hero(set(0.95));
    const ifNo = hero(set(0));
    if (ifYes && ifNo && ifYes !== ifNo) return { itemId: e.itemId, key: e.key, ifYes, ifNo };
  }
  return null;
}
