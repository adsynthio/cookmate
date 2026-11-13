// Sprint 13 S2: your real step times. The time between Next taps tells us how long this cook actually takes over a
// hands-on step (chopping, frying onions, kneading). After a couple of cooks the step's timer and the dish's total
// time move part of the way towards that, never by more than a little. Process times (soaking, resting, the cooker's
// whistles, simmering) are chemistry, not speed, so they never change. No React, no network.

export type StepSample = { sec: number; at: number };
/** Samples per "dish:step", newest last. */
export type StepTimes = Record<string, StepSample[]>;

const KEEP = 5;
const MIN_SAMPLES = 2;
/** How far towards the cook's own time a step moves. */
const PULL = 0.6;
/** Never further than this from the recipe's time. */
const LOW = 0.6;
const HIGH = 1.6;

/** Techniques whose time is set by the food, not by how fast the cook works. */
const PROCESS = new Set(["pressure_cook", "soak", "marinate", "simmer", "steam", "dum", "deep_fry", "batter"]);

type StepLike = { minutes?: number | null; seconds?: number | null; technique?: string | null; whistles?: number | null; timer?: boolean | null };

function base(step: StepLike): number | null {
  if (step.seconds) return step.seconds;
  if (step.minutes) return step.minutes * 60;
  return null;
}

/** Steps whose time is the cook's own pace. Auto-started timers are rests and waits, so they stay as written. */
export function learnable(step: StepLike): boolean {
  const sec = base(step);
  return !!sec && sec >= 60 && !step.whistles && !step.timer && !PROCESS.has(step.technique ?? "");
}

const keyOf = (dish: string, stepNo: number) => `${dish}:${stepNo}`;

/**
 * One step finished by moving on with Next. Ignored when it can't be a real measure: far too quick (skipping
 * ahead), or far too long (the phone was left while the cook did something else).
 */
export function recordStep(times: StepTimes, dish: string, stepNo: number, step: StepLike, sec: number, at: number): StepTimes {
  const expected = base(step);
  if (!expected || !learnable(step)) return times;
  if (sec < expected * 0.25 || sec > expected * 4 || sec > 60 * 60) return times;
  const k = keyOf(dish, stepNo);
  return { ...times, [k]: [...(times[k] ?? []), { sec: Math.round(sec), at }].slice(-KEEP) };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** The step's time for this cook, in seconds: the recipe's until two cooks agree, then part of the way to theirs. */
export function yourSeconds(times: StepTimes, dish: string, stepNo: number, step: StepLike): number | null {
  const expected = base(step);
  if (expected === null) return null;
  const samples = learnable(step) ? (times[keyOf(dish, stepNo)] ?? []) : [];
  if (samples.length < MIN_SAMPLES) return expected;
  const target = expected + PULL * (median(samples.map((x) => x.sec)) - expected);
  const clamped = Math.min(expected * HIGH, Math.max(expected * LOW, target));
  return Math.max(30, Math.round(clamped / 30) * 30);
}

/**
 * The dish's total time for this cook, in minutes, when steps have moved; null when nothing has been learned yet, so
 * the recipe's own time stands.
 */
export function yourTotalMinutes(times: StepTimes, dish: string, steps: StepLike[], recipeMinutes: number): number | null {
  let delta = 0;
  steps.forEach((s, i) => {
    const b = base(s);
    const y = yourSeconds(times, dish, i + 1, s);
    if (b !== null && y !== null) delta += y - b;
  });
  if (Math.abs(delta) < 120) return null;
  return Math.max(5, Math.round((recipeMinutes * 60 + delta) / 60));
}
