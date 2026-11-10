// Curated recipes bundled with the app (generated from content/recipes by tools/content/build.py).
// Mock mode ranks and shows these; live mode reads the same content from the database.
import type { RecipeDoc } from "@/domain/recipes";

import data from "./recipes.json";

export const recipeDocs = data as unknown as RecipeDoc[];
const bySlug = new Map(recipeDocs.map((r) => [r.slug, r]));

export function recipeBySlug(slug: string): RecipeDoc | undefined {
  return bySlug.get(slug);
}
