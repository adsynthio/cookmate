// Kitchen setup during onboarding (Stitch "Let's get to know your kitchen"): tap common things to add them, by
// place, and see how many dishes that already unlocks. Pure TypeScript (type-only imports) so it is unit-tested.
import type { Diet } from "./onboarding.ts";

export type SetupPlace = "fridge" | "pantry" | "freezer" | "staples";

export const SETUP_PLACES: SetupPlace[] = ["fridge", "pantry", "freezer", "staples"];

/** What most Indian homes keep in each place, most common first (catalog names). */
export const SUGGESTIONS: Record<SetupPlace, string[]> = {
  fridge: ["milk", "curd", "paneer", "egg", "tomato", "green chilli", "coriander leaves", "ginger", "lemon", "butter", "spinach", "capsicum", "chicken"],
  pantry: ["onion", "potato", "garlic", "rice", "whole wheat flour", "toor dal", "yellow moong dal", "chana dal", "gram flour", "poha", "sugar", "tea leaves"],
  freezer: ["green peas", "sweet corn", "paneer", "chicken", "fish", "prawns", "mutton"],
  staples: ["salt", "turmeric powder", "red chilli powder", "cumin seeds", "mustard seeds", "coriander powder", "garam masala", "asafoetida", "ghee", "mustard oil", "refined oil", "jaggery"],
};

export type SetupEntry = { name: string; category: string; flags?: string[]; allergens?: string[]; staple?: boolean };

/** Whether a catalog item suits the household's food rules (mirrors the invent and adapt checks). */
export function fitsDiet(diet: Diet, entry: Pick<SetupEntry, "category" | "flags" | "allergens"> | undefined): boolean {
  if (!entry) return true; // the household's own food ("leftover dal") is theirs to decide
  if (diet === "nonveg") return true;
  if (entry.category === "meat" || entry.category === "seafood") return false;
  if (diet === "eggetarian") return true;
  if (entry.category === "egg") return false;
  if (diet === "jain") return !(entry.flags ?? []).includes("jain_avoid");
  if (diet === "vegan") return entry.category !== "dairy" && !(entry.allergens ?? []).includes("milk") && !(entry.flags ?? []).includes("animal");
  return true;
}

/** Suggestions for a place that suit the diet and aren't already chosen. */
export function suggestionsFor(
  place: SetupPlace,
  diet: Diet,
  chosen: { name: string }[],
  lookup: (name: string) => SetupEntry | undefined,
): string[] {
  const have = new Set(chosen.map((c) => c.name));
  return SUGGESTIONS[place].filter((n) => !have.has(n) && lookup(n) !== undefined && fitsDiet(diet, lookup(n)));
}

export type SetupItem = { name: string; place: SetupPlace; known: boolean; state?: "leftover" };

/** "leftover dal", "bacha hua chawal", "कल की कढ़ी": cooked food typed in, kept as leftovers in the fridge. */
export function isLeftoverText(text: string): boolean {
  return /\b(leftovers?|left over|bacha|bachi|bache|bacha hua|kal ka|kal ki|kal ke)\b|बचा|बची|बचे|कल का|कल की|कल के/i.test(text);
}

/** Add an item (once per name; a second tap in another place moves it). Own items keep the words typed. */
export function addSetupItem(items: SetupItem[], item: SetupItem): SetupItem[] {
  const name = item.name.trim();
  if (!name) return items;
  const rest = items.filter((i) => i.name.toLowerCase() !== name.toLowerCase());
  return [...rest, { ...item, name }];
}

export function removeSetupItem(items: SetupItem[], name: string): SetupItem[] {
  return items.filter((i) => i.name !== name);
}

type RecipeLike = {
  slug: string;
  title: string;
  diet: string;
  ingredients: { ingredient: string; optional?: boolean }[];
};

/**
 * Dishes these items already go a long way towards: at least `minShare` (default 70%) of the dish's main ingredients
 * (not staples, not optional) are in the kitchen. Staples count as present. Most complete first.
 */
export function dishesWithin(
  items: SetupItem[],
  recipes: RecipeLike[],
  isStaple: (name: string) => boolean,
  diet: Diet,
  dietOf: (recipeDiet: string) => boolean = (d) => dietAllows(diet, d),
  minShare = 0.7,
): { slug: string; title: string; share: number }[] {
  const have = new Set(items.map((i) => i.name));
  if (!have.size) return [];
  return recipes
    .filter((r) => dietOf(r.diet))
    .map((r) => {
      const main = r.ingredients.filter((i) => !i.optional && !isStaple(i.ingredient));
      const got = main.filter((i) => have.has(i.ingredient)).length;
      return { slug: r.slug, title: r.title, share: main.length ? got / main.length : 0 };
    })
    .filter((r) => r.share >= minShare)
    .sort((a, b) => b.share - a.share || a.title.localeCompare(b.title));
}

/** Whether a recipe's diet label is fine for the household (veg households don't see egg or meat dishes). */
export function dietAllows(household: Diet, recipeDiet: string): boolean {
  const order: Record<string, number> = { vegan: 0, jain: 1, veg: 1, eggetarian: 2, nonveg: 3 };
  if (household === "jain") return recipeDiet === "jain" || recipeDiet === "vegan";
  if (household === "vegan") return recipeDiet === "vegan";
  return (order[recipeDiet] ?? 3) <= (order[household] ?? 3);
}
