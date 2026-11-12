// Drinks: what to show (cocktails only once the cook has said they are of legal drinking age) and how much of a
// drink the kitchen already has. Pure, so it is tested without the app.
import type { Drink, DrinkIngredient, DrinkLocale, L } from "../data/drinks.ts";

/** Kitchen staples most homes keep (the catalog marks these; repeated here so this file stays pure). */
const DEFAULT_STAPLES = ["salt", "sugar", "turmeric powder", "red chilli powder", "refined oil", "mustard seeds", "cumin seeds"];

export type DrinkFilter = "all" | "everyday" | "cocktails";

export function drinksFor(drinks: readonly Drink[], filter: DrinkFilter, adult: boolean): Drink[] {
  return drinks.filter((d) => {
    if (d.alcoholic && !adult) return false;
    if (filter === "everyday") return !d.alcoholic;
    if (filter === "cocktails") return d.alcoholic;
    return true;
  });
}

/** Have / total counts only kitchen ingredients that are not optional; water, ice and spirits are not tracked. */
export function drinkMatch(d: Drink, have: ReadonlySet<string>): { have: number; total: number; missing: DrinkIngredient[] } {
  const tracked = d.ingredients.filter((i) => i.key && !i.optional);
  const missing = tracked.filter((i) => !have.has(i.key!));
  return { have: tracked.length - missing.length, total: tracked.length, missing };
}

export function say(text: L, locale: string): string {
  return text[(locale as DrinkLocale) in text ? (locale as DrinkLocale) : "en"];
}

/** What the kitchen has for drinks: catalog items not marked Out, plus everyday staples (sugar, salt) unless Out,
 * the same assumption the dish picks make. */
export function kitchenHas(items: readonly { ingredientKey: string | null; stapleLevel: string | null }[], staples: readonly string[] = DEFAULT_STAPLES): Set<string> {
  const out = new Set(items.filter((i) => i.stapleLevel === "out").map((i) => i.ingredientKey));
  const have = new Set(items.filter((i) => i.ingredientKey && i.stapleLevel !== "out").map((i) => i.ingredientKey!));
  for (const s of staples) if (!out.has(s)) have.add(s);
  return have;
}
