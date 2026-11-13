// F6, meal cost (docs/AI_RECIPES_PLAN.md): a rough cost per plate from typical city prices, so a family can see
// what a dish costs and what a cheaper swap saves. Rough on purpose: prices change by city and season, so the app
// says "about" and rounds to ₹5. Spices and staples used in pinches cost little and are counted at a flat rate.
// Pure TypeScript.
import type { RecipeDoc } from "./recipes.ts";
import type { Swap } from "./swaps.ts";

/** Typical prices in rupees per kg (or per litre), late 2026, large Indian cities. */
export const PRICE_PER_KG: Record<string, number> = {
  onion: 40, tomato: 40, potato: 30, garlic: 200, ginger: 160, "green chilli": 80, "coriander leaves": 120, "mint leaves": 160,
  cauliflower: 50, cabbage: 40, "green peas": 100, carrot: 50, capsicum: 80, brinjal: 50, okra: 60, spinach: 60,
  "fenugreek leaves": 80, "bottle gourd": 40, mushroom: 250, lemon: 120, "sweet corn": 80, "french beans": 80,
  rice: 60, "basmati rice": 130, "whole wheat flour": 45, "refined flour": 45, "gram flour": 100, semolina: 50, poha: 60,
  "toor dal": 160, "yellow moong dal": 140, "masoor dal": 110, "chana dal": 100, "urad dal": 150, "kidney beans": 150,
  chickpeas: 120, "black chickpeas": 100, "soya chunks": 150, sabudana: 120, "buckwheat flour": 200, "water chestnut flour": 300,
  milk: 64, curd: 80, paneer: 420, ghee: 650, butter: 550, "fresh cream": 300, khoya: 400, "milk powder": 450, "condensed milk": 350, cheese: 600,
  egg: 140, chicken: 260, mutton: 800, "minced mutton": 750, fish: 350, prawns: 600, tofu: 300,
  "refined oil": 160, "mustard oil": 190, "groundnut oil": 200, "coconut oil": 250,
  sugar: 45, jaggery: 70, honey: 400, peanuts: 140, cashews: 900, almonds: 900, raisins: 400, coconut: 120,
  "desiccated coconut": 300, tamarind: 200, bread: 80, pav: 80, papad: 300, bhujia: 300, eno: 500,
};

/** Flat rates by catalog category when a price isn't listed (spices are used in pinches). */
const BY_CATEGORY: Record<string, number> = {
  vegetable: 50, fruit: 100, herb: 120, grain: 60, flour: 60, pulse: 130, dairy: 100, egg: 140, meat: 400, seafood: 450,
  spice: 600, oil_fat: 180, sweetener: 50, condiment: 250, nut_seed: 500, packaged: 300, beverage: 400, other: 300,
};

type Entry = { category: string };

/** Rupees for the recipe at a number of servings, and per plate. Frying oil counts a quarter (most is left over). */
export function mealCost(
  doc: Pick<RecipeDoc, "ingredients" | "base_servings" | "steps">,
  servings: number,
  catalog: (key: string) => Entry | undefined,
): { total: number; perPlate: number } {
  const scale = servings / Math.max(1, doc.base_servings);
  const frying = doc.steps.some((s) => s.technique === "deep_fry");
  let rupees = 0;
  for (const i of doc.ingredients) {
    if (i.unit !== "g" && i.unit !== "ml" && i.unit !== "piece") continue;
    const perKg = PRICE_PER_KG[i.ingredient] ?? BY_CATEGORY[catalog(i.ingredient)?.category ?? "other"] ?? 300;
    // Pieces: an egg is about 55 g, bread and pav about 30 g.
    const grams = i.unit === "piece" ? i.qty * (i.ingredient === "egg" ? 55 : 30) : i.qty;
    const used = frying && (i.ingredient.endsWith("oil") || i.ingredient === "ghee") && i.qty > 100 ? 0.25 : 1;
    rupees += (grams / 1000) * perKg * scale * used;
  }
  const round5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);
  return { total: round5(rupees), perPlate: round5(rupees / Math.max(1, servings)) };
}

/** What a cheaper swap saves on this recipe at these servings, in rupees (0 when it doesn't save). */
export function swapSaving(
  doc: Pick<RecipeDoc, "ingredients" | "base_servings">,
  servings: number,
  x: Pick<Swap, "from" | "to" | "ratio">,
): number {
  const ing = doc.ingredients.find((i) => i.ingredient === x.from);
  if (!ing || (ing.unit !== "g" && ing.unit !== "ml")) return 0;
  const scale = servings / Math.max(1, doc.base_servings);
  const before = (ing.qty / 1000) * (PRICE_PER_KG[x.from] ?? 300) * scale;
  const after = ((ing.qty * x.ratio) / 1000) * (PRICE_PER_KG[x.to] ?? 300) * scale;
  return Math.max(0, Math.round((before - after) / 5) * 5);
}
