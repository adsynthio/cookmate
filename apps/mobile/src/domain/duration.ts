// U2: cooking times people read at a glance. "515 min" (boiled chana with its overnight soak) and "150 min" made dishes
// look impossible; "Soak overnight + 35 min" and "2 hr 30 min" don't. Pure TypeScript; the words come from i18n.

export type DurationParts =
  | { kind: "min"; n: number }
  | { kind: "hr"; n: number }
  | { kind: "hrMin"; h: number; m: number };

/** Minutes as minutes (under an hour) or hours and minutes, rounded to 5 minutes past 2 hours. */
export function durationParts(minutes: number): DurationParts {
  const min = Math.max(0, Math.round(minutes));
  if (min < 60) return { kind: "min", n: min };
  const rounded = min >= 120 ? Math.round(min / 5) * 5 : min;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? { kind: "hr", n: h } : { kind: "hrMin", h, m };
}

/** A recipe whose prep is mostly soaking overnight: the hands-on time is what to show, with the soak said apart. */
export function overnightSoak(doc: { prep_time_min?: number | null; cook_time_min?: number | null; steps?: { technique?: string | null }[] }): { activeMin: number } | null {
  const prep = doc.prep_time_min ?? 0;
  const soaks = (doc.steps ?? []).some((s) => s.technique === "soak");
  if (!soaks || prep < 240) return null;
  return { activeMin: doc.cook_time_min ?? 0 };
}
