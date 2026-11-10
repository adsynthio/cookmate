// Ingredient catalog bundled with the app (generated from content/ by tools/content/build.py).
// Used for offline parsing, names in the user's language and storage tips.
import { buildIndex } from "@/domain/pantryParse";
import type { CatalogItem } from "@/domain/kitchen";

import data from "./catalog.json";

export const catalog = data as unknown as CatalogItem[];
export const catalogIndex = buildIndex(catalog);
const byName = new Map(catalog.map((c) => [c.name, c]));

export function catalogEntry(name: string | null | undefined): CatalogItem | undefined {
  return name ? byName.get(name) : undefined;
}
