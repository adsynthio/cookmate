// The kitchen and shopping list with no network (KIT-076, NFR-05). The phone keeps the last kitchen and list it saw;
// edits made offline wait in the outbox and are also applied to that copy here, so the cook sees their change at
// once. When the network is back the queued edits replay and the copy is replaced by what the server says.
// Pure logic: no storage, no network.
import type { DraftItem, ItemChanges, ListLine, PantryItem } from "../services/types.ts";

export type KitchenCopy = {
  items: PantryItem[];
  list: ListLine[];
  /** Items finished or thrown away offline, kept so Undo works without the network. */
  removed: PantryItem[];
  savedAt: number;
};

export const EMPTY_COPY: KitchenCopy = { items: [], list: [], removed: [], savedAt: 0 };

export type KitchenEdit =
  | { call: "kitchen.addItems"; items: DraftItem[] }
  | { call: "kitchen.updateItem"; itemId: string; changes: ItemChanges }
  | { call: "kitchen.finishItem"; itemId: string }
  | { call: "kitchen.reopenItem"; itemId: string }
  | { call: "kitchen.addToList"; items: { name: string; reason: ListLine["reason"] }[] }
  | { call: "kitchen.markBought"; itemIds?: string[] }
  | { call: "kitchen.removeFromList"; itemId: string };

/** Ids the phone made up for things added offline; the server gives them real ids on replay. */
export const isLocalId = (id: string) => id.startsWith("local-");

/** The copy after one edit. `id()` makes ids for things added offline. */
export function applyEdit(copy: KitchenCopy, edit: KitchenEdit, id: () => string = () => `local-${Math.random().toString(36).slice(2, 10)}`): KitchenCopy {
  switch (edit.call) {
    case "kitchen.addItems":
      return {
        ...copy,
        items: [
          ...copy.items,
          ...edit.items.map((d): PantryItem => ({
            id: id(),
            ingredientKey: d.ingredientKey,
            name: d.ingredientKey ?? d.said,
            quantity: d.quantity,
            unit: d.unit,
            location: d.locationKind ?? "pantry",
            stapleLevel: null,
            expiryDate: null,
            expiryEstimated: true,
            confidence: 0.95,
            state: d.state ?? "raw",
            flavorRoles: d.flavorRoles,
          })),
        ],
      };
    case "kitchen.updateItem":
      return {
        ...copy,
        items: copy.items.map((i) => {
          if (i.id !== edit.itemId) return i;
          const c = edit.changes;
          return {
            ...i,
            ...(c.quantity !== undefined ? { quantity: c.quantity } : {}),
            ...(c.unit !== undefined ? { unit: c.unit } : {}),
            ...(c.stapleLevel !== undefined ? { stapleLevel: c.stapleLevel } : {}),
            ...(c.locationKind !== undefined ? { location: c.locationKind } : {}),
            ...(c.expiryDate !== undefined ? { expiryDate: c.expiryDate, expiryEstimated: false } : {}),
            ...(c.customName !== undefined ? { name: c.customName } : {}),
            // Any edit by the cook is a confirmation that the thing is there.
            confidence: 0.95,
          };
        }),
      };
    case "kitchen.finishItem": {
      const gone = copy.items.find((i) => i.id === edit.itemId);
      return gone ? { ...copy, items: copy.items.filter((i) => i.id !== edit.itemId), removed: [...copy.removed, gone].slice(-20) } : copy;
    }
    case "kitchen.reopenItem": {
      const back = copy.removed.find((i) => i.id === edit.itemId);
      return back ? { ...copy, items: [...copy.items, back], removed: copy.removed.filter((i) => i.id !== edit.itemId) } : copy;
    }
    case "kitchen.addToList": {
      const have = new Set(copy.list.map((l) => l.name.toLowerCase()));
      const fresh = edit.items.filter((i) => !have.has(i.name.toLowerCase()));
      return {
        ...copy,
        list: [...copy.list, ...fresh.map((i): ListLine => ({ id: id(), ingredientKey: null, name: i.name, quantity: null, unit: null, reason: i.reason }))],
      };
    }
    case "kitchen.markBought": {
      const ids = edit.itemIds?.length ? new Set(edit.itemIds) : null;
      return { ...copy, list: ids ? copy.list.filter((l) => !ids.has(l.id)) : [] };
    }
    case "kitchen.removeFromList":
      return { ...copy, list: copy.list.filter((l) => l.id !== edit.itemId) };
  }
}

/**
 * Whether a queued edit can replay as it is. One that names something the phone made up offline can't: the server
 * never knew that id. Those edits are dropped; the thing itself is still added, as it was first entered.
 */
export function replayable(edit: KitchenEdit): boolean {
  if (edit.call === "kitchen.updateItem" || edit.call === "kitchen.finishItem" || edit.call === "kitchen.reopenItem" || edit.call === "kitchen.removeFromList") {
    return !isLocalId(edit.itemId);
  }
  if (edit.call === "kitchen.markBought") return !edit.itemIds?.length || edit.itemIds.some((i) => !isLocalId(i));
  return true;
}
