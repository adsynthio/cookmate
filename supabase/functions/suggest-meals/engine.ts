// The pick engine behind suggest-meals and notify: read the household's kitchen, memories and calendar, then rank.
// suggest-meals runs it with the user's own token (RLS decides what is visible); notify runs it with the service
// role, so every household-scoped query here filters by household_id explicitly and recipe visibility is applied
// by hand (published, or drafts while show_draft_recipes is on).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";

import { type CalendarEvent, calendarPrefs, eventsOn, fastsToOffer } from "../_shared/calendar.ts";
import { buildIndex, normalise } from "../_shared/pantryParse.ts";
import {
  choosePicks,
  type Craving,
  defaultBudget,
  interpretCraving,
  localHour,
  type Locale,
  type MealSlot,
  type PantryCheck,
  pantryCheck,
  rankRecipes,
  type Ranked,
  type RankContext,
  type RankRecipe,
  reasonFor,
  slotForHour,
} from "../_shared/ranking.ts";
import { type RecipeDoc, type RecipeRow, recipeDocFromRow, toRankRecipe } from "../_shared/recipes.ts";
import {
  eatersFromRows,
  excludedRecipes,
  type InventoryRow,
  localDate,
  type MemberRow,
  type MemoryRow,
  cookedFromRows,
  pantryFromRows,
  prefsFromMemories,
  reactionsFromRows,
  type ReactionRow,
  recentFrom,
  SLOTS,
  weightsFrom,
} from "./logic.ts";

export const RANK_SELECT =
  "id, slug, title, titles, description, cuisine_region, course, diet, base_servings, prep_time_min, cook_time_min, " +
  "difficulty, spice_level, equipment, tags, flavor_profile, food_groups, review_status, " +
  "recipe_ingredients(display_name, quantity, unit, local_measure, is_optional, group_name, role, substitutes, sort_order, ingredients(canonical_name)), " +
  "recipe_variation_rules(rule_type, condition, action, note)";

export type PickRequest = {
  slot?: string;
  craving?: string;
  chips?: string[];
  whoEating?: string[];
  focus?: string[];
  locale: Locale;
};

export type Kitchen = {
  slot: MealSlot;
  today: string;
  tz: string;
  ctx: RankContext;
  docs: RecipeDoc[];
  recipes: RankRecipe[];
  inventory: InventoryRow[];
  calendarToday: CalendarEvent[];
  craving: Craving;
  nameOf: (key: string) => string;
};

export type Ranking = Kitchen & { picks: Ranked[]; templates: string[]; ranked: Ranked[] };

/**
 * Load everything the ranking needs. `admin` (service role) reads feature flags; when `sb` is itself the service
 * role (notify), pass asService so unpublished recipes stay hidden unless drafts are switched on.
 */
