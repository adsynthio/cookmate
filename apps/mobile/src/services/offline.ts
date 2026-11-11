// KIT-076: cooking keeps working when the network drops. Reads fall back to what the phone kept when cooking started
// (offline/bundles.ts); writes that can't reach the server wait in the outbox and replay in order later. While a
// write for a session is still waiting, later writes for it queue behind it, so the server sees them in order.
import { changeReply } from "@/domain/assist";
import { localeFromLanguageCode } from "@/domain/onboarding";
import { isNetworkError, type Call, type Op } from "@/domain/outbox";
import { bundleForRecipe, getBundle, latestBundle, putBundle } from "@/offline/bundles";
import { hasPending, startOutbox, useOutbox } from "@/offline/outbox";

import type { Services } from "./types";

/** Runs a write now, or queues it when the network is down or earlier writes for the session are still waiting. */
async function write<T>(call: Call, sessionId: string | null, args: unknown[], now: () => Promise<T>, queued: () => T): Promise<T> {
  if (sessionId && hasPending(sessionId)) {
    useOutbox.getState().add(call, sessionId, args);
    return queued();
  }
  try {
    const r = await now();
    void useOutbox.getState().flush();
    return r;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    useOutbox.getState().add(call, sessionId, args);
    return queued();
  }
}

/** Reads from the server, and from the phone when the network is down. */
async function read<T>(now: () => Promise<T>, kept: () => T | null): Promise<T> {
  try {
    const r = await now();
    void useOutbox.getState().flush();
    return r;
  } catch (e) {
    const k = isNetworkError(e) ? kept() : null;
    if (k === null) throw e;
    return k;
  }
}

/** Replays one queued write against the server. */
export function replay(inner: Services): (op: Op) => Promise<void> {
  return async (op) => {
    const a = op.args as [never, never, never];
    switch (op.call) {
      case "cooking.advanceStep":
        await inner.cooking.advanceStep(a[0], a[1], a[2]);
        return;
      case "cooking.reportChange":
        await inner.cooking.reportChange(a[0]);
        return;
      case "cooking.finish": {
        // Finished with no network: the cook never saw the preview, so the recipe's own amounts come off.
        await inner.cooking.completeSession(a[0]);
        try {
          await inner.cooking.applyDeduction(a[0], []);
        } catch (e) {
          if ((e as { code?: string }).code !== "23505") throw e; // Already deducted: nothing to do.
        }
        return;
      }
      case "cooking.applyDeduction":
        await inner.cooking.applyDeduction(a[0], a[1]);
        return;
      case "cooking.submitFeedback":
        await inner.cooking.submitFeedback(a[0]);
        return;
      case "cooking.abandonSession":
        await inner.cooking.abandonSession(a[0]);
        return;
      case "preference.saveMemory":
        await inner.preference.saveMemory(a[0]);
        return;
      case "kitchen.addItems":
        await inner.kitchen.addItems(a[0]);
        return;
    }
  };
}

export function withOffline(inner: Services): Services {
  const { cooking, recipe, preference, kitchen } = inner;
  startOutbox(replay(inner));

  const localStep = (sessionId: string, delta: number) => {
    const b = getBundle(sessionId);
    const total = b?.doc?.steps.length ?? Math.max(1, (b?.session.currentStep ?? 1) + delta);
    const currentStep = Math.max(1, Math.min(total, (b?.session.currentStep ?? 1) + delta));
    if (b) putBundle(sessionId, { session: { ...b.session, currentStep } });
    return { currentStep, total };
  };

  return {
    ...inner,
    recipe: {
      ...recipe,
      getRecipe: (idOrSlug) => read(() => recipe.getRecipe(idOrSlug), () => bundleForRecipe(idOrSlug)),
    },
    preference: {
      ...preference,
      saveMemory: (input) => write("preference.saveMemory", null, [input], () => preference.saveMemory(input), () => "queued"),
    },
    kitchen: {
      ...kitchen,
      addItems: (input) => write("kitchen.addItems", null, [input], () => kitchen.addItems(input), () => []),
    },
    cooking: {
      ...cooking,
      async getSession(sessionId) {
        const kept = getBundle(sessionId);
        const s = await read(
          () => cooking.getSession(sessionId),
          () => (kept ? (kept.finishedOffline ? { ...kept.session, status: "completed" as const } : kept.session) : null),
        );
        // The phone is ahead of the server while moves are queued: trust where the cook actually is.
        if (kept && hasPending(sessionId)) return { ...s, currentStep: kept.session.currentStep, changes: kept.session.changes };
        if (kept) putBundle(sessionId, { session: s });
        return s;
      },
      getActiveSession: (householdId) =>
        read(
          () => cooking.getActiveSession(householdId),
          () => latestBundle(householdId)?.session ?? null,
        ),
      advanceStep(sessionId, delta, channel = "touch") {
        const local = localStep(sessionId, delta);
        return write("cooking.advanceStep", sessionId, [sessionId, delta, channel], () => cooking.advanceStep(sessionId, delta, channel), () => local);
      },
      reportChange(input) {
        return write("cooking.reportChange", input.sessionId, [input], () => cooking.reportChange(input), () => {
          const b = getBundle(input.sessionId);
          if (b) putBundle(input.sessionId, { session: { ...b.session, changes: [...b.session.changes, { change: input.change, notes: [] }] } });
          return { reply: changeReply([], localeFromLanguageCode(input.languageCode) ?? "en"), notes: [], source: "rules" as const };
        });
      },
      completeSession(sessionId) {
        return write("cooking.finish", sessionId, [sessionId], () => cooking.completeSession(sessionId), () => {
          putBundle(sessionId, { finishedOffline: true });
          return [];
        });
      },
      applyDeduction: (sessionId, adjustments) =>
        write("cooking.applyDeduction", sessionId, [sessionId, adjustments], () => cooking.applyDeduction(sessionId, adjustments), () => []),
      submitFeedback: (input) => write("cooking.submitFeedback", input.sessionId, [input], () => cooking.submitFeedback(input), () => undefined),
      abandonSession: (sessionId) => write("cooking.abandonSession", sessionId, [sessionId], () => cooking.abandonSession(sessionId), () => undefined),
    },
  };
}
