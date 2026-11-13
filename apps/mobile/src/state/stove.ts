// Which stove this phone's cook is using right now, for kitchens with both gas and induction. Kept on the phone.
import "expo-sqlite/localStorage/install";
import { create } from "zustand";

import type { Stove } from "@/domain/stoveGuide";

const KEY = "cookmate.stove";
const saved = (): Stove | null => {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === "gas" || v === "induction" ? v : null;
  } catch {
    return null;
  }
};

export const useStove = create<{ stove: Stove | null; setStove: (s: Stove) => void }>((set) => ({
  stove: saved(),
  setStove: (stove) => {
    try {
      globalThis.localStorage?.setItem(KEY, stove);
    } catch {}
    set({ stove });
  },
}));
