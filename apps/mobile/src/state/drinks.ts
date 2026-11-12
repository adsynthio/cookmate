// Drinks settings, kept on this phone: off by default (turned on in setup or on You), and whether the cook has said
// they are of legal drinking age (cocktails stay hidden until then).
import "expo-sqlite/localStorage/install";

import { create } from "zustand";

const KEY = "cookmate.drinks";
type Saved = { enabled: boolean; adult: boolean };

function load(): Saved {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}") as Partial<Saved>;
    return { enabled: v.enabled === true, adult: v.adult === true };
  } catch {
    return { enabled: false, adult: false };
  }
}

function save(s: Saved) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {}
}

type DrinksState = Saved & { setEnabled: (on: boolean) => void; setAdult: (yes: boolean) => void };

export const useDrinks = create<DrinksState>((set, get) => ({
  ...load(),
  setEnabled: (enabled) => {
    set({ enabled });
    save({ enabled, adult: get().adult });
  },
  setAdult: (adult) => {
    set({ adult });
    save({ enabled: get().enabled, adult });
  },
}));
