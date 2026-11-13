// Sprint 13 S6: make it different with what you have. A kitchen-wide swap table (costly or missing → something most
// kitchens already have), with how each swap changes the dish. Recipes' own substitutes come first; these fill in
// after, so a pick can unlock a dish the cook "can't" make. Also "a fancier version": restaurant-style twists
// (shahi, dum, kofta, tikka) that a plain dish can take from basics. Pure TypeScript with no imports: shared with the
// Edge Functions by scripts/sync-shared.py.

/**
 * The job an ingredient does in a dish (Sprint 15 M1, "the cook's mind"). A real cook doesn't ask "do I have the
 * recipe's ingredient?" but "what does it do, and what here can do that job?": baking soda makes it rise, so Eno can
 * stand in. Swaps carry the job they keep, and the app says so ("Same job: makes it rise").
 */
export type Job = "rise" | "bind" | "sour" | "rich" | "sweet" | "thick" | "crunch" | "set" | "colour" | "aroma" | "fat" | "heat" | "base";

/** Jobs by catalog name. Anything not listed is the dish itself ("base"). */
export const JOBS: Record<string, Job[]> = {
  "baking soda": ["rise"], "baking powder": ["rise"], eno: ["rise"],
  "gram flour": ["bind", "thick"], cornflour: ["bind", "thick"], "rice flour": ["bind", "crunch"], "refined flour": ["bind"],
  bread: ["bind"], potato: ["bind", "base"], semolina: ["crunch", "bind"],
  lemon: ["sour"], "dry mango powder": ["sour"], tamarind: ["sour"], kokum: ["sour"], vinegar: ["sour"], tomato: ["sour", "base"],
  curd: ["sour", "rich"], buttermilk: ["sour"], "raw mango": ["sour"],
  ghee: ["rich", "fat"], butter: ["rich", "fat"], "fresh cream": ["rich", "thick"], khoya: ["rich", "thick"], "milk powder": ["rich", "thick"],
  "condensed milk": ["rich", "sweet"], milk: ["rich"], cashews: ["rich", "thick"], "poppy seeds": ["thick"], peanuts: ["rich", "crunch"],
  coconut: ["rich"], "desiccated coconut": ["rich"],
  sugar: ["sweet"], jaggery: ["sweet"], honey: ["sweet"], raisins: ["sweet"],
  bhujia: ["crunch"], papad: ["crunch"], "puffed rice": ["crunch"],
  "agar agar": ["set"],
  saffron: ["colour", "aroma"], "turmeric powder": ["colour"], "kashmiri chilli powder": ["colour", "heat"],
  "rose water": ["aroma"], "green cardamom": ["aroma"], nutmeg: ["aroma"],
  "refined oil": ["fat"], "mustard oil": ["fat"], "groundnut oil": ["fat"], "coconut oil": ["fat"], "sesame oil": ["fat"],
  "green chilli": ["heat"], "red chilli powder": ["heat"], "black pepper": ["heat"],
};

/** The jobs an ingredient does. */
export function jobsOf(key: string): Job[] {
  return JOBS[key] ?? ["base"];
}

/** The job a swap keeps: the first job both sides share, or null when it swaps one dish for another. */
export function jobOf(x: Pick<Swap, "from" | "to">): Job | null {
  const to = new Set(jobsOf(x.to));
  return jobsOf(x.from).find((j) => j !== "base" && to.has(j)) ?? null;
}

/** How the dish changes with the swap. */
export type SwapTaste = "same" | "lighter" | "richer" | "tangier" | "milder" | "nuttier" | "earthier" | "sweeter";

export type Swap = {
  /** Stable id; the app's strings use it for the how-to note (swaps.note.<id>). */
  id: string;
  from: string;
  to: string;
  /** Amount of `to` per 1 of `from`. */
  ratio: number;
  taste: SwapTaste;
  /** True when the swap is clearly cheaper, so it can be offered even when the cook has `from`. */
  cheaper: boolean;
  /** Short English how-to, for the model prompts. */
  how: string;
};

const s = (id: string, from: string, to: string, ratio: number, taste: SwapTaste, cheaper: boolean, how: string): Swap =>
  ({ id, from, to, ratio, taste, cheaper, how });

