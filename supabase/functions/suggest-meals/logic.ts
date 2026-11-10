// Pure helpers for suggest-meals (no network). Tested with `deno test`.
import {
  type Craving,
  DEFAULT_WEIGHTS,
  type Eater,
  type Locale,
  type MealSlot,
  type PantryEntry,
  type RankContext,
  type Weights,
} from "../_shared/ranking.ts";

const DAY_MS = 86_400_000;

/** Today's date in the household's timezone, as YYYY-MM-DD. */
export function localDate(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

export function localeFor(code: string | null | undefined): Locale {
  if (!code) return "en";
  if (code.startsWith("hi-Latn")) return "hinglish";
  if (code.startsWith("hi")) return "hi";
  return "en";
}

export type InventoryRow = {
  id: string;
  confidence: number;
  expiry_date: string | null;
  staple_level: string | null;
  ingredients: { canonical_name: string; names: { hi?: string; "hi-Latn"?: string } | null } | null;
};

export function pantryFromRows(rows: InventoryRow[], today: string): PantryEntry[] {
  return rows
    .filter((r) => r.ingredients?.canonical_name)
    .map((r) => ({
      itemId: r.id,
      key: r.ingredients!.canonical_name,
      confidence: Number(r.confidence),
      daysLeft: r.expiry_date ? daysBetween(today, r.expiry_date) : null,
      out: r.staple_level === "out",
    }));
}

export type MemberRow = {
  id: string;
  display_name: string;
  age_group: Eater["ageGroup"] | null;
  diet: Eater["diet"] | null;
  taste_profiles: { spice: number | null } | { spice: number | null }[] | null;
};

export function eatersFromRows(rows: MemberRow[], whoEating?: string[]): Eater[] {
  const all = rows.map((m) => {
    const tp = Array.isArray(m.taste_profiles) ? m.taste_profiles[0] : m.taste_profiles;
    return {
      id: m.id,
      name: m.display_name,
      ageGroup: m.age_group ?? "adult",
      diet: m.diet ?? "veg",
      spice: tp?.spice ?? (m.age_group === "child" ? 1 : 3),
    } satisfies Eater;
  });
  const chosen = whoEating?.length ? all.filter((e) => whoEating.includes(e.id)) : all;
  return chosen.length ? chosen : all;
}

export type MemoryRow = {
  polarity: number;
  scope: string;
  expires_at: string | null;
  ingredients: { canonical_name: string } | null;
};

/** Explicit or observed likes and dislikes about ingredients (only active, unexpired memories are passed in). */
export function prefsFromMemories(rows: MemoryRow[], now: Date): { avoid: string[]; like: string[] } {
  const live = rows.filter((m) => m.ingredients && (!m.expires_at || Date.parse(m.expires_at) > now.getTime()));
  return {
    avoid: [...new Set(live.filter((m) => m.polarity < 0).map((m) => m.ingredients!.canonical_name))],
    like: [...new Set(live.filter((m) => m.polarity > 0).map((m) => m.ingredients!.canonical_name))],
  };
}

export type CalendarRow = { rules: { avoid?: string[]; prefer?: string[] } | null };

export function prefsFromCalendar(rows: CalendarRow[]): { avoid: string[]; prefer: string[] } {
  return {
    avoid: [...new Set(rows.flatMap((r) => r.rules?.avoid ?? []))],
    prefer: [...new Set(rows.flatMap((r) => r.rules?.prefer ?? []))],
  };
}

/** Accepted or cooked in the last week, as days ago (most recent wins). */
export function recentFrom(rows: { recipe_id: string; at: string }[], now: Date): RankContext["recent"] {
  return rows.map((r) => ({ recipeId: r.recipe_id, daysAgo: Math.max(0, Math.floor((now.getTime() - Date.parse(r.at)) / DAY_MS)) }));
}

/** Weights from feature_flags.ranking_weights.rules.weights; anything missing or invalid keeps its default. */
export function weightsFrom(rules: unknown): Weights {
  const w = { ...DEFAULT_WEIGHTS };
  const given = (rules as { weights?: Record<string, unknown> } | null)?.weights ?? {};
  for (const k of Object.keys(w) as (keyof Weights)[]) {
    const v = given[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10) w[k] = v;
  }
  return w;
}

export const SLOTS: MealSlot[] = ["breakfast", "lunch", "tiffin", "dinner", "snack"];

/** Merge the model's reading of a craving into the keyword reading; only known values get through. */
export function mergeCraving(base: Craving, model: Partial<Craving> | null, knownTags: string[]): Craving {
  if (!model) return base;
  const tags = [...base.tags];
  for (const t of model.tags ?? []) if (knownTags.includes(t) && !tags.includes(t)) tags.push(t);
  const maxTime = typeof model.maxTimeMin === "number" && model.maxTimeMin >= 5 && model.maxTimeMin <= 240 ? model.maxTimeMin : null;
  return {
    tags,
    maxTimeMin: base.maxTimeMin ?? maxTime,
    spiceDelta: base.spiceDelta || Math.max(-2, Math.min(2, Math.round(model.spiceDelta ?? 0))),
    course: base.course ?? model.course ?? null,
    ingredients: base.ingredients,
  };
}

/**
 * Guardrail for the model's rewording of a reason (pick_reasons): keep it only if it is short and still mentions
 * what the template cited (an item name, a number or a person), otherwise use the template.
 */
export function acceptReason(template: string, reworded: string | null | undefined, anchors: string[]): string {
  const r = (reworded ?? "").trim();
  if (!r || r.length > 90 || /\b(healthy|health|cure|weight|calorie|diabet)/i.test(r)) return template;
  if (!anchors.length) return r;
  const low = r.toLowerCase();
  return anchors.some((a) => a && low.includes(a.toLowerCase())) ? r : template;
}
