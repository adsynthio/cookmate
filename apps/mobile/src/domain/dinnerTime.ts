// S3, dinner time: when dinner is and how long before it the cook wants to know. Home shows "Dinner at 8 · 52 min
// left" in that window with one dish that fits in about 20, 30 and 60 minutes (the same rule the notification uses).
// No React, no network.

/** "20:30" → minutes after midnight. */
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** "20:30" → "8:30" (dinner is in the evening, so no am/pm). */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = (((h ?? 0) + 11) % 12) + 1;
  return m ? `${h12}:${String(m).padStart(2, "0")}` : String(h12);
}

/** Dinner time minus the lead, as "HH:MM". */
export function nudgeTime(dinner: string, leadMinutes: number): string {
  const t = (toMinutes(dinner) - leadMinutes + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Minutes left before dinner when it's time to think about it (from a quarter of an hour before the nudge until
 * dinner), else null.
 */
export function minutesToDinner(dinner: string, leadMinutes: number, now: Date, timeZone = "Asia/Kolkata"): number | null {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(now);
  const left = toMinutes(dinner) - toMinutes(parts);
  return left > 0 && left <= leadMinutes + 15 ? left : null;
}

/** How long each suggestion may take: 20, 30, then up to an hour, never more than the time left. */
export function timeBuckets(minutesLeft: number): number[] {
  return [...new Set([20, 30, Math.min(60, minutesLeft)])].filter((b) => b <= minutesLeft).sort((a, b) => a - b);
}

/** One dish per time bucket, in rank order, never the same dish twice. */
export function pickByTime<T>(ranked: T[], minutesOf: (p: T) => number | null, minutesLeft: number): { bucket: number; pick: T }[] {
  const out: { bucket: number; pick: T }[] = [];
  const used = new Set<T>();
  for (const bucket of timeBuckets(minutesLeft)) {
    const pick = ranked.find((p) => !used.has(p) && (minutesOf(p) ?? Infinity) <= bucket);
    if (pick === undefined) continue;
    used.add(pick);
    out.push({ bucket, pick });
  }
  return out;
}
