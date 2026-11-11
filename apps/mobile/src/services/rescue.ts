// The playbook answer computed on the phone (KIT-091 fallback): used by mock mode, and by the rescue sheet when the
// rescue function can't be reached, so a cook with no network still gets a fix and the safety line.
import catalog from "@/data/catalog.json";
import type { RecipeDoc } from "@/domain/recipes";
import { catalogLookup, staticRescue, type Problem, type RescueLocale } from "@/domain/rescue";

import type { PantryItem, RescueFix } from "./types";

const cat = catalogLookup(catalog as { name: string; hi?: string; latn?: string; category?: string }[]);

/** Same bar as the server: confident items, and staples that aren't Out. */
export function kitchenNames(items: Pick<PantryItem, "ingredientKey" | "confidence" | "stapleLevel">[]): string[] {
  const names = items
    .filter((i) => i.ingredientKey && (i.stapleLevel ? i.stapleLevel !== "out" : i.confidence >= 0.5))
    .map((i) => i.ingredientKey!);
  return [...new Set(names)];
}

export function localRescue(
  doc: Pick<RecipeDoc, "ingredients" | "steps">,
  items: Pick<PantryItem, "ingredientKey" | "confidence" | "stapleLevel">[],
  input: { problem: Problem; missing?: string; details?: string },
  locale: RescueLocale,
): RescueFix {
  const pantry = kitchenNames(items).filter((k) => k !== input.missing);
  const r = staticRescue(
    input.problem,
    { ingredients: doc.ingredients, techniques: doc.steps.map((s) => s.technique), pantry, missing: input.missing, details: input.details },
    cat,
    locale,
  );
  return { steps: r.steps, safetyNote: r.safetyNote, source: "rules" };
}
