// Pure pantry logic shared by mock and live services. No React, no network — unit tested with node --test.

export type UseSoonCandidate = {
  quantity: number | null;
  expiryDate: string | null;
  confidence: number;
  stapleLevel?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `today` until `expiryDate` (negative when expired). */
export function daysLeft(expiryDate: string, today: Date = new Date()): number {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = expiryDate.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - start) / DAY_MS);
}

/** Coverage only counts items we are reasonably sure are there (REC-02, PLAN.md §5.1). */
export const CONFIDENT = 0.5;

/**
 * HOME-04: items at risk within `withinDays`, most urgent first.
 * Sorted by days left, then by larger quantity (more food at risk) first.
 */
export function useSoon<T extends UseSoonCandidate>(items: T[], withinDays = 3, today: Date = new Date()): T[] {
  return items
    .filter((i) => i.expiryDate !== null && i.stapleLevel == null && i.confidence >= CONFIDENT)
    .map((i) => ({ item: i, days: daysLeft(i.expiryDate as string, today) }))
    .filter(({ days }) => days >= 0 && days <= withinDays)
    .sort((a, b) => a.days - b.days || (b.item.quantity ?? 1) - (a.item.quantity ?? 1))
    .map(({ item }) => item);
}
