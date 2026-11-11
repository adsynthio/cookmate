// Mock services (EXPO_PUBLIC_USE_MOCKS=1). Data mirrors the Sunita persona from the PRD so screens can be
// built and demoed before the live backend exists for each feature.
import "expo-sqlite/localStorage/install";

import { useSoon } from "@/domain/pantry";

import { catalog, catalogEntry, catalogIndex } from "@/data/catalog";
import { parsePantryText } from "@/domain/pantryParse";

import { toDraft } from "./drafts";
import { recipeBySlug, recipeDocs } from "@/data/recipes";
import { localHour, slotForHour } from "@/domain/ranking";
import { applyRules, ingredientFitsDiet, summarise, validateAdaptation } from "@/domain/adapt";
import { searchRecipes, toSummary, type RecipeDoc } from "@/domain/recipes";

import { deductionPreview } from "@/domain/cooking";

import { localeFromLanguageCode } from "@/domain/onboarding";

import { buildPicks, findIngredients } from "./picks";
import { changeReply, fallbackAnswer } from "@/domain/assist";

import { localRescue } from "./rescue";
import { DEFAULT_PROFILE, type VoiceProfile } from "@/domain/voiceStyle";
import type { CookSession, HouseholdRef, ListLine, Member, Memory, PantryItem, Services } from "./types";

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

const isoOrNull = (days: number | null) => (days === null ? null : isoInDays(days));

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
/** Cooked food keeps for days, whatever it was made from (same rule as private.estimate_expiry). */
function cookedLife(state: PantryItem["state"], location: PantryItem["location"]): number | null {
  if (state !== "cooked" && state !== "leftover" && state !== "homemade") return null;
  return location === "freezer" ? 30 : location === "ready_made" ? 5 : location === "fridge" ? 3 : 1;
}
let list: ListLine[] = [];
const finished = new Map<string, PantryItem>();
/** Items added as guesses from yesterday's dish (KIT-026). */
const guesses = new Set<string>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());
let nextId = 100;

const plain = { memberId: null, recipeId: null, about: null, polarity: 0 as const, amount: null, ingredientKey: null };
let memories: Memory[] = [
  { ...plain, id: "m1", statement: "You like extra garlic", source: "explicit", scope: "permanent", memberName: "Sunita", about: "amount", amount: "more", ingredientKey: "garlic" },
  { ...plain, id: "m2", statement: "Aarav prefers mild food", source: "onboarding", scope: "permanent", memberName: "Aarav" },
  { ...plain, id: "m3", statement: "Weekday dinners under 30 minutes", source: "observed", scope: "permanent", memberName: null },
];
const favourites: string[] = [];
const voiceProfiles = new Map<string, VoiceProfile>();
let mockPhone: string | null = null;
let pendingPhone: string | null = null;
const dismissedToday = new Set<string>();
/** Subject of each saved memory ("recipe:about"), for the replace rule. */
const subjects = new Map<string, string>();

// The Sunita household from the PRD, used when the mock household was created before members were stored.
const PERSONA: Member[] = [
  { id: "mock-member", displayName: "Sunita", ageGroup: "adult", diet: "veg", spice: 3, notes: null },
  { id: "mock-rakesh", displayName: "Rakesh", ageGroup: "adult", diet: "veg", spice: 4, notes: "less oil" },
  { id: "mock-aarav", displayName: "Aarav", ageGroup: "child", diet: "veg", spice: 1, notes: null },
];
const MEMBERS_KEY = "cookmate.mock.members";

function readMembers(): Member[] {
  try {
    const raw = globalThis.localStorage?.getItem(MEMBERS_KEY);
    return raw ? (JSON.parse(raw) as Member[]) : PERSONA;
  } catch {
    return PERSONA;
  }
}

