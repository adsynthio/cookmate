// KIT-130: the catalog's events, emitted from the service calls the app already makes, so screens don't each need
// tracking code. Only ids, codes and counts are passed; analytics.ts checks them again against the catalog.
import type { Services } from "./types";
import { setAnalyticsConsent, track } from "./analytics";

export function withAnalytics(inner: Services): Services {
  const { cooking, preference, kitchen, voice } = inner;
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
    },
    cooking: {
      ...cooking,
      async startSession(input) {
        const id = await cooking.startSession(input);
        track("cook_started", { session_id: id, mode: input.mode ?? "touch", recipe_id: input.recipeId, servings: input.servings });
        return id;
      },
      async advanceStep(sessionId, delta, channel = "touch") {
        const r = await cooking.advanceStep(sessionId, delta, channel);
        track("cook_step", { session_id: sessionId, step_no: r.currentStep, channel });
        return r;
      },
      async completeSession(sessionId) {
        const lines = await cooking.completeSession(sessionId);
        track("cook_completed", { session_id: sessionId });
        return lines;
      },
      async abandonSession(sessionId) {
        await cooking.abandonSession(sessionId);
        track("cook_abandoned", { session_id: sessionId, reason: "stopped" });
      },
      async rescue(input) {
        track("rescue_requested", { session_id: input.sessionId, problem: input.problem, channel: "touch" });
        return cooking.rescue(input);
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
