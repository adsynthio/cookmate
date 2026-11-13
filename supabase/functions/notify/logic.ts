// Pure helpers for notify (KIT-045): the push text and Expo's push API shapes. Tested with `deno test`.
import type { Locale } from "../_shared/ranking.ts";

const TITLE: Record<Locale, string> = {
  en: "Tonight: {dish}",
  hinglish: "Aaj raat: {dish}",
  hi: "आज रात: {dish}",
};
const NOTHING: Record<Locale, string> = {
  en: "Open Cookmate to choose dinner",
  hinglish: "Dinner chunne ke liye Cookmate kholiye",
  hi: "रात का खाना चुनने के लिए Cookmate खोलिए",
};

/** One short, calm line: the dish and the reason. No exclamation marks, nothing about health. */
export function pickMessage(dish: string | null, reason: string | null, locale: Locale): { title: string; body: string } {
  if (!dish) return { title: "Cookmate", body: NOTHING[locale] };
  return { title: TITLE[locale].replace("{dish}", dish).slice(0, 60), body: (reason ?? "").slice(0, 120) };
}

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: "default";
  channelId: string;
  priority: "normal";
};

export function expoMessages(tokens: string[], msg: { title: string; body: string }, data: Record<string, string>): ExpoMessage[] {
  return [...new Set(tokens)]
    .filter((t) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t))
    .map((to) => ({ to, ...msg, data, sound: "default", channelId: "daily-pick", priority: "normal" }));
}

export type ExpoTicket = { status: "ok" | "error"; id?: string; message?: string; details?: { error?: string } };

/** Did any device get it, and which tokens are dead (the app was removed) so we stop using them. */
export function readTickets(tokens: string[], tickets: ExpoTicket[]): { delivered: boolean; dead: string[] } {
  const dead: string[] = [];
  let delivered = false;
  tickets.forEach((t, i) => {
    if (t.status === "ok") delivered = true;
    else if (t.details?.error === "DeviceNotRegistered" && tokens[i]) dead.push(tokens[i]!);
  });
  return { delivered, dead };
}

/** S3: how long each suggestion may take, up to the time left before dinner (20, 30, then up to an hour). */
export function timeBuckets(leadMinutes: number): number[] {
  return [...new Set([20, 30, Math.min(60, leadMinutes)])].filter((b) => b <= leadMinutes).sort((a, b) => a - b);
}

/** One dish for each time bucket, best-ranked first, never the same dish twice. `ranked` is in rank order. */
export function pickByTime<T>(ranked: T[], minutesOf: (p: T) => number | null, leadMinutes: number): { bucket: number; pick: T }[] {
  const out: { bucket: number; pick: T }[] = [];
  const used = new Set<T>();
  for (const bucket of timeBuckets(leadMinutes)) {
    const pick = ranked.find((p) => !used.has(p) && (minutesOf(p) ?? Infinity) <= bucket);
    if (pick === undefined) continue;
    used.add(pick);
    out.push({ bucket, pick });
  }
  return out;
}

const DINNER_TITLE: Record<Locale, string> = {
  en: "Dinner at {time}: what to cook",
  hinglish: "Dinner {time} baje: kya banayein?",
  hi: "रात का खाना {time} बजे: क्या बनाएँ?",
};
const MIN: Record<Locale, string> = { en: "{n} min", hinglish: "{n} min", hi: "{n} मिनट" };
const HOUR: Record<Locale, string> = { en: "1 hr", hinglish: "1 ghanta", hi: "1 घंटा" };

/** "20:30" → "8:30" (dinner is always in the evening, so no am/pm needed). */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = ((h! + 11) % 12) + 1;
  return m ? `${h12}:${String(m).padStart(2, "0")}` : String(h12);
}

/** "Dinner at 8: what to cook" / "20 min: Jeera Aloo · 30 min: Poha · 1 hr: Rajma". */
export function dinnerMessage(choices: { bucket: number; dish: string }[], dinnerTime: string, locale: Locale): { title: string; body: string } {
  if (!choices.length) return pickMessage(null, null, locale);
  const label = (b: number) => (b === 60 ? HOUR[locale] : MIN[locale].replace("{n}", String(b)));
  return {
    title: DINNER_TITLE[locale].replace("{time}", clock(dinnerTime)).slice(0, 60),
    body: choices.map((c) => `${label(c.bucket)}: ${c.dish}`).join(" · ").slice(0, 160),
  };
}
