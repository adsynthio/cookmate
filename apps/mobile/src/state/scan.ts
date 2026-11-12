// Items found by a scan, waiting for the check screen (pantry/add) to pick them up. UI state only: nothing here is
// saved until the cook presses Add on that screen.
import { create } from "zustand";

import type { AddedVia, DraftItem } from "@/services";

type ScanState = {
  pending: { items: DraftItem[]; via: AddedVia } | null;
  hand: (items: DraftItem[], via: AddedVia) => void;
  take: () => { items: DraftItem[]; via: AddedVia } | null;
};

export const useScan = create<ScanState>((set, get) => ({
  pending: null,
  hand: (items, via) => set({ pending: { items, via } }),
  take: () => {
    const p = get().pending;
    set({ pending: null });
    return p;
  },
}));
