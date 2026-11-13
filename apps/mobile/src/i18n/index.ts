// NFR-08: every user-facing string comes from a catalogue. No hard-coded copy in components.
import { useSyncExternalStore } from "react";

import en from "./en.json";
import hi from "./hi.json";
import hinglish from "./hinglish.json";
import kn from "./kn.json";
import { type AppLocale, contentLocale, type Locale } from "./locale";
import { setKannadaNames } from "../domain/kitchen";

export type { AppLocale, Locale } from "./locale";
export { APP_LOCALES, contentLocale, LOCALES } from "./locale";
export type StringKey = keyof typeof en;

const catalogues: Record<AppLocale, Partial<Record<StringKey, string>>> = { en, hi, hinglish, kn };

/** English for everyone until the user picks a language on onboarding (or it is restored from their profile). */
export const DEFAULT_LOCALE: AppLocale = "en";

let current: AppLocale = DEFAULT_LOCALE;

const listeners = new Set<(locale: AppLocale) => void>();

/** KIT-013: switching language applies immediately; the root layout re-renders on change. */
export function setLocale(locale: AppLocale) {
  if (locale === current) return;
  current = locale;
  setKannadaNames(locale === "kn");
  listeners.forEach((fn) => fn(locale));
}

export function onLocaleChange(fn: (locale: AppLocale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The language for recipe and domain text (Kannada reads English recipe text for now). */
export function getLocale(): Locale {
  return contentLocale(current);
}

/** The language the app's own words are shown in. */
export function getAppLocale(): AppLocale {
  return current;
}

/** Translate a key, falling back to English, with {name} style interpolation. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  const template = catalogues[current][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/** The same string in a given language, whatever the app is set to (F1: a message for the house cook). */
export function tIn(locale: AppLocale, key: StringKey, params?: Record<string, string | number>): string {
  const template = catalogues[locale][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/** Subscribe a component to language changes so its t() calls re-render without an app restart. */
export function useLocale(): Locale {
  return contentLocale(useAppLocale());
}

/** The app language, for language pickers. */
export function useAppLocale(): AppLocale {
  return useSyncExternalStore(onLocaleChange, getAppLocale, getAppLocale);
}
