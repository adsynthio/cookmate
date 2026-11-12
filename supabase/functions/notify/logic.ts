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
