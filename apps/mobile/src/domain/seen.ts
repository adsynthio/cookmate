// What Home showed lately, kept on this phone, so the next picks change (22 Nov 2026: "it keeps showing the same
// boring recipes"). The app sends these to suggest-meals; the chef step prefers dishes and ideas not shown lately.
// Pure: the storage lives in state/seen.ts.

export type Seen = { recipes: Record<string, number>; ideas: Record<string, number> };

const DAY = 86_400_000;
/** A library dish shown in the last 2 days, an idea in the last 3, counts as "lately". */
export const RECIPE_DAYS = 2;
export const IDEA_DAYS = 3;
const MAX = 30;

export const emptySeen = (): Seen => ({ recipes: {}, ideas: {} });

function recentKeys(m: Record<string, number>, days: number, now: number): string[] {
  return Object.entries(m)
    .filter(([, at]) => now - at < days * DAY)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX)
    .map(([k]) => k);
}

/** Recipe ids and idea names shown lately, newest first, at most 30 of each. */
export function lately(s: Seen, now = Date.now()): { recipes: string[]; ideas: string[] } {
  return { recipes: recentKeys(s.recipes, RECIPE_DAYS, now), ideas: recentKeys(s.ideas, IDEA_DAYS, now) };
}

/** The record with a batch's dishes and ideas added (now), and anything older than its window dropped. */
export function addSeen(s: Seen, shown: { recipeIds: string[]; ideas: string[] }, now = Date.now()): Seen {
  const keep = (m: Record<string, number>, days: number) => Object.fromEntries(Object.entries(m).filter(([, at]) => now - at < days * DAY));
  const recipes = keep(s.recipes, RECIPE_DAYS);
  const ideas = keep(s.ideas, IDEA_DAYS);
  for (const id of shown.recipeIds) if (id) recipes[id] = now;
  for (const name of shown.ideas) if (name.trim()) ideas[name.trim()] = now;
  return { recipes, ideas };
}

/**
 * Home leads with the new dishes from the kitchen when the library's best dish is one it showed in the last two days,
 * or when no library dish fits at all (23 Nov 2026: with 19 recipes the top card was the same few dishes every day).
 * `shownBefore` is what had been shown when the picks were asked for, not counting this batch.
 */
export function ideasLead(heroId: string | null | undefined, ideas: number, shownBefore: readonly string[]): boolean {
  return ideas > 0 && (!heroId || shownBefore.includes(heroId));
}
