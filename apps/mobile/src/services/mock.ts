// Mock services (EXPO_PUBLIC_USE_MOCKS=1). Data mirrors the Sunita persona from the PRD so screens can be
// built and demoed before the live backend exists for each feature.
import "expo-sqlite/localStorage/install";

import { useSoon } from "@/domain/pantry";

import type { HouseholdRef, Memory, PantryItem, PickBatch, Services } from "./types";

// The mock "backend" remembers the onboarded household on the device, so restarts skip onboarding
// just like the live app. Clear app data (or call resetMockHousehold) to see onboarding again.
const HOUSEHOLD_KEY = "cookmate.mock.household";

function readHousehold(): HouseholdRef | null {
  try {
    const raw = globalThis.localStorage?.getItem(HOUSEHOLD_KEY);
    return raw ? (JSON.parse(raw) as HouseholdRef) : null;
  } catch {
    return null;
  }
}

export function resetMockHousehold() {
  globalThis.localStorage?.removeItem(HOUSEHOLD_KEY);
}

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const pantry: PantryItem[] = [
  { id: "i1", name: "Palak", quantity: 1, unit: "bunch", location: "fridge", stapleLevel: null, expiryDate: isoInDays(1), expiryEstimated: true, confidence: 0.9 },
  { id: "i2", name: "Paneer", quantity: 200, unit: "g", location: "fridge", stapleLevel: null, expiryDate: isoInDays(2), expiryEstimated: false, confidence: 0.95 },
  { id: "i3", name: "Dahi", quantity: 1, unit: "katori", location: "fridge", stapleLevel: null, expiryDate: isoInDays(3), expiryEstimated: true, confidence: 0.8 },
  { id: "i4", name: "Tamatar", quantity: 2, unit: "piece", location: "fridge", stapleLevel: null, expiryDate: isoInDays(5), expiryEstimated: true, confidence: 0.7 },
  { id: "i5", name: "Aloo", quantity: 2, unit: "kg", location: "pantry", stapleLevel: null, expiryDate: isoInDays(14), expiryEstimated: true, confidence: 0.9 },
  { id: "i6", name: "Pyaaz", quantity: 1, unit: "kg", location: "pantry", stapleLevel: null, expiryDate: isoInDays(20), expiryEstimated: true, confidence: 0.85 },
  { id: "i7", name: "Atta", quantity: null, unit: null, location: "staples", stapleLevel: "low", expiryDate: null, expiryEstimated: true, confidence: 0.9 },
  { id: "i8", name: "Besan", quantity: null, unit: null, location: "staples", stapleLevel: "full", expiryDate: null, expiryEstimated: true, confidence: 0.9 },
  { id: "i9", name: "Hari chutney", quantity: 1, unit: "katori", location: "ready_made", stapleLevel: null, expiryDate: isoInDays(2), expiryEstimated: true, confidence: 0.9 },
];

let memories: Memory[] = [
  { id: "m1", statement: "You like extra garlic", source: "explicit", scope: "permanent", memberName: "Sunita" },
  { id: "m2", statement: "Aarav prefers mild food", source: "onboarding", scope: "permanent", memberName: "Aarav" },
  { id: "m3", statement: "Weekday dinners under 30 minutes", source: "observed", scope: "permanent", memberName: null },
];

const picks: PickBatch = {
  batchId: "b1",
  mealSlot: "dinner",
  hero: {
    recommendationId: "r1",
    recipeId: "palak-paneer",
    title: "Palak paneer",
    reason: "Uses your palak before it wilts — kept mild for Aarav",
    uses: ["Palak", "Paneer", "Pyaaz"],
    missing: [],
    totalTimeMin: 35,
    imageUrl: null,
  },
  alternates: [
    { recommendationId: "r2", recipeId: "besan-aloo-sabzi", title: "Besan wali aloo sabzi", reason: "Quick, all from your kitchen", uses: ["Aloo", "Besan", "Dahi"], missing: [], totalTimeMin: 25, imageUrl: null },
    { recommendationId: "r3", recipeId: "aloo-pyaaz-pakode", title: "Aloo pyaaz pakode", reason: "Goes with your hari chutney", uses: ["Aloo", "Pyaaz", "Besan", "Hari chutney"], missing: [], totalTimeMin: 20, imageUrl: null },
  ],
};

export const mockServices: Services = {
  auth: {
    async ensureSignedIn() {
      return { userId: "mock-user", isAnonymous: true };
    },
    async getCurrentHousehold() {
      return readHousehold();
    },
  },
  preference: {
    async createHousehold({ language, members }) {
      await delay();
      if (members.length < 1 || members.length > 6) throw new Error("a household has 1 to 6 members");
      const ref: HouseholdRef = { householdId: "mock-household", memberId: "mock-member", languageCode: language };
      globalThis.localStorage?.setItem(HOUSEHOLD_KEY, JSON.stringify(ref));
      return { householdId: ref.householdId, memberId: ref.memberId };
    },
    async recordConsents() {
      await delay(100);
    },
    async listMemories() {
      await delay(200);
      return memories;
    },
    async forgetMemory(id) {
      memories = memories.filter((m) => m.id !== id);
    },
    async keepMemory() {},
  },
  kitchen: {
    async getKitchen() {
      await delay(250);
      return pantry;
    },
    async getUseSoon(_householdId, days = 3) {
      await delay(150);
      return useSoon(pantry, days);
    },
  },
  recipe: {
    async getPicks() {
      await delay(700);
      return picks;
    },
  },
};
