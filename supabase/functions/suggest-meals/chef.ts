// Pure helpers for the "chef" step of suggest-meals (no network). Tested with `deno test`.
// The rules rank every recipe and drop anything that breaks a diet, allergy, fast, leftover or equipment rule. The
// model then sees the best few that are left (never the dropped ones) with the facts behind them: leftovers, what is
// going off, who is eating and what they like, what was cooked lately, the season and today's festivals. It chooses
// tonight's three, writes why, and may name one dish that is not in Cookmate's recipes yet. Its answer is checked
// here; anything that fails falls back to the rules' order and reasons.
import { type Craving, type Eater, type MealSlot, type Ranked, type RankContext } from "../_shared/ranking.ts";
import { acceptReason } from "./logic.ts";

export const CHEF_POOL = 8;
export const MAX_REASON_CHARS = 90;

/** Indian seasons, roughly, by month (for "something warming" in winter, "light" in summer, monsoon snacks). */
export function seasonOf(isoDate: string): "winter" | "summer" | "monsoon" | "autumn" {
  const m = Number(isoDate.slice(5, 7));
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "summer";
  if (m <= 9) return "monsoon";
  return "autumn";
}

export type ChefCandidate = {
  id: string;
  title: string;
  minutes: number | null;
  uses: { item: string; days_left?: number }[];
  to_buy: string[];
  cooked_days_ago?: number;
  rules_rank: number;
  draft_reason: string;
};

/** The facts the model reasons over. Candidates are the rules' top few, in their order. */
export function chefBrief(a: {
  ranked: Ranked[];
  templates: Map<string, string>;
  ctx: RankContext;
  slot: MealSlot;
  today: string;
  festivals: string[];
  craving: Craving;
  cravingText?: string | null;
  nameOf: (key: string) => string;
}) {
  const recent = new Map(a.ctx.recent.map((r) => [r.recipeId, r.daysAgo]));
  const candidates: ChefCandidate[] = a.ranked.slice(0, CHEF_POOL).map((r, i) => ({
    id: r.recipe.id,
    title: r.recipe.title,
    minutes: r.recipe.timeMin || null,
    uses: r.match.items
      .filter((m) => m.entry)
      .map((m) => ({ item: a.nameOf(m.key), ...(m.entry!.daysLeft !== null && m.entry!.daysLeft <= 3 ? { days_left: m.entry!.daysLeft } : {}) })),
    to_buy: r.match.items.filter((m) => m.status === "missing").map((m) => a.nameOf(m.key)),
    ...(recent.has(r.recipe.id) ? { cooked_days_ago: recent.get(r.recipe.id) } : {}),
    rules_rank: i + 1,
    draft_reason: a.templates.get(r.recipe.id) ?? "",
  }));
  return {
    meal: a.slot,
    today: a.today,
    season: seasonOf(a.today),
    festivals_today: a.festivals,
    eating: a.ctx.eaters.map((e: Eater) => ({ name: e.name, age_group: e.ageGroup, diet: e.diet, spice: e.spice })),
    likes: a.ctx.like.map(a.nameOf),
    avoid: a.ctx.avoid.map(a.nameOf),
    leftovers_ready: a.ctx.alreadyCooked ?? [],
    ...(a.cravingText ? { asked_for: a.cravingText } : {}),
    ...(a.craving.maxTimeMin ? { max_minutes: a.craving.maxTimeMin } : {}),
    candidates,
  };
}

export type ChefOut = {
  picks: { id: string; reason: string }[];
  new_dish: { name: string; why: string } | null;
};

const BANNED = /\b(healthy|health|cure|weight|calorie|diabet|immunity|detox)/i;

/**
 * The picks to show, in order. The model's choice wins when every id is a candidate; reasons must pass
 * acceptReason (length, no health claims, mentions a real fact of that dish) or the rules' reason is used. Short
 * answers are filled from the rules' order. Returns null when the model's choice can't be used at all.
 */
export function acceptChef(
  out: ChefOut | null | undefined,
  pool: Ranked[],
  fallback: Ranked[],
  templateOf: (r: Ranked) => string,
  anchorsOf: (r: Ranked, template: string) => string[],
): { picks: Ranked[]; reasons: string[] } | null {
  if (!out?.picks?.length) return null;
  const byId = new Map(pool.map((r) => [r.recipe.id, r]));
  const chosen: { r: Ranked; reason: string }[] = [];
  for (const p of out.picks) {
    const r = byId.get(p.id);
    if (!r) return null; // an id we never offered: don't trust any of it
    if (chosen.some((c) => c.r === r)) continue;
    chosen.push({ r, reason: p.reason });
    if (chosen.length === 3) break;
  }
  for (const r of fallback) {
    if (chosen.length >= Math.min(3, fallback.length)) break;
    if (!chosen.some((c) => c.r === r)) chosen.push({ r, reason: "" });
  }
  return {
    picks: chosen.map((c) => c.r),
    reasons: chosen.map((c) => {
      const t = templateOf(c.r);
      return acceptReason(t, c.reason, anchorsOf(c.r, t));
    }),
  };
}

/** A dish idea beyond Cookmate's recipes: a short real-sounding name, not one we already have, and a plain why. */
export function acceptNewDish(d: ChefOut["new_dish"], knownTitles: string[]): { name: string; why: string } | null {
  if (!d) return null;
  const name = (d.name ?? "").trim().replace(/\s+/g, " ");
  const why = (d.why ?? "").trim();
  if (name.length < 3 || name.length > 40 || !/^[\p{L}\p{M} '&-]+$/u.test(name)) return null;
  if (!why || why.length > MAX_REASON_CHARS || BANNED.test(why) || BANNED.test(name)) return null;
  const low = name.toLowerCase();
  if (knownTitles.some((t) => t.toLowerCase() === low)) return null;
  return { name, why };
}
