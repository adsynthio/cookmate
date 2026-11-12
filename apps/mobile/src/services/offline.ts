// KIT-076: cooking keeps working when the network drops. Reads fall back to what the phone kept when cooking started
// (offline/bundles.ts); writes that can't reach the server wait in the outbox and replay in order later. While a
// write for a session is still waiting, later writes for it queue behind it, so the server sees them in order.
// The kitchen and the shopping list work the same way (NFR-05): the phone keeps the last copy it saw, edits made
// offline show on that copy at once and replay in order when the network is back.
import { changeReply } from "@/domain/assist";
import { localeFromLanguageCode } from "@/domain/onboarding";
import { replayable, type KitchenEdit } from "@/domain/kitchenOffline";
import { isNetworkError, type Call, type Op } from "@/domain/outbox";
import { useSoon } from "@/domain/pantry";
import { editCopy, getCopy, householdOf, putCopy } from "@/offline/kitchenCopy";
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
      case "kitchen.updateItem":
        if (replayable({ call: op.call, itemId: a[0], changes: a[1] })) await inner.kitchen.updateItem(a[0], a[1]);
        return;
      case "kitchen.finishItem":
        if (replayable({ call: op.call, itemId: a[0] })) await inner.kitchen.finishItem(a[0], a[1]);
        return;
      case "kitchen.reopenItem":
        if (replayable({ call: op.call, itemId: a[0] })) await inner.kitchen.reopenItem(a[0]);
        return;
      case "kitchen.addToList":
        await inner.kitchen.addToList(a[0], a[1]);
        return;
      case "kitchen.markBought": {
        const all = a[1] as string[] | undefined;
        if (!all?.length) {
          await inner.kitchen.markBought(a[0], undefined);
          return;
        }
        // Lines added offline have no server id; tick off the ones the server knows.
        const known = all.filter((i) => !i.startsWith("local-"));
        if (known.length) await inner.kitchen.markBought(a[0], known);
        return;
      }
      case "kitchen.removeFromList":
        if (replayable({ call: op.call, itemId: a[0] })) await inner.kitchen.removeFromList(a[0]);
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

  // Pantry and list edits: one queue per household, so they reach the server in the order they were made.
  const seen = new Set<string>();
  const kitchenKey = (householdId: string) => `kitchen:${householdId}`;
  const homeOf = (id: string) => householdOf(id, [...seen]);
  const kitchenWrite = async <T>(householdId: string | null, edit: KitchenEdit, args: unknown[], now: () => Promise<T>, queued: () => T): Promise<T> => {
    // Without a copy of the kitchen there is nothing to show the edit on: behave as before (the call fails offline).
    if (!householdId || !getCopy(householdId)) return now();
    const r = await write(edit.call, kitchenKey(householdId), args, now, queued);
    editCopy(householdId, edit);
    return r;
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
      async getKitchen(householdId) {
        seen.add(householdId);
        const kept = getCopy(householdId);
        // Edits still waiting: the phone is ahead of the server, so show the phone's copy.
        if (kept && hasPending(kitchenKey(householdId))) {
          void useOutbox.getState().flush();
          return kept.items;
        }
        const items = await read(() => kitchen.getKitchen(householdId), () => kept?.items ?? null);
        if (items !== kept?.items) putCopy(householdId, { items, removed: [] });
        return items;
      },
      async getUseSoon(householdId, days) {
        seen.add(householdId);
        const kept = getCopy(householdId);
        return read(() => kitchen.getUseSoon(householdId, days), () => (kept ? useSoon(kept.items, days ?? 3) : null));
      },
      async getList(householdId) {
        seen.add(householdId);
        const kept = getCopy(householdId);
        if (kept && hasPending(kitchenKey(householdId))) {
          void useOutbox.getState().flush();
          return kept.list;
        }
        const list = await read(() => kitchen.getList(householdId), () => kept?.list ?? null);
        if (list !== kept?.list) putCopy(householdId, { list });
        return list;
      },
      addItems: (input) =>
        getCopy(input.householdId)
          ? kitchenWrite(input.householdId, { call: "kitchen.addItems", items: input.items }, [input], () => kitchen.addItems(input), () => [])
          : write("kitchen.addItems", null, [input], () => kitchen.addItems(input), () => []),
      updateItem: (itemId, changes) =>
        kitchenWrite(homeOf(itemId), { call: "kitchen.updateItem", itemId, changes }, [itemId, changes], () => kitchen.updateItem(itemId, changes), () => undefined),
      finishItem: (itemId, discarded) =>
        kitchenWrite(homeOf(itemId), { call: "kitchen.finishItem", itemId }, [itemId, discarded], () => kitchen.finishItem(itemId, discarded), () => undefined),
      reopenItem: (itemId) =>
        kitchenWrite(homeOf(itemId), { call: "kitchen.reopenItem", itemId }, [itemId], () => kitchen.reopenItem(itemId), () => undefined),
      addToList: (householdId, items) =>
        kitchenWrite(householdId, { call: "kitchen.addToList", items }, [householdId, items], () => kitchen.addToList(householdId, items), () => undefined),
      markBought: (householdId, itemIds) =>
        kitchenWrite(householdId, { call: "kitchen.markBought", itemIds }, [householdId, itemIds], () => kitchen.markBought(householdId, itemIds), () => []),
      removeFromList: (itemId) =>
        kitchenWrite(homeOf(itemId), { call: "kitchen.removeFromList", itemId }, [itemId], () => kitchen.removeFromList(itemId), () => undefined),
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
