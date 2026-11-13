// M2: which cooking techniques this cook has done, kept on this phone (it is about the person cooking). Recorded
// when a cook finishes; read by the recipe screen's "Looks fancy, is easy" card. See domain/blueprint.
import "expo-sqlite/localStorage/install";
import { create } from "zustand";

import type { DoneBefore } from "@/domain/blueprint";

const KEY = "cookmate.techniquesDone";
const saved = (): DoneBefore => {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    const parsed = v ? (JSON.parse(v) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as DoneBefore) : {};
  } catch {
    return {};
  }
};

export const useTechniques = create<{ done: DoneBefore; set: (d: DoneBefore) => void }>((set) => ({
  done: saved(),
  set: (done) => {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(done));
    } catch {}
    set({ done });
  },
}));
