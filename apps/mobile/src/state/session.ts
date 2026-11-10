// UI and session state (Zustand). Server data lives in TanStack Query, not here.
import { create } from "zustand";

import type { MealSlot } from "@/services";

export type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

type SessionState = {
  householdId: string | null;
  memberId: string | null;
  /** False until the app has checked for an existing household on launch. */
  ready: boolean;
  mealSlot: MealSlot;
  voice: VoiceState;
  setHousehold: (householdId: string, memberId: string) => void;
  setReady: () => void;
  setMealSlot: (slot: MealSlot) => void;
  setVoice: (state: VoiceState) => void;
};

/** HOME-05: meal slot from the time of day. */
export function slotForHour(hour: number): MealSlot {
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 18) return "snack";
  return "dinner";
}

export const useSession = create<SessionState>((set) => ({
  householdId: null,
  memberId: null,
  ready: false,
  mealSlot: slotForHour(new Date().getHours()),
  voice: "idle",
  setHousehold: (householdId, memberId) => set({ householdId, memberId }),
  setReady: () => set({ ready: true }),
  setMealSlot: (mealSlot) => set({ mealSlot }),
  setVoice: (voice) => set({ voice }),
}));
