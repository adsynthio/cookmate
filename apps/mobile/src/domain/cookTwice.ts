// F4, "cook once, eat twice" (docs/AI_RECIPES_PLAN.md): make double tonight and plan tomorrow from the second half.
// How long it keeps comes from fixed food-safety rules, never from a model: rice and khichdi go in the fridge within
// an hour and are eaten within a day (Bacillus cereus spores survive cooking); anything with meat, fish, egg or fresh
// dairy within a day; dal, rajma, sabzi and curries within two days. Always reheated once, until steaming hot.
// Fried snacks and drinks aren't made for keeping. Pure TypeScript.
import { LEFTOVER_IDEAS, leftoverKind, type LeftoverIdea, type LeftoverKind, needsRiceCare } from "./leftovers.ts";
import type { RecipeDoc } from "./recipes.ts";

export type KeepRule = { fridgeWithinHours: 1 | 2; eatWithinDays: 1 | 2 };
export type CookTwicePlan = { kind: LeftoverKind; keep: KeepRule; riceCare: boolean; ideas: LeftoverIdea[] };

const SHORT = new Set(["chicken", "mutton", "minced mutton", "fish", "prawns", "egg", "paneer", "curd", "fresh cream", "khoya", "milk", "buttermilk"]);
const NOT_FOR_KEEPING = new Set(["snack", "drink", "dessert", "chutney_pickle", "component"]);

export function cookTwicePlan(doc: Pick<RecipeDoc, "title" | "slug" | "course" | "ingredients" | "steps">): CookTwicePlan | null {
  if (NOT_FOR_KEEPING.has(doc.course)) return null;
  if (doc.steps.some((s) => s.technique === "deep_fry")) return null;
  const kind = leftoverKind(`${doc.slug.replace(/-/g, " ")} ${doc.title}`);
  const riceCare = needsRiceCare(kind) || doc.ingredients.some((i) => (i.ingredient === "rice" || i.ingredient === "basmati rice") && i.role === "base");
  const short = riceCare || doc.ingredients.some((i) => SHORT.has(i.ingredient) && !i.optional);
  return {
    kind,
    keep: { fridgeWithinHours: riceCare ? 1 : 2, eatWithinDays: short ? 1 : 2 },
    riceCare,
    ideas: LEFTOVER_IDEAS[kind].slice(0, 2),
  };
}
