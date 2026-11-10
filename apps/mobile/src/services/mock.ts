// Mock services (EXPO_PUBLIC_USE_MOCKS=1). Data mirrors the Sunita persona from the PRD so screens can be
// built and demoed before the live backend exists for each feature.
import "expo-sqlite/localStorage/install";

import { useSoon } from "@/domain/pantry";

import { catalogEntry, catalogIndex } from "@/data/catalog";
import { parsePantryText } from "@/domain/pantryParse";

import { toDraft } from "./drafts";
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

type Seed = [id: string, key: string | null, name: string, qty: number | null, unit: string | null,
  location: PantryItem["location"], level: PantryItem["stapleLevel"], days: number | null, confidence: number];
const seed: Seed[] = [
  ["i1", "spinach", "spinach", 1, "bunch", "fridge", null, 1, 0.9],
  ["i2", "paneer", "paneer", 200, "g", "fridge", null, 2, 0.95],
  ["i3", "curd", "curd", 1, "katori", "fridge", null, 3, 0.8],
  ["i4", "tomato", "tomato", 2, "piece", "fridge", null, 5, 0.4],
  ["i5", "potato", "potato", 2, "kg", "pantry", null, 14, 0.9],
  ["i6", "onion", "onion", 1, "kg", "pantry", null, 20, 0.85],
  ["i7", "whole wheat flour", "whole wheat flour", null, null, "staples", "low", null, 0.9],
  ["i8", "gram flour", "gram flour", null, null, "staples", "full", null, 0.9],
  ["i9", null, "hari chutney", 1, "katori", "ready_made", null, 2, 0.9],
];
let pantry: PantryItem[] = seed.map(([id, ingredientKey, name, quantity, unit, location, stapleLevel, days, confidence]) => ({
  id, ingredientKey, name, quantity, unit, location, stapleLevel, confidence,
  expiryDate: days === null ? null : isoInDays(days),
  expiryEstimated: true,
  state: id === "i9" ? "homemade" : "raw",
  flavorRoles: id === "i9" ? ["heat", "acid"] : [],
}));
const finished = new Map<string, PantryItem>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());
let nextId = 100;

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
      return [...pantry];
    },
    async getUseSoon(_householdId, days = 3) {
      await delay(150);
      return useSoon(pantry, days);
    },
    async parseItems({ text }) {
      await delay(300);
      return { items: parsePantryText(text, catalogIndex).map(toDraft), source: "rules" };
    },
    async addItems({ items }) {
      await delay(250);
      const ids: string[] = [];
      for (const d of items) {
        const entry = catalogEntry(d.ingredientKey);
        const location = d.locationKind ?? entry?.location ?? "pantry";
        const existing = pantry.find(
          (p) => p.location === location && (d.ingredientKey ? p.ingredientKey === d.ingredientKey : p.name === d.said),
        );
        if (existing) {
          if (d.quantity !== null) existing.quantity = (existing.quantity ?? 0) + d.quantity;
          existing.confidence = 0.95;
          ids.push(existing.id);
          continue;
        }
        const days = entry?.life[location];
        const id = `i${nextId++}`;
        pantry.push({
          id,
          ingredientKey: d.ingredientKey,
          name: d.ingredientKey ?? d.said,
          quantity: d.quantity,
          unit: d.unit ?? (d.quantity !== null ? (entry?.unit ?? null) : null),
          location,
          stapleLevel: entry?.staple || location === "staples" ? "full" : null,
          expiryDate: days !== undefined ? isoInDays(days) : d.state === "homemade" ? isoInDays(5) : null,
          expiryEstimated: true,
          confidence: 0.95,
          state: d.state ?? "raw",
          flavorRoles: d.flavorRoles,
        });
        ids.push(id);
      }
      changed();
      return ids;
    },
    async updateItem(itemId, c) {
      const item = pantry.find((p) => p.id === itemId);
      if (!item) throw new Error("item not found");
      if (c.quantity !== undefined) item.quantity = c.quantity;
      if (c.unit !== undefined) item.unit = c.unit;
      if (c.stapleLevel !== undefined) item.stapleLevel = c.stapleLevel;
      if (c.locationKind !== undefined) item.location = c.locationKind;
      if (c.expiryDate !== undefined) {
        item.expiryDate = c.expiryDate;
        item.expiryEstimated = false;
      }
      if (c.customName !== undefined) item.name = c.customName;
      if (c.confirm || c.quantity !== undefined || c.stapleLevel !== undefined) item.confidence = 0.95;
      changed();
    },
    async finishItem(itemId) {
      const item = pantry.find((p) => p.id === itemId);
      if (!item) throw new Error("item not found");
      finished.set(itemId, item);
      pantry = pantry.filter((p) => p.id !== itemId);
      changed();
    },
    async reopenItem(itemId) {
      const item = finished.get(itemId);
      if (!item) throw new Error("item not found");
      finished.delete(itemId);
      pantry.push(item);
      changed();
    },
    async addToList() {
      await delay(150);
    },
    subscribe(_householdId, onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  },
  recipe: {
    async getPicks() {
      await delay(700);
      return picks;
    },
  },
};
