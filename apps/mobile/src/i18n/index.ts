// NFR-08: every user-facing string comes from a catalogue. No hard-coded copy in components.
import { getLocales } from "expo-localization";

import en from "./en.json";
import hi from "./hi.json";
import hinglish from "./hinglish.json";

export type Locale = "en" | "hi" | "hinglish";
export type StringKey = keyof typeof en;

const catalogues: Record<Locale, Partial<Record<StringKey, string>>> = { en, hi, hinglish };

let current: Locale = detectLocale();

export function detectLocale(): Locale {
  const tag = getLocales()[0]?.languageCode ?? "en";
  return tag === "hi" ? "hi" : "en";
}

export function setLocale(locale: Locale) {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/** Translate a key, falling back to English, with {name} style interpolation. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const template = catalogues[current][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
