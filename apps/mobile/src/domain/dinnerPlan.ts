// Sprint 13 S4: plan to dinner time. "Dinner at 8:30" works backwards through the recipe: when to start, when each
// step begins, and what to do during the long hands-off waits (soaking, the cooker, a simmer): get the next step
// ready, make roti dough, or tidy up. Rotis are planned with the stoves the kitchen has: with a second burner or an
// induction they're made while the dish finishes; on a single stove, after it. No React, no network.

export type PlanStep = {
  minutes?: number | null;
  seconds?: number | null;
  technique?: string | null;
  timer?: boolean | null;
  whistles?: number | null;
};

export type PlanItem =
  | { at: number; kind: "step"; step: number; minutes: number }
  /** A long opening step (soak overnight, marinate for hours): done ahead, not part of the evening. */
  | { at: number; kind: "ahead"; step: number; minutes: number }
  | { at: number; kind: "meanwhile"; step: number; what: "next" | "dough" | "tidy"; next?: number }
  | { at: number; kind: "dough"; minutes: number }
  | { at: number; kind: "rotis"; minutes: number; count: number }
  | { at: number; kind: "serve" };

export type DinnerPlan = { start: number; items: PlanItem[] };

/** Hands-off: the food cooks or rests and the cook is free. */
const WAIT = new Set(["pressure_cook", "soak", "marinate", "simmer", "steam", "dum"]);
const WAIT_MIN = 10;
const DOUGH_KNEAD = 8;
/** Opening steps this long are prep ahead (same rule as Plan ahead, D1). */
const AHEAD_MIN = 120;
/** The dough rests about 20 minutes, so it goes in a wait long enough to knead, not one that lasts hours. */
const DOUGH_WAIT_MAX = 90;
const DOUGH_REST = 20;

export function isWait(step: PlanStep, minutes: number): boolean {
  return minutes >= WAIT_MIN && (WAIT.has(step.technique ?? "") || !!step.timer);
}

/** "20:30" -> 1230 minutes after midnight. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 1145 -> "7:05 pm" style, without am/pm: "7:05". */
export function clockOf(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60) % 12 || 12;
  return `${h}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes of rotis on one tawa: a minute and a half each, plus heating. */
export function rotiMinutes(count: number): number {
  return Math.round(3 + count * 1.5);
}

/**
 * The timeline. `seconds(n)` is the time for step n (the cook's own pace when known). `stoves` counts what can cook
 * at once (gas burners plus an induction). With `rotis`, dough is kneaded in the first wait long enough to knead and
 * rest it, or before starting when there's no such wait.
 */
export function planDinner(
  steps: PlanStep[],
  seconds: (n: number) => number | null,
  dinner: number,
  opts: { rotis?: number; stoves: number },
): DinnerPlan {
  const mins = steps.map((_, i) => Math.max(1, Math.round((seconds(i + 1) ?? 120) / 60)));
  const dishMin = mins.reduce((a, b) => a + b, 0);
  const rotis = opts.rotis ?? 0;
  const rotiMin = rotis ? rotiMinutes(rotis) : 0;
  // With a free second stove the rotis are made while the dish finishes; otherwise after it.
  const parallel = opts.stoves >= 2;
  const dishEnd = rotis && !parallel ? dinner - rotiMin : dinner;
  let at = dishEnd - dishMin;

  // Where the dough goes: the first wait it fits in.
  // Long opening steps happen ahead of time: the evening starts after them.
  let ahead = 0;
  while (ahead < Math.min(2, steps.length) && mins[ahead]! >= AHEAD_MIN) ahead++;
  const aheadMin = mins.slice(0, ahead).reduce((a, b) => a + b, 0);
  at += aheadMin;
  const doughWait = rotis
    ? steps.findIndex((s, i) => i >= ahead && isWait(s, mins[i]!) && mins[i]! >= DOUGH_KNEAD + 5 && mins[i]! <= DOUGH_WAIT_MAX)
    : -1;
  const items: PlanItem[] = [];
  let start = at;
  let aheadAt = at - aheadMin;
  if (rotis && doughWait < 0) {
    start = at - DOUGH_KNEAD;
    items.push({ at: start, kind: "dough", minutes: DOUGH_KNEAD });
  }
  steps.forEach((s, i) => {
    const n = i + 1;
    if (i < ahead) {
      items.push({ at: aheadAt, kind: "ahead", step: n, minutes: mins[i]! });
      aheadAt += mins[i]!;
      return;
    }
    items.push({ at, kind: "step", step: n, minutes: mins[i]! });
    if (isWait(s, mins[i]!)) {
      const nextHands = steps.findIndex((x, j) => j > i && !isWait(x, mins[j]!));
      const what = i === doughWait ? "dough" : nextHands >= 0 ? "next" : "tidy";
      items.push({ at: at + 1, kind: "meanwhile", step: n, what, ...(what === "next" ? { next: nextHands + 1 } : {}) });
    }
    at += mins[i]!;
  });
  if (rotis) {
    const rotiAt = dinner - rotiMin;
    // The dough must have rested; on one stove the rotis follow the dish.
    items.push({ at: rotiAt, kind: "rotis", minutes: rotiMin, count: rotis });
  }
  items.push({ at: dinner, kind: "serve" });
  items.sort((a, b) => a.at - b.at || order(a) - order(b));
  return { start, items };
}

const order = (i: PlanItem) =>
  i.kind === "ahead" ? -1 : i.kind === "dough" ? 0 : i.kind === "step" ? 1 : i.kind === "meanwhile" ? 2 : i.kind === "rotis" ? 3 : 4;

/** How many minutes from now until the plan starts (negative: it should have started already). */
export function startsIn(plan: DinnerPlan, now: number): number {
  return plan.start - now;
}