// Keys are catalog names. Every `to` is plain veg (no egg, meat or fish), so a swap never changes a dish's diet.
// Nuts appear as targets; picks never use a swap into something the household avoids (allergies, dislikes).
export const SWAPS: Swap[] = [
  s("cream_milk", "fresh cream", "milk", 1.5, "lighter", true, "simmer milk with a spoon of ghee until slightly thick; add off the heat"),
  s("cream_cashew", "fresh cream", "cashews", 0.5, "nuttier", false, "soak cashews 15 min in hot water, grind smooth with a little water"),
  s("cream_curd", "fresh cream", "curd", 1, "tangier", true, "whisk curd smooth, add off the heat so it doesn't split"),
  s("khoya_milk", "khoya", "milk", 5, "lighter", true, "reduce milk on low, stirring, until it thickens like batter"),
  s("cashew_peanut", "cashews", "peanuts", 1, "earthier", true, "roast and skin peanuts, grind to a smooth paste"),
  s("cashew_poppy", "cashews", "poppy seeds", 0.5, "same", true, "soak poppy seeds 20 min, grind smooth"),
  s("paneer_tofu", "paneer", "tofu", 1, "lighter", true, "press out the water, cube, and add at the end like paneer"),
  s("paneer_soya", "paneer", "soya chunks", 0.4, "earthier", true, "boil soya chunks 5 min, squeeze dry, then cook like paneer"),
  s("paneer_mushroom", "paneer", "mushroom", 1, "earthier", false, "cook mushrooms on high until their water dries"),
  s("cheese_paneer", "cheese", "paneer", 1, "milder", true, "grate paneer and add a pinch of salt"),
  s("butter_ghee", "butter", "ghee", 0.8, "richer", true, "use a little less ghee than butter"),
  s("ghee_butter", "ghee", "butter", 1.2, "same", false, "use on low heat so it doesn't burn"),
  s("butter_oil", "butter", "refined oil", 0.8, "lighter", true, "a little less oil; finish with a spoon of ghee if you have it"),
  s("mustard_oil_oil", "mustard oil", "refined oil", 1, "milder", true, "less sharp; add a pinch of mustard seeds for bite"),
  s("groundnut_oil_oil", "groundnut oil", "refined oil", 1, "same", true, "use the same amount"),
  s("oil_groundnut_oil", "refined oil", "groundnut oil", 1, "nuttier", false, "use the same amount"),
  s("lemon_amchur", "lemon", "dry mango powder", 0.1, "tangier", true, "about half a teaspoon per lemon, added at the end"),
  s("lemon_vinegar", "lemon", "vinegar", 0.5, "tangier", true, "a few drops at a time; it's sharper"),
  s("lemon_tamarind", "lemon", "tamarind", 0.3, "sweeter", true, "soak a small piece in warm water, use the pulp"),
  s("tomato_tamarind", "tomato", "tamarind", 0.05, "tangier", true, "a little tamarind pulp gives the sourness; the gravy is thinner"),
  s("tomato_curd", "tomato", "curd", 0.5, "milder", true, "whisked curd, added off the heat, for a pale tangy gravy"),
  s("curd_buttermilk", "curd", "buttermilk", 2, "lighter", true, "use twice as much and cook a little longer"),
  s("buttermilk_curd", "buttermilk", "curd", 0.5, "same", false, "whisk curd with as much water"),
  s("gg_paste_fresh", "ginger garlic paste", "garlic", 1, "same", true, "crush garlic with ginger if you have it"),
  s("ginger_dry", "ginger", "dry ginger powder", 0.1, "milder", true, "a pinch, added with the other powders"),
  s("kashmiri_red", "kashmiri chilli powder", "red chilli powder", 0.5, "milder", true, "use half: hotter and less red"),
  s("red_kashmiri", "red chilli powder", "kashmiri chilli powder", 1.5, "milder", false, "more colour, less heat"),
  s("green_chilli_red", "green chilli", "red chilli powder", 0.2, "same", true, "a pinch of powder per chilli"),
  s("coriander_mint", "coriander leaves", "mint leaves", 0.5, "same", false, "less mint; it's stronger"),
  s("basmati_rice", "basmati rice", "rice", 1, "same", true, "everyday rice; a little less water"),
  s("maida_atta", "refined flour", "whole wheat flour", 1, "earthier", true, "a little more water; softer if rested"),
  s("cornflour_rice", "cornflour", "rice flour", 1, "same", true, "the same amount for coating or thickening"),
  s("sugar_jaggery", "sugar", "jaggery", 1.2, "earthier", true, "grate or melt the jaggery first"),
  s("jaggery_sugar", "jaggery", "sugar", 0.8, "sweeter", false, "a little less sugar"),
  s("honey_jaggery", "honey", "jaggery", 1, "earthier", true, "melt with a spoon of water"),
  s("rajma_chole", "kidney beans", "chickpeas", 1, "same", false, "soak and pressure-cook the same way"),
  s("chole_rajma", "chickpeas", "kidney beans", 1, "earthier", false, "soak overnight and cook fully"),
  s("chole_kala", "chickpeas", "black chickpeas", 1, "earthier", true, "soak overnight, a few extra whistles"),
  s("toor_masoor", "toor dal", "masoor dal", 1, "same", true, "cooks faster, no soaking"),
  s("toor_moong", "toor dal", "yellow moong dal", 1, "lighter", true, "cooks faster and is easy on the stomach"),
  s("spinach_methi", "spinach", "fenugreek leaves", 0.5, "earthier", false, "half as much; it's bitter"),
  s("spinach_amaranth", "spinach", "amaranth leaves", 1, "same", true, "the same way"),
  s("peas_corn", "green peas", "sweet corn", 1, "sweeter", false, "the same way"),
  s("bread_pav", "bread", "pav", 1, "same", false, "the same way"),
  s("pav_bread", "pav", "bread", 1, "same", true, "toast with butter or ghee"),
  // M1: swaps by the job an ingredient does (Diwali boondi with Eno instead of soda).
  s("soda_eno", "baking soda", "eno", 2, "same", false, "about twice as much Eno; add it last, mix gently and cook at once, before the fizz goes"),
  s("eno_soda", "eno", "baking soda", 0.5, "same", true, "half as much soda with a few drops of lemon in the batter"),
  s("powder_soda", "baking powder", "baking soda", 0.33, "same", true, "a third as much soda, with curd or lemon in the batter"),
  s("soda_powder", "baking soda", "baking powder", 3, "milder", false, "three times as much baking powder"),
  s("powder_eno", "baking powder", "eno", 1, "same", false, "the same amount; add it last and cook at once"),
  s("eno_powder", "eno", "baking powder", 1, "same", false, "the same amount; it waits longer than Eno"),
  s("khoya_milk_powder", "khoya", "milk powder", 0.8, "lighter", true, "knead milk powder with a spoon of ghee and a little warm milk into a soft dough"),
  s("cream_milk_powder", "fresh cream", "milk powder", 0.3, "lighter", true, "whisk milk powder into a little warm milk until smooth; add off the heat"),
  s("condensed_milk_powder", "condensed milk", "milk powder", 0.6, "lighter", true, "milk powder and sugar stirred into a little warm milk"),
  s("saffron_turmeric", "saffron", "turmeric powder", 1, "milder", true, "a tiny pinch for the colour; the saffron smell is gone"),
  s("rose_cardamom", "rose water", "green cardamom", 0.2, "same", true, "a pinch of crushed elaichi instead"),
  s("kokum_tamarind", "kokum", "tamarind", 0.5, "tangier", false, "soak a small piece of tamarind and use the pulp"),
  s("bhujia_peanuts", "bhujia", "peanuts", 1, "earthier", false, "roasted peanuts for the crunch"),
  s("peanuts_bhujia", "peanuts", "bhujia", 1, "same", false, "a handful of bhujia on top for the crunch"),
];

