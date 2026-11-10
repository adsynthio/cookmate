// Item names in the user's language: catalog items get their Hindi / Hinglish / English name,
// anything else keeps what the user called it.
import { catalogEntry, catalogIndex } from "@/data/catalog";
import { displayName } from "@/domain/kitchen";
import { normalise } from "@/domain/pantryParse";
import { getLocale } from "@/i18n";
import type { DraftItem, PantryItem } from "@/services";

export function itemName(item: Pick<PantryItem, "ingredientKey" | "name">): string {
  return displayName(catalogEntry(item.ingredientKey), item.name, getLocale());
}

export function draftName(d: Pick<DraftItem, "ingredientKey" | "said">): string {
  return displayName(catalogEntry(d.ingredientKey), d.said, getLocale());
}

/** After the user retypes a name, match it to the catalog again (exact name or alias only). */
export function rematch(text: string): string | null {
  return catalogIndex.get(normalise(text))?.name ?? null;
}
