// Sprint 15 M6, "never overwhelming": a simpler version of any dish. Extras a dish is fine without (optional
// ingredients and garnishes) can be left out in one tap, through the same "usual skips" the cook flow already
// respects (S7). Never something a safety note depends on, never salt, never the dish's base. Pure TypeScript.
import type { RecipeDoc } from "./recipes.ts";

const NEVER = new Set(["salt"]);

/** What the simpler version leaves out, in recipe order. Empty when the dish has nothing to spare. */
export function simplerLeaveOut(doc: Pick<RecipeDoc, "ingredients" | "steps">): string[] {
  const safety = doc.steps.map((s) => s.safety ?? "").join(" ").toLowerCase();
  const out: string[] = [];
  for (const i of doc.ingredients) {
    const key = i.ingredient;
    if (NEVER.has(key) || out.includes(key)) continue;
    if (!(i.optional || i.role === "garnish")) continue;
    if (safety.includes(key)) continue;
    out.push(key);
  }
  return out;
}
