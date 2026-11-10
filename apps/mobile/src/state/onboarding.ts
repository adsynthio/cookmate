// Onboarding draft (UI state only). Nothing reaches the backend until the consent step creates the household.
import { create } from "zustand";

import type { AgeGroup, ConsentPurpose, Diet, DraftMember, Spice } from "@/domain/onboarding";
import { MAX_MEMBERS } from "@/domain/onboarding";

let nextKey = 2;

type OnboardingState = {
  members: DraftMember[];
  spice: Spice;
  diet: Diet;
  consents: Partial<Record<ConsentPurpose, boolean>>;
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
