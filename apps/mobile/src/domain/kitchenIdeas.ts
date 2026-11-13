// Sprint 15 M4, "the cook's mind": ideas from what you have. "Your kitchen can make these right now", and dishes
// "one swap away" with the swap shown. Near a festival, sweets and snacks come first; at most three ideas, so it
// never overwhelms (M6). Pure TypeScript: the recipes, the pantry and the occasion come in.
import { blueprint } from "./blueprint.ts";
import { type PantryEntry, pantryMatch } from "./ranking.ts";
import { type RecipeDoc, toRankRecipe } from "./recipes.ts";
import { jobOf, type Swap, swapBetween } from "./swaps.ts";

export type Idea = {
  doc: RecipeDoc;
  /** Everything is here, or one thing needs a swap the kitchen can make. */
  kind: "ready" | "one_swap";
  /** For one_swap: the swap, with the job it keeps. */
  swap?: Swap;
  /** How many simple parts the dish is (M2). */
  parts: number;
};

export type Occasion = "festival" | "fast" | null;

/** Is a festival or a fast on, or a festival within the next week? From calendar rows (event_date, end_date, kind). */
export function occasionOn(
  events: { event_date: string; end_date?: string | null; kind: string }[],
  today: string,
): Occasion {
  const inAWeek = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const live = events.filter((e) => e.event_date <= inAWeek && (e.end_date ?? e.event_date) >= today);
  if (live.some((e) => e.kind === "fast" && e.event_date <= today)) return "fast";
  if (live.some((e) => e.kind === "festival")) return "festival";
  return null;
}

const FESTIVE_COURSES = new Set(["dessert", "snack"]);

/**
 * At most `limit` ideas, best first: ready before one swap away; near a festival, sweets and snacks first; then
 * fewer parts first (the easiest). A dish that uses anything avoided never shows.
 */
export function kitchenIdeas(
  docs: RecipeDoc[],
  pantry: PantryEntry[],
  staples: string[],
  opts: { avoid?: string[]; occasion?: Occasion; limit?: number } = {},
): Idea[] {
  const avoid = opts.avoid ?? [];
  const no = new Set(avoid);
  const out: (Idea & { score: number })[] = [];
  for (const doc of docs) {
    if (doc.ingredients.some((i) => no.has(i.ingredient))) continue;
    if (opts.occasion === "fast" && !doc.tags?.includes("fasting")) continue;
    const m = pantryMatch(toRankRecipe(doc), pantry, staples, avoid);
    const missing = m.items.filter((i) => i.status === "missing");
    let idea: Idea | null = null;
    if (!missing.length) {
      // A recipe substitute that is in the kitchen counts as ready, as it does for picks.
      const sub = m.items.find((i) => i.status === "substitute" && i.substitute);
      const swap = sub ? swapBetween(sub.key, sub.substitute!) : null;
      idea = swap && jobOf(swap)
        ? { doc, kind: "one_swap", swap, parts: blueprint(doc).length }
        : { doc, kind: "ready", parts: blueprint(doc).length };
    }
    if (!idea) continue;
    const festive = opts.occasion === "festival" && FESTIVE_COURSES.has(doc.course) ? 0 : 1;
    // A meal before a side, a side before a component (roti, a base masala): ideas are things to cook tonight.
    const course = doc.course === "component" ? 30 : doc.course === "side" || doc.course === "chutney_pickle" ? 20 : 0;
    out.push({ ...idea, score: festive * 100 + (idea.kind === "ready" ? 0 : 50) + course + idea.parts });
  }
  return out
    .sort((a, b) => a.score - b.score || a.doc.slug.localeCompare(b.doc.slug))
    .slice(0, opts.limit ?? 3)
    .map(({ score: _s, ...i }) => i);
}
