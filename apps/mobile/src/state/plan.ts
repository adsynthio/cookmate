// Plan ahead (D1), kept on this phone: the dish chosen for a later day, whether its prep is done, and an evening
// suggestion the cook turned down (so it isn't offered again that night).
import "expo-sqlite/localStorage/install";

import { create } from "zustand";

const KEY = "cookmate.plan";
export type Plan = { recipeId: string; slug: string; title: string; forDate: string; prepDone: boolean };
type Saved = { plan: Plan | null; skipped: string | null };

function load(): Saved {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}") as Partial<Saved>;
    return { plan: v.plan ?? null, skipped: v.skipped ?? null };
  } catch {
    return { plan: null, skipped: null };
  }
}

function save(s: Saved) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {}
}

type PlanState = Saved & {
  setPlan: (plan: Plan | null) => void;
  markPrepDone: (done: boolean) => void;
  /** "Not now" for tonight's suggestion; remembered for that date only. */
  skip: (date: string) => void;
};

export const usePlan = create<PlanState>((set, get) => ({
  ...load(),
  setPlan: (plan) => {
    set({ plan });
    save({ plan, skipped: get().skipped });
  },
  markPrepDone: (prepDone) => {
    const plan = get().plan;
    if (!plan) return;
    const next = { ...plan, prepDone };
    set({ plan: next });
    save({ plan: next, skipped: get().skipped });
  },
  skip: (date) => {
    set({ skipped: date });
    save({ plan: get().plan, skipped: date });
  },
}));
