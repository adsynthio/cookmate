// NFR-08: every user-facing string comes from a catalogue. No hard-coded copy in components.
import { useSyncExternalStore } from "react";

import en from "./en.json";
import hi from "./hi.json";
import hinglish from "./hinglish.json";
import type { Locale } from "./locale";

export type { Locale } from "./locale";
export { LOCALES } from "./locale";
export type StringKey = keyof typeof en;

const catalogues: Record<Locale, Partial<Record<StringKey, string>>> = { en, hi, hinglish };

/** English for everyone until the user picks a language on onboarding (or it is restored from their profile). */
export const DEFAULT_LOCALE: Locale = "en";

let current: Locale = DEFAULT_LOCALE;

const listeners = new Set<(locale: Locale) => void>();

/** KIT-013: switching language applies immediately; the root layout re-renders on change. */
export function setLocale(locale: Locale) {
  if (locale === current) return;
  current = locale;
  listeners.forEach((fn) => fn(locale));
}

export function onLocaleChange(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
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

/** Subscribe a component to language changes so its t() calls re-render without an app restart. */
export function useLocale(): Locale {
  return useSyncExternalStore(onLocaleChange, getLocale, getLocale);
}