export async function loadKitchen(
  sb: SupabaseClient,
  admin: SupabaseClient | null,
  householdId: string,
  req: PickRequest,
  now: Date,
  opts: { asService?: boolean; interpretCraving?: (text: string, base: Craving) => Promise<Craving> } = {},
): Promise<Kitchen> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data: hh } = await sb.from("households").select("timezone, region").eq("id", householdId).maybeSingle();
  const tz = (hh?.timezone as string | undefined) ?? "Asia/Kolkata";
  const region = (hh?.region as string | null | undefined) ?? null;
  const today = localDate(now, tz);
  const slot: MealSlot = SLOTS.includes(req.slot as MealSlot) ? (req.slot as MealSlot) : slotForHour(localHour(now, tz));

  // Flags are only readable with the service role.
  let weightsRules: unknown = null;
  let drafts = false;
  if (admin) {
    const { data: flags } = await admin.from("feature_flags").select("key, enabled, rules").in("key", ["ranking_weights", "show_draft_recipes"]);
    for (const f of (flags ?? []) as { key: string; enabled: boolean; rules: unknown }[]) {
      if (f.key === "ranking_weights" && f.enabled) weightsRules = f.rules;
      if (f.key === "show_draft_recipes") drafts = f.enabled;
    }
  }
  let recipesQuery = sb.from("recipes").select(RANK_SELECT).is("household_id", null).is("parent_recipe_id", null);
  if (opts.asService && !drafts) recipesQuery = recipesQuery.eq("is_published", true);

  const [members, inventory, recipes, memories, calendar, recs, sessions, equipment, disliked, dismissed, staples] = await Promise.all([
    sb.from("household_members").select("id, display_name, age_group, diet, taste_profiles(spice)")
      .eq("household_id", householdId).eq("status", "active"),
    sb.from("inventory_items").select("id, confidence, expiry_date, staple_level, state, custom_name, ingredients(canonical_name, names)")
      .eq("household_id", householdId).eq("status", "active"),
    recipesQuery,
    sb.from("memories").select("polarity, scope, expires_at, member_id, subject_recipe_id, attributes, ingredients(canonical_name)")
      .eq("household_id", householdId).eq("status", "active").not("subject_ingredient_id", "is", null),
    sb.from("calendar_events").select("id, household_id, event_date, end_date, kind, name, regions, rules").lte("event_date", today)
      .gte("event_date", localDate(new Date(now.getTime() - 60 * 86_400_000), tz))
      .or(`household_id.is.null,household_id.eq.${householdId}`),
    sb.from("recommendations").select("recipe_id, acted_at").eq("household_id", householdId)
      .in("status", ["accepted", "cooked"]).gte("acted_at", weekAgo),
    sb.from("cooking_sessions").select("recipe_id, completed_at").eq("household_id", householdId)
      .eq("status", "completed").gte("completed_at", weekAgo),
    sb.from("kitchen_equipment").select("equipment_type").eq("household_id", householdId),
    sb.from("memories").select("subject_recipe_id").eq("household_id", householdId).eq("status", "active")
      .lt("polarity", 0).eq("attributes->>about", "dislike").not("subject_recipe_id", "is", null),
    sb.from("recommendations").select("recipe_id").eq("household_id", householdId).eq("status", "dismissed")
      .gte("acted_at", new Date(now.getTime() - 18 * 3_600_000).toISOString()),
    sb.from("ingredients").select("canonical_name").eq("is_staple", true),
  ]);
  const failed = [members, inventory, recipes].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const excluded = excludedRecipes(
    (disliked.data ?? []) as { subject_recipe_id: string | null }[],
    (dismissed.data ?? []) as { recipe_id: string | null }[],
  );
  const docs = ((recipes.data ?? []) as unknown as RecipeRow[]).map(recipeDocFromRow).filter((d) => !excluded.has(d.id!));
  const invRows = (inventory.data ?? []) as unknown as InventoryRow[];
  const eaters = eatersFromRows((members.data ?? []) as unknown as MemberRow[], req.whoEating);
  const memPrefs = prefsFromMemories((memories.data ?? []) as unknown as MemoryRow[], now, eaters.map((e) => e.id));
  const calendarToday = eventsOn((calendar.data ?? []) as unknown as CalendarEvent[], today, region);
  const calPrefs = calendarPrefs(calendarToday);
  const recent = recentFrom([
    ...((recs.data ?? []) as { recipe_id: string; acted_at: string }[]).map((r) => ({ recipe_id: r.recipe_id, at: r.acted_at })),
    ...((sessions.data ?? []) as { recipe_id: string; completed_at: string }[]).map((r) => ({ recipe_id: r.recipe_id, at: r.completed_at })),
  ], now);
  const kit = ((equipment.data ?? []) as { equipment_type: string }[]).map((e) => e.equipment_type);

  // Ingredient names the craving might mention, from the recipes we can rank.
  const index = buildIndex(docs.flatMap((d) => d.ingredients.map((i) => ({ name: i.ingredient }))));
  const findIngredients = (text: string) => {
    const words = normalise(text).split(" ").filter(Boolean);
    return [...new Set(words.map((w) => index.get(w)?.name).filter((n): n is string => !!n))];
  };
  let craving = interpretCraving(req.craving ?? "", req.chips ?? [], findIngredients);
  const cravingText = (req.craving ?? "").trim();
  if (opts.interpretCraving && cravingText && !craving.tags.length && !craving.ingredients.length && craving.maxTimeMin === null) {
    craving = await opts.interpretCraving(cravingText, craving);
  }

  // D2: per-person reactions to dishes ("Aarav loved it", "not for Riya"), saved from the finish sheet.
  const { data: reactionRows } = await sb.from("memories").select("polarity, member_id, subject_recipe_id")
    .eq("household_id", householdId).eq("status", "active").eq("attributes->>about", "reaction")
    .not("member_id", "is", null).not("subject_recipe_id", "is", null);
  const ctx: RankContext = {
    slot,
    eaters,
    reactions: reactionsFromRows((reactionRows ?? []) as ReactionRow[]),
    pantry: pantryFromRows(invRows, today),
    alreadyCooked: cookedFromRows(invRows, today),
    staples: ((staples.data ?? []) as { canonical_name: string }[]).map((s) => s.canonical_name),
    equipment: kit.length ? kit : null,
    avoid: [...new Set([...memPrefs.avoid, ...calPrefs.avoid])],
    like: memPrefs.like,
    prefer: calPrefs.prefer,
    recent,
    craving,
    timeBudgetMin: defaultBudget(slot),
    weights: weightsFrom(weightsRules),
    focus: req.focus?.filter((f) => typeof f === "string").slice(0, 10),
  };

  const names = new Map(invRows.filter((r) => r.ingredients).map((r) => [r.ingredients!.canonical_name, r.ingredients!.names]));
  const nameOf = (key: string) => {
    const n = names.get(key);
    return (req.locale === "hi" ? n?.hi : req.locale === "hinglish" ? n?.["hi-Latn"] : undefined) ?? key;
  };

  return { slot, today, tz, ctx, docs, recipes: docs.map(toRankRecipe), inventory: invRows, calendarToday, craving, nameOf };
}

