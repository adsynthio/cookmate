// KIT-130: the catalog's events, emitted from the service calls the app already makes, so screens don't each need
// tracking code. Only ids, codes and counts are passed; analytics.ts checks them again against the catalog.
import type { Services } from "./types";
import { setAnalyticsConsent, track } from "./analytics";

type CookStats = { startedAt: number; mode: string; taps: number; rescues: number };

export function withAnalytics(inner: Services): Services {
  const { cooking, preference, kitchen, voice, recipe } = inner;
  // What the catalog asks about a pick or a cooking session that only this phone knows, kept for this launch.
  const rankOf = new Map<string, number>();
  const cooks = new Map<string, CookStats>();
  let useSoonIds = new Set<string>();
  const shown = (batch: Awaited<ReturnType<typeof recipe.getPicks>>, source: string) => {
    const picks = [batch.hero, ...batch.alternates].filter((p) => !!p);
    picks.forEach((p, i) => rankOf.set(p.recommendationId, i));
    const hero = batch.hero;
    track("pick_shown", {
      batch_id: batch.batchId,
      meal_slot: batch.mealSlot,
      source,
      coverage_pct: hero?.total ? Math.round((hero.have / hero.total) * 100) : null,
    });
  };
  return {
    ...inner,
    preference: {
      ...preference,
      async recordConsents(input) {
        await preference.recordConsents(input);
        const analytics = input.consents.find((c) => c.purpose === "analytics");
        if (analytics) setAnalyticsConsent(analytics.granted);
        for (const c of input.consents) track("consent_changed", { consent_type: c.purpose, granted: c.granted });
      },
      async saveMemory(input) {
        const id = await preference.saveMemory(input);
        track("memory_saved", { category: input.category, scope: input.memberId ? "member" : "household", source: "app" });
        return id;
      },
      async forgetMemory(memoryId) {
        await preference.forgetMemory(memoryId);
        track("memory_forgotten", { channel: "touch" });
      },
      async setNotificationSettings(householdId, changes) {
        const next = await preference.setNotificationSettings(householdId, changes);
        if (changes.dailyPick !== undefined) track("consent_changed", { consent_type: "notifications", granted: next.dailyPick });
        return next;
      },
    },
    recipe: {
      ...recipe,
      async getPicks(input) {
        const batch = await recipe.getPicks(input);
        const asked = !!input.craving?.trim() || !!input.chips?.length;
        if (asked) track("craving_submitted", { chips: input.chips ?? [], channel: "touch", length_chars: input.craving?.trim().length ?? 0 });
        shown(batch, asked ? "craving" : "home");
        return batch;
      },
      async getBatch(householdId, batchId) {
        const batch = await recipe.getBatch(householdId, batchId);
        if (batch) {
          track("notification_opened", { type: "daily_pick" });
          shown(batch, "push");
        }
        return batch;
      },
      async respondToPick(recommendationId, status, reason) {
        await recipe.respondToPick(recommendationId, status, reason);
        if (status === "accepted") track("pick_accepted", { recommendation_id: recommendationId, rank: rankOf.get(recommendationId) ?? null, channel: "touch" });
        else track("pick_dismissed", { recommendation_id: recommendationId, reason: reason ?? "other" });
      },
      async getRecipe(idOrSlug) {
        const doc = await recipe.getRecipe(idOrSlug);
        track("recipe_viewed", { recipe_id: doc.id ?? doc.slug });
        return doc;
      },
      async adaptRecipe(input) {
        const r = await recipe.adaptRecipe(input);
        const kinds = (["missing", "spice", "servings", "missingEquipment", "diet", "maxTimeMin"] as const)
          .filter((k) => (Array.isArray(input[k]) ? (input[k] as unknown[]).length > 0 : input[k] !== undefined));
        track("recipe_adapted", { recipe_id: input.recipeId, change_types: kinds });
        return r;
      },
    },
    kitchen: {
      ...kitchen,
      async addItems(input) {
        const ids = await kitchen.addItems(input);
        const conf = input.items.map((i) => i.confidence).filter((c): c is number => typeof c === "number");
        track("inventory_added", {
          count: input.items.length,
          added_via: input.addedVia,
          parse_confidence_avg: conf.length ? Math.round((conf.reduce((a, b) => a + b, 0) / conf.length) * 100) / 100 : null,
        });
        return ids;
      },
      async getUseSoon(householdId, days) {
        const items = await kitchen.getUseSoon(householdId, days);
        useSoonIds = new Set(items.map((i) => i.id));
        if (items.length) track("use_soon_shown", { items_count: items.length });
        return items;
      },
      async updateItem(itemId, changes) {
        await kitchen.updateItem(itemId, changes);
        // "Still have this?" answers fix what decay made doubtful; other edits fix what was parsed or typed.
        const field = Object.keys(changes).find((k) => k !== "via") ?? "other";
        track("inventory_corrected", { field: changes.confirm ? "confirm" : field, source: changes.confirm ? "decay" : "parse" });
      },
      async addToList(householdId, items) {
        await kitchen.addToList(householdId, items);
        for (const i of items.slice(0, 12)) track("list_item_added", { reason: i.reason, channel: "touch" });
      },
      async markBought(householdId, itemIds) {
        const ids = await kitchen.markBought(householdId, itemIds);
        track("list_items_bought", { count: ids.length });
        return ids;
      },
    },
    cooking: {
      ...cooking,
      async startSession(input) {
        const id = await cooking.startSession(input);
        track("cook_started", { session_id: id, mode: input.mode ?? "touch", recipe_id: input.recipeId, servings: input.servings });
        cooks.set(id, { startedAt: Date.now(), mode: input.mode ?? "touch", taps: 0, rescues: 0 });
        return id;
      },
      async advanceStep(sessionId, delta, channel = "touch") {
        const r = await cooking.advanceStep(sessionId, delta, channel);
        track("cook_step", { session_id: sessionId, step_no: r.currentStep, channel });
        const c = cooks.get(sessionId);
        if (c && channel === "touch") c.taps++;
        return r;
      },
      async completeSession(sessionId) {
        const lines = await cooking.completeSession(sessionId);
        // Hands-free rate (BRD §3): taps after starting and the mode, when this launch saw the whole session.
        const c = cooks.get(sessionId);
        track("cook_completed", {
          session_id: sessionId,
          ...(c ? { duration_min: Math.round((Date.now() - c.startedAt) / 60_000), mode: c.mode, taps_after_start: c.taps, rescues: c.rescues } : {}),
        });
        cooks.delete(sessionId);
        return lines;
      },
      async abandonSession(sessionId) {
        await cooking.abandonSession(sessionId);
        track("cook_abandoned", { session_id: sessionId, reason: "stopped" });
        cooks.delete(sessionId);
      },
      async rescue(input) {
        track("rescue_requested", { session_id: input.sessionId, problem: input.problem, channel: "touch" });
        const c = cooks.get(input.sessionId);
        if (c) c.rescues++;
        return cooking.rescue(input);
      },
      async applyDeduction(sessionId, adjustments) {
        const ids = await cooking.applyDeduction(sessionId, adjustments);
        for (const a of adjustments.slice(0, 12)) {
          const field = a.skip ? "skip" : a.stapleLevel ? "staple_level" : a.quantity !== undefined ? "quantity" : null;
          if (field) track("inventory_corrected", { field, source: "deduction" });
        }
        track("inventory_consumed", { items_count: ids.length, use_soon_items_count: ids.filter((i) => useSoonIds.has(i)).length });
        return ids;
      },
      async submitFeedback(input) {
        await cooking.submitFeedback(input);
        track("feedback_submitted", { session_id: input.sessionId, rating: input.rating, tags_count: input.tags?.length ?? 0 });
      },
    },
    voice: {
      ...voice,
      async getToken(input) {
        const r = await voice.getToken(input);
        if (typeof r === "object") track("voice_session_started", { context: input.cookingSessionId ? "cook" : "home", language: r.languageCode });
        return r;
      },
    },
  };
}
