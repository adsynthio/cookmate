// Turning parser output into confirm-sheet drafts, shared by the mock and live services.
import type { ParsedItem } from "@/domain/pantryParse";

import type { DraftItem, FlavorRole } from "./types";

let counter = 0;

export function toDraft(p: ParsedItem): DraftItem {
  counter += 1;
  return {
    key: `d${Date.now().toString(36)}${counter}`,
    said: p.said,
    ingredientKey: p.ingredientKey,
    quantity: p.quantity,
    unit: p.unit,
    locationKind: p.locationKind,
    state: p.state,
    flavorRoles: [] as FlavorRole[],
    confidence: p.confidence,
  };
}

/** The add_inventory_items payload for one draft. */
export function toRpcItem(d: DraftItem) {
  return {
    name: d.ingredientKey ?? d.said,
    quantity: d.quantity,
    unit: d.unit,
    location_kind: d.locationKind,
    state: d.state,
    flavor_roles: d.flavorRoles,
  };
}
