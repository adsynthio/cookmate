// The phone's copy of the kitchen and shopping list (domain/kitchenOffline.ts), one per household, in the device's
// localStorage. Refreshed on every successful read; shown, with offline edits applied, when the network is down.
import "expo-sqlite/localStorage/install";

import { applyEdit, EMPTY_COPY, type KitchenCopy, type KitchenEdit } from "@/domain/kitchenOffline";

const KEY = "cookmate.kitchen.";

export function getCopy(householdId: string): KitchenCopy | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY + householdId);
    return raw ? (JSON.parse(raw) as KitchenCopy) : null;
  } catch {
    return null;
  }
}

export function putCopy(householdId: string, patch: Partial<KitchenCopy>) {
  try {
    const next = { ...(getCopy(householdId) ?? EMPTY_COPY), ...patch, savedAt: Date.now() };
    globalThis.localStorage?.setItem(KEY + householdId, JSON.stringify(next));
  } catch {
    // Storage full or unavailable: offline reads just won't have a copy.
  }
}

export function editCopy(householdId: string, edit: KitchenEdit) {
  const copy = getCopy(householdId);
  if (copy) putCopy(householdId, applyEdit(copy, edit));
}

/** Which household's copy holds this pantry item or list line (edits by id don't say). */
export function householdOf(id: string, households: string[]): string | null {
  for (const h of households) {
    const c = getCopy(h);
    if (c && (c.items.some((i) => i.id === id) || c.list.some((l) => l.id === id) || c.removed.some((i) => i.id === id))) return h;
  }
  return null;
}

export function clearCopies() {
  try {
    const ls = globalThis.localStorage;
    for (let i = (ls?.length ?? 0) - 1; i >= 0; i--) {
      const k = ls!.key(i);
      if (k?.startsWith(KEY)) ls!.removeItem(k);
    }
  } catch {
    // nothing to clear
  }
}
