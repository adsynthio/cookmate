// KIT-076: what the phone keeps so a dish can be finished with no network: the session, the recipe it is cooking
// (steps, timers, cues and safety notes; dish photos ship with the app), where the cook is, and the step
// recordings downloaded when cooking started. Kept in the device's localStorage (SQLite underneath) for 24 hours,
// the same time after which an idle session is abandoned on the server (KIT-079).
import "expo-sqlite/localStorage/install";

import type { RecipeDoc } from "@/domain/recipes";
import type { CookSession } from "@/services/types";

export type Bundle = {
  sessionId: string;
  householdId: string;
  session: CookSession;
  doc: RecipeDoc | null;
  /** Step recordings by step number: a file on the phone, or a link when the download didn't finish. */
  audio: Record<number, string>;
  savedAt: number;
  /** Finished with no network: the finish is waiting in the outbox. */
  finishedOffline?: boolean;
};

const KEY = "cookmate.bundles";
const KEEP_MS = 24 * 60 * 60 * 1000;
const MAX = 3;

function readAll(): Record<string, Bundle> {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, Bundle>) : {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(all).filter(([, b]) => now - b.savedAt < KEEP_MS));
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Bundle>) {
  const newest = Object.values(all).sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX);
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(Object.fromEntries(newest.map((b) => [b.sessionId, b]))));
  } catch {
    // Storage full or unavailable: cooking still works while the app stays open.
  }
}

export function getBundle(sessionId: string): Bundle | null {
  return readAll()[sessionId] ?? null;
}

/** The newest session still in progress for this household, for the Cook tab's resume card when offline. */
export function latestBundle(householdId: string): Bundle | null {
  return (
    Object.values(readAll())
      .filter((b) => b.householdId === householdId && !b.finishedOffline && (b.session.status === "active" || b.session.status === "paused"))
      .sort((a, b) => b.savedAt - a.savedAt)[0] ?? null
  );
}

export function bundleForRecipe(idOrSlug: string): RecipeDoc | null {
  for (const b of Object.values(readAll())) {
    const d = b.doc;
    if (d && (d.id === idOrSlug || d.slug === idOrSlug || b.session.recipeId === idOrSlug)) return d;
  }
  return null;
}

/** Saves or updates a bundle; fields not given keep what was there. */
export function putBundle(sessionId: string, patch: Partial<Omit<Bundle, "sessionId">> & { householdId?: string }): Bundle | null {
  const all = readAll();
  const prev = all[sessionId];
  if (!prev && (!patch.session || !patch.householdId)) return null;
  const next: Bundle = {
    audio: {},
    doc: null,
    ...prev,
    ...patch,
    sessionId,
    householdId: patch.householdId ?? prev!.householdId,
    session: patch.session ?? prev!.session,
    savedAt: Date.now(),
  };
  all[sessionId] = next;
  writeAll(all);
  return next;
}

export function dropBundle(sessionId: string) {
  const all = readAll();
  delete all[sessionId];
  writeAll(all);
}

export function clearBundles() {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // Nothing kept.
  }
}
