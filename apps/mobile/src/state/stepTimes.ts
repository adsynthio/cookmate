// S2: how long this cook takes over hands-on steps, kept on this phone (it is about the person cooking, not the
// household). See domain/stepTimes for what is learned and the limits.
import "expo-sqlite/localStorage/install";
import { create } from "zustand";

import type { StepTimes } from "@/domain/stepTimes";

const KEY = "cookmate.stepTimes";
const saved = (): StepTimes => {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    const parsed = v ? (JSON.parse(v) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as StepTimes) : {};
  } catch {
    return {};
  }
};

export const useStepTimes = create<{ times: StepTimes; set: (t: StepTimes) => void; clear: () => void }>((set) => ({
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