/** Recipes cooked or accepted, for "no repeat within 3 days". */
const recent: { recipeId: string; at: number }[] = [];
const shown = new Map<string, string>(); // recommendationId -> recipeId
let batchNo = 1;
/** Cooking sessions (KIT-070), kept for the app session. */
const sessions = new Map<string, CookSession>();
const deducted = new Set<string>();
let sessionNo = 1;

/** The household's adapted variants (KIT-051), kept for the session. */
const adapted = new Map<string, RecipeDoc>();
let adaptedNo = 1;

export const mockServices: Services = {
  auth: {
    async ensureSignedIn() {
      return { userId: "mock-user", isAnonymous: mockPhone === null };
    },
    async getPhone() {
      return mockPhone;
    },
    async exportData() {
      await delay(400);
      // Mock mode: the export is a JSON file of what this device holds, as a data link.
      const body = JSON.stringify({ household: readHousehold(), memories, pantry, favourites }, null, 2);
      return { url: `data:application/json;charset=utf-8,${encodeURIComponent(body)}`, expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    },
    async deleteAccount(confirm) {
      await delay(300);
      if (!["DELETE", "हटाएँ", "HATAO"].includes(confirm.trim().toUpperCase())) throw new Error("confirmation_required");
      resetMockHousehold();
      mockPhone = null;
    },
    async startPhoneLink(phone) {
      await delay(300);
      pendingPhone = phone;
      return "sent";
    },
    async confirmPhoneLink(phone, code) {
      await delay(300);
      // Mock mode: the code is always 123456.
      if (phone !== pendingPhone || code !== "123456") return false;
      mockPhone = phone;
      pendingPhone = null;
      return true;
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
      const stored: Member[] = members.map((m, i) => ({
        id: m.isSelf ? "mock-member" : `mock-m${i}`,
        displayName: m.displayName,
        ageGroup: m.ageGroup ?? "adult",
        diet: m.diet ?? "veg",
        spice: m.spice ?? 3,
        notes: null,
      }));
      globalThis.localStorage?.setItem(MEMBERS_KEY, JSON.stringify(stored));
      return { householdId: ref.householdId, memberId: ref.memberId };
    },
    async recordConsents() {
      await delay(100);
    },
    async listMembers() {
      await delay(150);
      return readMembers();
    },
    async listMemories() {
      await delay(200);
      return memories;
    },
    async forgetMemory(id) {
      memories = memories.filter((m) => m.id !== id);
      subjects.delete(id);
    },
    async keepMemory() {},
    async saveMemory(input) {
      await delay(150);
      const same = memories.find((m) => m.statement.toLowerCase() === input.statement.trim().toLowerCase());
      if (same) return same.id;
      // A newer memory about the same person, ingredient, aspect and dish replaces the older one.
      const subject = (m: { memberId?: string | null; ingredientKey?: string | null; about?: string | null; recipeId?: string | null }) =>
        `${m.memberId ?? ""}:${m.ingredientKey ?? ""}:${m.about ?? ""}:${m.recipeId ?? ""}`;
      if (input.about || input.ingredientKey) memories = memories.filter((m) => subject(m) !== subject(input));
      const id = `m${nextId++}`;
      if (input.about) subjects.set(id, `${input.recipeId ?? ""}:${input.about}`);
      const member = readMembers().find((m) => m.id === input.memberId);
      memories = [
        {
          id,
          statement: input.statement.trim(),
          source: "explicit",
          scope: "permanent",
          memberId: input.memberId ?? null,
          memberName: member?.displayName ?? null,
          recipeId: input.recipeId ?? null,
          about: input.about ?? null,
          polarity: input.polarity ?? 0,
          amount: input.amount ?? null,
          ingredientKey: input.ingredientKey ?? null,
        },
        ...memories,
      ];
      return id;
    },
    async getVoiceProfile(memberId) {
      await delay(100);
      return { ...DEFAULT_PROFILE, ...voiceProfiles.get(memberId) };
    },
    async updateVoiceProfile(memberId, changes) {
      await delay(100);
      voiceProfiles.set(memberId, { ...DEFAULT_PROFILE, ...voiceProfiles.get(memberId), ...changes });
    },
    async updateMemory(id, statement) {
      await delay(150);
      // The user's own words replace ours; what we had worked out from the old wording no longer applies.
      memories = memories.map((m) => (m.id === id ? { ...m, statement: statement.trim(), source: "correction", polarity: 0, about: null, amount: null, ingredientKey: null } : m));
    },
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
          expiryDate: isoOrNull(cookedLife(d.state ?? "raw", location) ?? days ?? null),
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
      if (c.confirm || c.quantity !== undefined || c.stapleLevel !== undefined) {
        item.confidence = 0.95;
        item.guess = false;
      }
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
    async guessFromRecipe(_householdId, recipeId) {
      await delay(300);
      const doc = recipeBySlug(recipeId);
      if (!doc) throw new Error("recipe not found");
      const have = new Set(pantry.map((p) => p.ingredientKey));
      const ids: string[] = [];
      for (const i of doc.ingredients) {
        if (i.optional || have.has(i.ingredient)) continue;
        have.add(i.ingredient);
        const entry = catalogEntry(i.ingredient);
        const location = entry?.location ?? "pantry";
        const days = entry?.life[location];
        const id = `i${nextId++}`;
        pantry.push({
          id,
          ingredientKey: i.ingredient,
          name: i.ingredient,
          quantity: null,
          unit: null,
          location,
          stapleLevel: entry?.staple || location === "staples" ? "full" : null,
          expiryDate: days !== undefined ? isoInDays(days) : null,
          expiryEstimated: true,
          confidence: 0.4,
          state: "raw",
          flavorRoles: [],
          guess: true,
        });
        guesses.add(id);
        ids.push(id);
      }
      changed();
      return ids;
    },
    async clearGuesses(_householdId, itemIds) {
      const before = pantry.length;
      pantry = pantry.filter((p) => !(guesses.has(p.id) && p.confidence <= 0.5 && (!itemIds || itemIds.includes(p.id))));
      changed();
      return before - pantry.length;
    },
    async addToList(_householdId, items) {
      await delay(150);
      for (const i of items) {
        const key = catalogEntry(i.name)?.name ?? findIngredients(i.name)[0] ?? null;
        const same = list.find((l) => (key ? l.ingredientKey === key : l.name.toLowerCase() === i.name.trim().toLowerCase()));
        if (!same) list = [...list, { id: `l${nextId++}`, ingredientKey: key, name: key ?? i.name.trim(), quantity: null, unit: null, reason: i.reason }];
      }
    },
    async getList() {
      await delay(200);
      return [...list];
    },
    async markBought(householdId, itemIds) {
      await delay(250);
      const bought = list.filter((l) => !itemIds || itemIds.includes(l.id));
      list = list.filter((l) => !bought.includes(l));
      if (!bought.length) return [];
      const ids = await mockServices.kitchen.addItems({
        householdId,
        addedVia: "manual",
        items: bought.map((l) => ({
          key: l.id, said: l.name, ingredientKey: l.ingredientKey, quantity: l.quantity, unit: l.unit,
          locationKind: null, state: null, flavorRoles: [], confidence: 1,
        })),
      });
      // A staple that was Low or Out is Full again.
      for (const p of pantry) if (ids.includes(p.id) && p.stapleLevel) p.stapleLevel = "full";
      changed();
      return ids;
    },
    async removeFromList(itemId) {
      list = list.filter((l) => l.id !== itemId);
    },
    subscribe(_householdId, onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  },
  recipe: {
    async getPicks(input) {
      await delay(600);
      const slot = input.mealSlot ?? slotForHour(localHour(new Date(), "Asia/Kolkata"));
      const now = Date.now();
      // KIT-105: plain likes and dislikes of the people eating (or of the whole household).
      const eating = input.whoEating?.length ? input.whoEating : null;
      const prefs = memories.filter(
        (m) => m.ingredientKey && m.recipeId === null && (m.about ?? "preference") === "preference" && (!eating || !m.memberId || eating.includes(m.memberId)),
      );
      const batch = buildPicks({
        avoid: prefs.filter((m) => m.polarity < 0).map((m) => m.ingredientKey!),
        like: prefs.filter((m) => m.polarity > 0).map((m) => m.ingredientKey!),
        // Left out: dishes turned down today, and dishes the household said it doesn't like.
        docs: recipeDocs.filter((d) => !dismissedToday.has(d.slug) && ![...subjects.values()].includes(`${d.slug}:dislike`)),
        items: pantry,
        members: readMembers(),
        input,
        slot,
        recent: recent.map((r) => ({ recipeId: r.recipeId, daysAgo: Math.floor((now - r.at) / 86_400_000) })),
        batchId: `b${batchNo++}`,
      });
      for (const p of [batch.hero, ...batch.alternates]) if (p) shown.set(p.recommendationId, p.recipeId);
      return batch;
    },
    async respondToPick(recommendationId, status) {
      const recipeId = shown.get(recommendationId);
      if (status === "accepted" && recipeId) recent.push({ recipeId, at: Date.now() });
      // KIT-044: a dish turned down is not offered again today.
      if (status === "dismissed" && recipeId) dismissedToday.add(recipeId);
    },
    async adaptRecipe(input) {
      await delay(500);
      const base = adapted.get(input.recipeId) ?? recipeBySlug(input.recipeId);
      if (!base) throw new Error("recipe not found");
      const a = applyRules(base, input);
      const byName = new Map(catalog.map((c) => [c.name, c]));
      const problems = validateAdaptation(base, a, {
        known: (k) => byName.has(k),
        allowed: (d, k) => ingredientFitsDiet(d, byName.get(k)),
        diet: input.diet,
      });
      const summary = summarise(a);
      if (problems.length) return { adaptedRecipeId: null, summary, changedSteps: [], unresolved: a.unresolved };
      const id = `adapted-${adaptedNo++}`;
      adapted.set(id, { ...a.doc, id, slug: base.slug, parent_id: base.id ?? base.slug, description: summary || base.description });
      return { adaptedRecipeId: id, summary, changedSteps: a.changedSteps, unresolved: [] };
    },
    async getRecipe(idOrSlug) {
      await delay(200);
      const doc = adapted.get(idOrSlug) ?? recipeBySlug(idOrSlug);
      if (!doc) throw new Error("recipe not found");
      return doc;
    },
    async listFavourites() {
      await delay(120);
      return favourites.map((slug) => recipeBySlug(slug)).filter((d): d is RecipeDoc => !!d).map(toSummary);
    },
    async setFavourite({ recipeId, on }) {
      await delay(80);
      const slug = adapted.get(recipeId)?.slug ?? recipeId;
      const at = favourites.indexOf(slug);
      if (on && at < 0) favourites.unshift(slug);
      if (!on && at >= 0) favourites.splice(at, 1);
    },
    async searchRecipes(query) {
      await delay(150);
      const byName = new Map(catalog.map((c) => [c.name, c]));
      return searchRecipes(recipeDocs, query, (k) => {
        const c = byName.get(k);
        return c ? [c.hi ?? "", c.latn ?? "", ...(c.aliases ?? [])] : [];
      }).map(toSummary);
    },
  },
  cooking: {
    async startSession({ recipeId, servings, whoEating, recommendationId }) {
      await delay(250);
      if (!adapted.get(recipeId) && !recipeBySlug(recipeId)) throw new Error("recipe not found");
      for (const s of sessions.values()) if (s.status === "active") s.status = "abandoned";
      const id = `s${sessionNo++}`;
      sessions.set(id, { id, recipeId, currentStep: 1, servings, whoEating, status: "active", changes: [] });
      if (recommendationId) await mockServices.recipe.respondToPick(recommendationId, "accepted");
      return id;
    },
    async getSession(sessionId) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error("session not found");
      return { ...s };
    },
    async getActiveSession() {
      return [...sessions.values()].find((s) => s.status === "active") ?? null;
    },
    async advanceStep(sessionId, delta) {
      const s = sessions.get(sessionId);
      if (!s) throw new Error("session not found");
      const doc = adapted.get(s.recipeId) ?? recipeBySlug(s.recipeId)!;
      s.currentStep = Math.max(1, Math.min(doc.steps.length, s.currentStep + delta));
      return { currentStep: s.currentStep, total: doc.steps.length };
    },
    async ask({ sessionId, question, languageCode }) {
      await delay(400);
      const s = sessions.get(sessionId);
      if (!s) throw new Error("session not found");
      const doc = adapted.get(s.recipeId) ?? recipeBySlug(s.recipeId)!;
      return fallbackAnswer(doc.steps[s.currentStep - 1]!, question, localeFromLanguageCode(languageCode) ?? "en");
    },
    async reportChange({ sessionId, change, languageCode }) {
      await delay(400);
      const s = sessions.get(sessionId);
      if (!s || s.status !== "active") throw new Error("session not found");
      s.changes = [...s.changes, { change: change.trim(), notes: [] }];
      return { reply: changeReply([], localeFromLanguageCode(languageCode) ?? "en"), notes: [], source: "rules" };
    },
    async rescue({ sessionId, problem, missing, details, languageCode }) {
      await delay(400);
      const s = sessions.get(sessionId);
      if (!s) throw new Error("session not found");
      const doc = adapted.get(s.recipeId) ?? recipeBySlug(s.recipeId)!;
      return localRescue(doc, pantry, { problem, missing, details }, localeFromLanguageCode(languageCode) ?? "en");
    },
    async abandonSession(sessionId) {
      const s = sessions.get(sessionId);
      if (s && s.status === "active") s.status = "abandoned";
    },
    async completeSession(sessionId) {
      await delay(300);
      const s = sessions.get(sessionId);
      if (!s) throw new Error("session not found");
      s.status = "completed";
      const doc = adapted.get(s.recipeId) ?? recipeBySlug(s.recipeId)!;
      return deductionPreview(
        doc,
        s.servings,
        pantry.filter((p) => p.confidence >= 0.5 || p.stapleLevel).map((p) => ({ ...p, unit: p.unit })),
        (k) => catalogEntry(k)?.measures,
      );
    },
    async applyDeduction(sessionId, adjustments) {
      await delay(300);
      if (deducted.has(sessionId)) throw new Error("already deducted for this session");
      const lines = await mockServices.cooking.completeSession(sessionId);
      const changedIds: string[] = [];
      for (const line of lines) {
        const adj = adjustments.find((a) => a.itemId === line.itemId);
        if (adj?.skip) continue;
        const item = pantry.find((p) => p.id === line.itemId);
        if (!item) continue;
        if (line.staple) {
          if (adj?.stapleLevel) {
            item.stapleLevel = adj.stapleLevel;
            changedIds.push(item.id);
          }
          continue;
        }
        const used = adj?.quantity ?? line.quantity;
        if (!used || item.quantity === null) continue;
        item.quantity = Math.max(0, Math.round((item.quantity - used) * 1000) / 1000);
        item.confidence = 0.95;
        if (item.quantity === 0) pantry = pantry.filter((p) => p.id !== item.id);
        changedIds.push(item.id);
      }
      deducted.add(sessionId);
      changed();
      return changedIds;
    },
    async submitFeedback() {
      await delay(200);
    },
  },
  voice: {
    // Mock mode has no voice backend.
    async getToken() {
      await delay(400);
      return "not_configured";
    },
  },
};
