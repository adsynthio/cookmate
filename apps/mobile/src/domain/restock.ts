// KIT-181: asking before something runs out. The database learns how often each thing is bought (restock_due); the
// phone shows at most one question at a time, and "Not yet" quiets that one for a few days. Never an order.

export type RestockDue = { ingredientKey: string; everyDays: number; lastBought: string; dueInDays: number };

/** How long "Not yet" keeps a question away: half the usual gap, at least 2 days and at most a week. */
export function snoozeDays(everyDays: number): number {
  return Math.min(7, Math.max(2, Math.round(everyDays / 2)));
}

/** The one question to show: the soonest due that isn't snoozed. `snoozed` maps ingredient to an ISO date-time. */
export function nextRestock(due: readonly RestockDue[], snoozed: Record<string, string>, now = Date.now()): RestockDue | null {
  return [...due]
    .filter((d) => !(snoozed[d.ingredientKey] && Date.parse(snoozed[d.ingredientKey]!) > now))
    .sort((a, b) => a.dueInDays - b.dueInDays)[0] ?? null;
}

export function snoozeUntil(d: RestockDue, now = Date.now()): string {
  return new Date(now + snoozeDays(d.everyDays) * 86_400_000).toISOString();
}

/** "every 12 days", "every week", "every 2 weeks": the rhythm in words people use. */
export function rhythmKey(everyDays: number): { key: "days" | "week" | "weeks" | "month"; n: number } {
  const d = Math.round(everyDays);
  if (d >= 6 && d <= 8) return { key: "week", n: 1 };
  if (d >= 13 && d <= 15) return { key: "weeks", n: 2 };
  if (d >= 28 && d <= 32) return { key: "month", n: 1 };
  return { key: "days", n: d };
}
