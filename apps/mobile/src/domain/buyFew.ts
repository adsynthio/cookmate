// Sprint 13 S8: buy 2, unlock 6. The smallest shopping list that opens up the most dishes the kitchen can't make
// yet: every pair (or single item) of missing ingredients is tried against every dish that is one or two things
// short, and the one that completes the most dishes wins. Kitchen swaps (S6) already count as having it, so the list
// only names what really can't be swapped. No React, no network.
import type { Diet, PantryEntry, RankRecipe } from "./ranking.ts";

/** Same rules as ranking.pantryMatch, kept here so this file only imports types (node tests run it directly). */
const CONFIDENT = 0.5;

const DIET_ALLOWS: Record<Diet, Diet[]> = {
  nonveg: ["nonveg", "eggetarian", "veg", "jain", "vegan"],
  eggetarian: ["eggetarian", "veg", "jain", "vegan"],
  veg: ["veg", "jain", "vegan"],
  jain: ["jain"],
  vegan: ["vegan"],
};

export type BuyFew = {
  /** What to buy, one or two catalog keys. */
  buy: string[];
  /** Dishes (slugs) this completes. */
  unlocks: string[];
};

/** Not worth suggesting a shop for fewer than this. */
const MIN_UNLOCK = 2;

/** The ingredients a dish still needs: not in the kitchen, not a staple nobody marked Out, and no usable swap. */
export function stillNeeds(r: RankRecipe, pantry: PantryEntry[], staples: string[], avoid: string[] = []): string[] {
  const usable = new Set(pantry.filter((e) => !e.out && e.confidence >= CONFIDENT).map((e) => e.key));
  const out = new Set(pantry.filter((e) => e.out).map((e) => e.key));
  const stapleSet = new Set(staples);
  const no = new Set(avoid);
  return r.ingredients
    .filter((i) => !i.optional)
    .filter((i) => !usable.has(i.key) && !i.substitutes.some((s) => usable.has(s) && !no.has(s)) && !(stapleSet.has(i.key) && !out.has(i.key)))
    .map((i) => i.key);
}

/**
 * The best one or two things to buy. Dishes are those everyone eating can have (diet), with nothing the household
 * avoids, that aren't basics (rotis, plain rice); a dish already makeable doesn't count as unlocked.
 */
export function bestBuys(
  recipes: RankRecipe[],
  pantry: PantryEntry[],
  staples: string[],
  opts: { diets: Diet[]; avoid?: string[]; max?: number },
): BuyFew | null {
  const max = opts.max ?? 2;
  const avoid = new Set(opts.avoid ?? []);
  const fits = (r: RankRecipe) =>
    r.course !== "component" &&
    opts.diets.every((d) => DIET_ALLOWS[d].includes(r.diet)) &&
    !r.ingredients.some((i) => !i.optional && avoid.has(i.key));
  const short = recipes
    .filter(fits)
    .map((r) => ({ slug: r.slug, needs: stillNeeds(r, pantry, staples, opts.avoid) }))
    .filter((x) => x.needs.length > 0 && x.needs.length <= max && x.needs.every((k) => !avoid.has(k)));
  const items = [...new Set(short.flatMap((x) => x.needs))].sort();
  let best: BuyFew | null = null;
  const consider = (buy: string[]) => {
    const unlocks = short.filter((x) => x.needs.every((k) => buy.includes(k))).map((x) => x.slug);
    if (
      !best ||
      unlocks.length > best.unlocks.length ||
      (unlocks.length === best.unlocks.length && buy.length < best.buy.length)
    ) {
      best = { buy, unlocks };
    }
  };
  items.forEach((a, i) => {
    consider([a]);
    if (max >= 2) items.slice(i + 1).forEach((b) => consider([a, b]));
  });
  const found = best as BuyFew | null;
  return found && found.unlocks.length >= MIN_UNLOCK ? found : null;
}