/** Ingredients a dish is fine without; picks don't hold a dish back for them. */
export const SKIPPABLE = new Set(["dried fenugreek leaves", "saffron", "coriander leaves"]);

const BY_FROM = new Map<string, Swap[]>();
for (const x of SWAPS) BY_FROM.set(x.from, [...(BY_FROM.get(x.from) ?? []), x]);

/** Kitchen swaps for an ingredient, best first. */
export function swapsFor(key: string): Swap[] {
  return BY_FROM.get(key) ?? [];
}

/** The swap from one ingredient to another, if the table has it. */
export function swapBetween(from: string, to: string): Swap | null {
  return swapsFor(from).find((x) => x.to === to) ?? null;
}

/** A recipe's own substitutes first, then the kitchen swaps, without repeats. */
export function withKitchenSwaps(key: string, own: string[]): string[] {
  const out = [...own];
  for (const x of swapsFor(key)) if (!out.includes(x.to) && x.to !== key) out.push(x.to);
  return out;
}

/** The costly things worth offering a cheaper swap for, even when the cook has them. */
export const COSTLY = new Set(["fresh cream", "cashews", "paneer", "butter", "khoya", "cheese", "basmati rice", "almonds", "mushroom"]);

/** Cheaper swaps the cook has for costly things a dish uses ("Milk instead of cream: a little lighter"). */
export function cheaperSwaps(keys: string[], has: (key: string) => boolean, avoid: string[] = []): Swap[] {
  const no = new Set(avoid);
  const out: Swap[] = [];
  for (const k of keys) {
    if (!COSTLY.has(k)) continue;
    const x = swapsFor(k).find((w) => w.cheaper && has(w.to) && !no.has(w.to));
    if (x) out.push(x);
  }
  return out;
}