export function rank(k: Kitchen, locale: Locale): Ranking {
  const ranked = rankRecipes(k.recipes, k.ctx);
  const picks = choosePicks(ranked);
  return { ...k, picks, ranked, templates: picks.map((p) => reasonFor(p, k.ctx, locale, k.nameOf)) };
}

/** The one check question for today, if any (KIT-035): proposed here, capped and remembered by the database. */
export async function checkQuestion(
  sb: SupabaseClient,
  householdId: string,
  r: Ranking,
): Promise<{ item_id: string; name: string; if_yes: string | null; if_no: string | null } | null> {
  // Only an ordinary pick is worth correcting: a craving or "use these first" already narrows it.
  const proposed: PantryCheck | null = r.ctx.focus?.length || r.craving.tags.length || r.craving.ingredients.length
    ? null
    : pantryCheck(r.recipes, r.ctx);
  const { data: itemId, error } = await sb.rpc("pantry_check_today", { p_household: householdId, p_item: proposed?.itemId ?? null });
  if (error || !itemId) return null;
  const row = r.inventory.find((i) => i.id === itemId);
  if (!row?.ingredients) return null;
  const title = (id: string | undefined) => (id ? r.docs.find((d) => d.id === id)?.title ?? null : null);
  const same = proposed?.itemId === itemId;
  return {
    item_id: itemId as string,
    name: r.nameOf(row.ingredients.canonical_name),
    if_yes: same ? title(proposed!.ifYes) : null,
    if_no: same ? title(proposed!.ifNo) : null,
  };
}

/** Today's festivals and fasts for the Home screen, and the fast to offer keeping (if any). */
export function calendarSummary(r: Kitchen) {
  const offer = fastsToOffer(r.calendarToday)[0];
  return {
    today: r.calendarToday.map((e) => ({ id: e.id ?? null, name: e.name, kind: e.kind, kept: !!e.household_id, names: e.rules?.names ?? null })),
    offer_fast: offer ? { id: offer.id ?? null, name: offer.name, names: offer.rules?.names ?? null, note: offer.rules?.note ?? null } : null,
  };
}
