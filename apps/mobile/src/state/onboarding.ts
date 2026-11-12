// Onboarding draft (UI state only). Nothing reaches the backend until the consent step creates the household.
import { create } from "zustand";

import { addSetupItem, removeSetupItem, type SetupItem } from "@/domain/kitchenSetup";
import type { AgeGroup, ConsentPurpose, Cuisine, Diet, DraftAvoid, DraftMember, Pace, Spice } from "@/domain/onboarding";
import { MAX_MEMBERS } from "@/domain/onboarding";

let nextKey = 2;

type OnboardingState = {
  members: DraftMember[];
  spice: Spice;
  diet: Diet;
  consents: Partial<Record<ConsentPurpose, boolean>>;
  /** Kitchen setup: what's already at home (saved to the pantry once the household exists). */
  kitchen: SetupItem[];
  cuisines: Cuisine[];
  pace: Pace | null;
  avoid: DraftAvoid[];
  addKitchenItem: (item: SetupItem) => void;
  removeKitchenItem: (name: string) => void;
  toggleCuisine: (c: Cuisine) => void;
  setPace: (p: Pace) => void;
  addAvoid: (a: DraftAvoid) => void;
  removeAvoid: (ingredientKey: string) => void;
  setName: (key: string, name: string) => void;
  setAgeGroup: (key: string, ageGroup: AgeGroup) => void;
  addMember: () => void;
  removeMember: (key: string) => void;
  setSpice: (spice: Spice) => void;
  setDiet: (diet: Diet) => void;
  setConsent: (purpose: ConsentPurpose, granted: boolean) => void;
};

export const useOnboarding = create<OnboardingState>((set) => ({
  members: [{ key: "1", displayName: "", ageGroup: "adult", isSelf: true }],
  spice: 3,
  diet: "veg",
  consents: {},
  kitchen: [],
  cuisines: [],
  pace: null,
  avoid: [],
  addKitchenItem: (item) => set((s) => ({ kitchen: addSetupItem(s.kitchen, item) })),
  removeKitchenItem: (name) => set((s) => ({ kitchen: removeSetupItem(s.kitchen, name) })),
  toggleCuisine: (c) => set((s) => ({ cuisines: s.cuisines.includes(c) ? s.cuisines.filter((x) => x !== c) : [...s.cuisines, c] })),
  setPace: (pace) => set({ pace }),
  addAvoid: (a) => set((s) => ({ avoid: [...s.avoid.filter((x) => x.ingredientKey !== a.ingredientKey), a] })),
  removeAvoid: (key) => set((s) => ({ avoid: s.avoid.filter((x) => x.ingredientKey !== key) })),
  setName: (key, displayName) =>
    set((s) => ({ members: s.members.map((m) => (m.key === key ? { ...m, displayName } : m)) })),
  setAgeGroup: (key, ageGroup) =>
    set((s) => ({ members: s.members.map((m) => (m.key === key ? { ...m, ageGroup } : m)) })),
  addMember: () =>
    set((s) =>
      s.members.length >= MAX_MEMBERS
        ? s
        : { members: [...s.members, { key: String(nextKey++), displayName: "", ageGroup: "adult", isSelf: false }] },
    ),
  removeMember: (key) => set((s) => ({ members: s.members.filter((m) => m.key !== key || m.isSelf) })),
  setSpice: (spice) => set({ spice }),
  setDiet: (diet) => set({ diet }),
  setConsent: (purpose, granted) => set((s) => ({ consents: { ...s.consents, [purpose]: granted } })),
}));
