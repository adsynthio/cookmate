// Plan ahead (D1): what a dish needs done hours before cooking, worked out from the recipe and the kitchen.
//   * long hands-off opening steps (rajma soaked 8 hours, chicken marinated, dosa batter soaked, ground and
//     fermented) -> do them ahead;
//   * the dish uses curd, there's none but there is milk -> set curd the night before;
//   * something it uses is in the freezer -> move it to the fridge to thaw.
// Home uses this to offer tomorrow's dish in the evening ("Rajma tomorrow? Soak it tonight") and to show tonight's
// plan during the day. No React, no network.
import { aheadHours, aheadSpan, type RecipeDoc } from "./recipes.ts";

export { AHEAD_MINUTES } from "./recipes.ts";

export type PrepKind = "soak" | "marinate" | "rest" | "set_curd" | "defrost";
export type PrepNeed = { kind: PrepKind; /** Hours before cooking it should start. */ hours: number; /** Catalog key it's about. */ item?: string; step?: number };

const CURD_HOURS = 8;
const DEFROST_HOURS = 10;

export type KitchenItem = { key: string | null; location?: string | null; out?: boolean };

export function prepNeeds(doc: Pick<RecipeDoc, "steps" | "ingredients">, kitchen: KitchenItem[]): PrepNeed[] {
  const needs: PrepNeed[] = [];
  // Only the opening steps before the stove goes on: a long simmer in the middle of the recipe is cooking, not prep.
  // One need for the whole stretch, named after its first step: dosa is "soak the rice, about 16 hours", because the
  // soak, the grind and the overnight ferment all come before the tawa.
  const span = aheadSpan(doc.steps);
  if (span) {
    const s = doc.steps[span[0]]!;
    const kind: PrepKind = /soak/i.test(s.text) ? "soak" : /marinat/i.test(s.text) ? "marinate" : "rest";
    // What gets soaked or marinated: the dish's main ingredient (rajma, chicken).
    const item = (doc.ingredients.find((ing) => ing.role === "base" || ing.role === "protein") ?? doc.ingredients[0])?.ingredient;
    needs.push({ kind, hours: aheadHours(doc), item, step: span[0] + 1 });
  }
  const have = new Map(kitchen.filter((k) => k.key && !k.out).map((k) => [k.key!, k]));
  const uses = new Set(doc.ingredients.filter((i) => !i.optional).map((i) => i.ingredient));
  if (uses.has("curd") && !have.has("curd") && have.has("milk")) needs.push({ kind: "set_curd", hours: CURD_HOURS, item: "curd" });
  for (const key of uses) {
    if (have.get(key)?.location === "freezer") needs.push({ kind: "defrost", hours: DEFROST_HOURS, item: key });
  }
  return needs;
}

/** The longest lead time, in hours (0 when nothing needs doing ahead). */
export function leadHours(needs: PrepNeed[]): number {
  return needs.reduce((m, n) => Math.max(m, n.hours), 0);
}

/** Can it still be made today if cooking starts at `cookHour` and it's now `nowHour`? */
export function fitsToday(needs: PrepNeed[], nowHour: number, cookHour: number): boolean {
  return leadHours(needs) <= Math.max(0, cookHour - nowHour);
}

export type PlanMoment = "evening" | "day" | "none";

/**
 * When Home talks about planning: in the evening (after 19:00) it offers tomorrow; from morning until the meal it
 * shows today's plan. Late night and early morning stay quiet.
 */
export function planMoment(hour: number): PlanMoment {
  if (hour >= 19 && hour <= 23) return "evening";
  if (hour >= 6 && hour < 19) return "day";
  return "none";
}

/** Tomorrow's date (YYYY-MM-DD) for a local date string. */
export function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