// --- a fancier version ---------------------------------------------------------------------------------------------

export type Twist = "shahi" | "dum" | "kofta" | "tikka";

export type TwistDish = {
  course: string;
  diet: string;
  tags: string[];
  /** Ingredient keys (non-optional). */
  ingredients: string[];
};

/** What each twist needs: one of each group, from the kitchen. */
const TWIST_NEEDS: Record<Twist, string[][]> = {
  shahi: [["fresh cream", "milk", "curd"], ["cashews", "peanuts", "poppy seeds", "almonds"]],
  dum: [["curd"], ["onion"]],
  kofta: [["gram flour", "cornflour", "rice flour", "bread"], ["potato", "paneer", "bottle gourd", "raw banana"]],
  tikka: [["curd"], ["gram flour", "cornflour"]],
};

const GRAVY_BASE = ["onion", "tomato"];
const SHAHI_BASE = ["paneer", "potato", "mushroom", "green peas", "cauliflower", "chicken", "egg", "soya chunks", "tofu"];
const KOFTA_BASE = ["potato", "paneer", "bottle gourd", "raw banana", "cauliflower"];
const TIKKA_BASE = ["paneer", "potato", "mushroom", "cauliflower", "capsicum", "chicken", "soya chunks", "tofu"];

/** Which twist suits a dish, from what it already is. */
function twistFits(t: Twist, d: TwistDish): boolean {
  const has = (k: string) => d.ingredients.includes(k);
  const curry = d.course === "main" && GRAVY_BASE.every(has);
  if (d.tags.includes(t)) return false;
  switch (t) {
    case "shahi":
      return curry && d.ingredients.some((k) => SHAHI_BASE.includes(k)) && !has("fresh cream") && !has("cashews");
    case "dum":
      return curry && d.ingredients.some((k) => ["potato", "paneer", "mushroom", "chicken", "mutton", "cauliflower"].includes(k));
    case "kofta":
      return curry && d.ingredients.some((k) => KOFTA_BASE.includes(k));
    case "tikka":
      return d.ingredients.some((k) => TIKKA_BASE.includes(k)) && (d.course === "main" || d.course === "snack" || d.course === "side");
  }
}

export type TwistOffer = { twist: Twist; uses: string[] };

/**
 * Restaurant-style twists the cook can make tonight from what's in the kitchen: at most two, each with the kitchen
 * items it uses. Nothing in `avoid` is used.
 */
export function twistsFor(d: TwistDish, has: (key: string) => boolean, avoid: string[] = []): TwistOffer[] {
  const no = new Set(avoid);
  const out: TwistOffer[] = [];
  for (const t of ["shahi", "kofta", "tikka", "dum"] as Twist[]) {
    if (out.length >= 2 || !twistFits(t, d)) continue;
    // What the dish already uses first, then the kitchen.
    const pick = (group: string[]) =>
      group.find((k) => d.ingredients.includes(k) && !no.has(k)) ?? group.find((k) => has(k) && !no.has(k));
    const uses = TWIST_NEEDS[t].map(pick);
    if (uses.every((k): k is string => !!k)) out.push({ twist: t, uses: [...new Set(uses)] });
  }
  return out;
}

/** One line for the model prompts: the cheap swaps it may make. */
export function swapsPrompt(keys: string[]): string {
  const lines = keys.flatMap((k) => swapsFor(k).filter((x) => x.cheaper).slice(0, 2).map((x) => `${x.from} → ${x.to} (${x.how})`));
  return lines.join("; ");
}
