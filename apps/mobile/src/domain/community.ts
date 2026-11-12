// Community helpers: how long ago something was shared, the invite message, and what a shared dish carries.
import type { Locale } from "./ranking.ts";

const UNITS: Record<Locale, { now: string; m: string; h: string; d: string }> = {
  en: { now: "just now", m: "{n} min ago", h: "{n} hr ago", d: "{n} days ago" },
  hi: { now: "अभी", m: "{n} मिनट पहले", h: "{n} घंटे पहले", d: "{n} दिन पहले" },
  hinglish: { now: "abhi", m: "{n} min pehle", h: "{n} ghante pehle", d: "{n} din pehle" },
};

/** "3 hr ago" (or a date after a week), in the cook's language. */
export function timeAgo(iso: string, now: number, locale: Locale): string {
  const sec = Math.max(0, (now - Date.parse(iso)) / 1000);
  const u = UNITS[locale];
  if (sec < 60) return u.now;
  if (sec < 3600) return u.m.replace("{n}", String(Math.floor(sec / 60)));
  if (sec < 86400) return u.h.replace("{n}", String(Math.floor(sec / 3600)));
  const days = Math.floor(sec / 86400);
  if (days <= 7) return days === 1 && locale === "en" ? "1 day ago" : u.d.replace("{n}", String(days));
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-IN" : "hi-IN", { day: "numeric", month: "short" });
}

/** Invite codes are read aloud and typed on phones: 8 characters without 0/O, 1/I. Spaces and dashes are ignored. */
export function cleanInviteCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : null;
}

/** "ABCD-EFGH": easier to read out over the phone. */
export function showInviteCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** What a shared dish carries: a trimmed note and at most six short, distinct changes. */
export function shareable(note: string, changes: string[]): { note: string | undefined; changes: string[] } {
  const seen = new Set<string>();
  const clean = changes
    .map((c) => c.trim().slice(0, 80))
    .filter((c) => c && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()))
    .slice(0, 6);
  const n = note.trim().slice(0, 500);
  return { note: n || undefined, changes: clean };
}
