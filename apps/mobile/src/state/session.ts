// UI and session state (Zustand). Server data lives in TanStack Query, not here.
import { create } from "zustand";

import { localHour, slotForHour } from "@/domain/ranking";
import type { MealSlot } from "@/services";

export type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

type SessionState = {
  householdId: string | null;
  memberId: string | null;
  /** False until the app has checked for an existing household on launch. */
  ready: boolean;
  mealSlot: MealSlot;
  /** KIT-057: member ids eating today; null = everyone. */
  whoEating: string[] | null;
  voice: VoiceState;
  setHousehold: (householdId: string, memberId: string) => void;
  setReady: () => void;
  setMealSlot: (slot: MealSlot) => void;
  setWhoEating: (ids: string[] | null) => void;
  setVoice: (state: VoiceState) => void;
  /** After the account is deleted: back to a fresh start (onboarding). */
  clear: () => void;
};

/** HOME-05: meal slot from the time of day in the household's timezone (India for now). */
export function currentSlot(now: Date = new Date(), timeZone = "Asia/Kolkata"): MealSlot {
  return slotForHour(localHour(now, timeZone));
}

export const useSession = create<SessionState>((set) => ({
  householdId: null,
  memberId: null,
  ready: false,
  mealSlot: currentSlot(),
  whoEating: null,
  voice: "idle",
  setHousehold: (householdId, memberId) => set({ householdId, memberId }),
  setReady: () => set({ ready: true }),
  setMealSlot: (mealSlot) => set({ mealSlot }),
  setWhoEating: (whoEating) => set({ whoEating }),
  setVoice: (voice) => set({ voice }),
  clear: () => set({ householdId: null, memberId: null, whoEating: null, voice: "idle" }),
}));
