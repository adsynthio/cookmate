// S7: quiet learning (usual skips, familiar dishes), kept on this phone. See domain/habits.
import "expo-sqlite/localStorage/install";
import { create } from "zustand";

import type { Habits } from "@/domain/habits";

const KEY = "cookmate.habits";
const saved = (): Habits => {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    const parsed = v ? (JSON.parse(v) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Habits) : {};
  } catch {
    return {};
  }
};

export const useHabits = create<{ times: Habits; set: (t: Habits) => void; clear: () => void }>((set) => ({
  times: saved(),
  set: (times) => {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(times));
    } catch {}
    set({ times });
  },
  clear: () => {
    try {
      globalThis.localStorage?.removeItem(KEY);
    } catch {}
    set({ times: {} });
  },
}));
