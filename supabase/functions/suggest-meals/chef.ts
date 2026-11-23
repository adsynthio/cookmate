// Pure helpers for the "chef" step of suggest-meals (no network). Tested with `deno test`.
// The rules rank every recipe and drop anything that breaks a diet, allergy, fast, leftover or equipment rule. The
// model then sees the best few that are left (never the dropped ones) with the facts behind them: leftovers, what is
// going off, who is eating and what they like, what was cooked lately, the season and today's festivals. It chooses
// tonight's three, writes why, and names two or three new dishes this kitchen can make that are not in Cookmate's
// recipes (22 Nov 2026: Cookmate has 19 recipes, so without ideas Home showed the same three every day). It also sees
// what Home showed lately, so the picks change. Its answer is checked here; anything that fails falls back to the
// rules' order and reasons.
import { avoids } from "../_shared/invent.ts";
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
  /** Home showed it in the last few days and it wasn't cooked: pick something else unless it is clearly best. */
  shown_lately?: true;
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
  /** Recipe ids Home showed in the last few days (sent by the app). */
  shownLately?: Set<string>;
  /** New dish ideas Home showed in the last few days (sent by the app). */
  ideasLately?: string[];
}) {
  const recent = new Map(a.ctx.recent.map((r) => [r.recipeId, r.daysAgo]));
  // Everything in the kitchen the cook can use, what goes off first at the top, for the new ideas.
  const kitchen = a.ctx.pantry
    .filter((p) => !p.out && p.confidence >= 0.5)
    .sort((x, y) => (x.daysLeft ?? 99) - (y.daysLeft ?? 99))
    .slice(0, 80)
    .map((p) => (p.daysLeft !== null && p.daysLeft <= 3 ? `${a.nameOf(p.key)} (${Math.max(0, p.daysLeft)} days left)` : a.nameOf(p.key)));
  const candidates: ChefCandidate[] = a.ranked.slice(0, CHEF_POOL).map((r, i) => ({
    id: r.recipe.id,
    title: r.recipe.title,
    minutes: r.recipe.timeMin || null,
    uses: r.match.items
      .filter((m) => m.entry)
      .map((m) => ({ item: a.nameOf(m.key), ...(m.entry!.daysLeft !== null && m.entry!.daysLeft <= 3 ? { days_left: m.entry!.daysLeft } : {}) })),
    to_buy: r.match.items.filter((m) => m.status === "missing").map((m) => a.nameOf(m.key)),
    ...(recent.has(r.recipe.id) ? { cooked_days_ago: recent.get(r.recipe.id) } : {}),
    ...(a.shownLately?.has(r.recipe.id) ? { shown_lately: true as const } : {}),
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
    kitchen,
    ...(a.ideasLately?.length ? { ideas_lately: a.ideasLately } : {}),
    // "Use my paneer" on Home: the cook wants these used up, so the ideas are built around them (23 Nov 2026).
    ...(a.ctx.focus?.length ? { use_first: a.ctx.focus.map(a.nameOf) } : {}),
    // The mood chips tapped (comforting, quick, light...): the ideas fit them, not just the library's tags.
    ...(a.craving.tags.length ? { mood: a.craving.tags } : {}),
    ...(a.craving.ingredients.length ? { wants: a.craving.ingredients.map(a.nameOf) } : {}),
    ...(a.cravingText ? { asked_for: a.cravingText } : {}),
    ...(a.craving.maxTimeMin ? { max_minutes: a.craving.maxTimeMin } : {}),
    candidates,
  };
}

export type ChefIdea = { name: string; why: string; uses?: string[] };
export type ChefOut = {
  picks: { id: string; reason: string }[];
  /** Dishes beyond Cookmate's recipes that this kitchen can make. */
  ideas?: ChefIdea[] | null;
  /** The older single idea (pick_chef@1); still read. */
  new_dish?: { name: string; why: string } | null;
};
export const MAX_IDEAS = 3;

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

/**
 * The new dish ideas to show, at most MAX_IDEAS: each passes acceptNewDish, isn't one shown lately, doesn't name
 * something the family avoids, and isn't a repeat. "uses" keeps only short plain item names.
 */
export function acceptIdeas(
  out: ChefOut | null | undefined,
  knownTitles: string[],
  opts: { avoid?: string[]; lately?: string[] } = {},
): ChefIdea[] {
  const raw = out?.ideas?.length ? out.ideas : out?.new_dish ? [out.new_dish] : [];
  const lately = new Set((opts.lately ?? []).map((x) => x.trim().toLowerCase()));
  const pass = (skipLately: boolean) => {
    const seen = new Set<string>();
    const ideas: ChefIdea[] = [];
    for (const d of raw) {
      const ok = acceptNewDish(d, knownTitles);
      if (!ok) continue;
      const low = ok.name.toLowerCase();
      if (seen.has(low) || (skipLately && lately.has(low)) || avoids(opts.avoid ?? [], low)) continue;
      seen.add(low);
      const uses = ((d as ChefIdea).uses ?? []).map((u) => String(u).trim()).filter((u) => u && u.length <= 40).slice(0, 8);
      ideas.push(uses.length ? { ...ok, uses } : ok);
      if (ideas.length === MAX_IDEAS) break;
    }
    return ideas;
  };
  // New ones first; if the model only repeated ideas shown lately, those beat an empty Home (23 Nov 2026).
  const fresh = pass(true);
  return fresh.length ? fresh : pass(false);
}
