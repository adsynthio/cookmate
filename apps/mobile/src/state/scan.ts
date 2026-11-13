// Items found by a scan, waiting for the check screen (pantry/add) to pick them up. UI state only: nothing here is
// saved until the cook presses Add on that screen.
import { create } from "zustand";

import type { ToolKey } from "@/domain/tools";
import type { AddedVia, DraftItem } from "@/services";

type ScanState = {
  pending: { items: DraftItem[]; via: AddedVia; appliances: ToolKey[] } | null;
  hand: (items: DraftItem[], via: AddedVia, appliances?: ToolKey[]) => void;
  take: () => { items: DraftItem[]; via: AddedVia; appliances: ToolKey[] } | null;
};

export const useScan = create<ScanState>((set, get) => ({
  pending: null,
  hand: (items, via, appliances = []) => set({ pending: { items, via, appliances } }),
  take: () => {
    const p = get().pending;
    set({ pending: null });
    return p;
  },
}));
