// Pure helpers for the Kitchen tab (KIT-030/033/036). No React, no network: unit tested with node --test.
import type { Locale } from "../i18n/locale";
import type { CatalogEntry, LocationKind } from "./pantryParse";

export type CatalogItem = CatalogEntry & {
  category: string;
  life: Partial<Record<LocationKind, number>>;
  measures?: Record<string, number>;
};

/** Name in the user's language: Hindi script for hi, Hinglish for hinglish, English otherwise. */
export function displayName(entry: Pick<CatalogItem, "name" | "hi" | "latn"> | undefined, fallback: string, locale: Locale): string {
  if (!entry) return capitalise(fallback);
  if (locale === "hi" && entry.hi) return entry.hi;
  if (locale === "hinglish" && entry.latn) return capitalise(entry.latn);
  return capitalise(entry.name);
}

export function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "2 kg", "500 g", "12", "1.5 l"; whole numbers stay whole, others keep up to 2 decimals. */
export function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null) return "";
  const n = Number.isInteger(quantity) ? String(quantity) : String(Math.round(quantity * 100) / 100);
  if (!unit || unit === "piece") return n;
  return `${n} ${unit}`;
}

/** Whole days from today (local date) to an ISO date; negative when past. */
export function daysUntil(isoDate: string, today: Date = new Date()): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = Date.UTC(y as number, (m as number) - 1, d as number);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86_400_000);
}

export type ExpiryInfo = { kind: "expired" | "today" | "soon" | "later"; days: number; estimated: boolean };

/** Expiry marker for an item row: soon = within 3 days. */
export function expiryInfo(expiryDate: string | null, estimated: boolean, today?: Date): ExpiryInfo | null {
  if (!expiryDate) return null;
  const days = daysUntil(expiryDate, today);
  const kind = days < 0 ? "expired" : days === 0 ? "today" : days <= 3 ? "soon" : "later";
  return { kind, days, estimated };
}

/** Below this the app asks "Still have this?" (confidence decays daily; see PLAN.md §5.1). */
export const LOW_CONFIDENCE = 0.5;

export type ShelfLife = { kind: LocationKind; days: number }[];

/**
 * KIT-036: how long it lasts in each place it can be kept, best place first.
 * The usual place comes first; the rest are sorted by how long they keep it.
 */
export function shelfLife(entry: Pick<CatalogItem, "life" | "location"> | undefined): ShelfLife {
  if (!entry) return [];
  return (Object.entries(entry.life) as [LocationKind, number][])
    .map(([kind, days]) => ({ kind, days }))
    .sort((a, b) => (a.kind === entry.location ? -1 : b.kind === entry.location ? 1 : b.days - a.days));
}

/** "about 2 weeks" style rounding for shelf-life copy: days under 14, weeks under 9, months after. */
export function roughDuration(days: number): { unit: "day" | "week" | "month" | "year"; n: number } {
  if (days < 14) return { unit: "day", n: days };
  if (days < 63) return { unit: "week", n: Math.round(days / 7) };
  if (days < 365) return { unit: "month", n: Math.round(days / 30) };
  return { unit: "year", n: Math.round(days / 365) };
}
