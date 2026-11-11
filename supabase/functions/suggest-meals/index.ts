// suggest-meals (KIT-040/041/042/043/046): "Tonight, decided". One hero pick and two alternates for the meal slot.
// Ranking is deterministic (../_shared/ranking.ts, the same code the app runs in mock mode); Claude Haiku is only
// used to read a free-text craving and to reword the reason, and both fall back to rules. Every batch is stored in
// recommendations with its score breakdown so a pick can always be explained.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { z } from "npm:zod@4.6.5";

import { buildIndex, normalise } from "../_shared/pantryParse.ts";
import {
  choosePicks,
  type Craving,
  defaultBudget,
  interpretCraving,
  localHour,
  type MealSlot,
  rankRecipes,
  reasonFor,
  type Ranked,
  type RankContext,
  slotForHour,
} from "../_shared/ranking.ts";
import { type RecipeRow, recipeDocFromRow, toRankRecipe, totalTime } from "../_shared/recipes.ts";
import {
  acceptReason,
  type CalendarRow,
  eatersFromRows,
  excludedRecipes,
  type InventoryRow,
  localDate,
  localeFor,
  type MemberRow,
  type MemoryRow,
  mergeCraving,
  pantryFromRows,
  prefsFromCalendar,
  prefsFromMemories,
  recentFrom,
  SLOTS,
  weightsFrom,
} from "./logic.ts";

const MODEL = "claude-haiku-5-5";
const KNOWN_TAGS = ["comforting", "quick", "high_protein", "kids_friendly", "light", "fasting", "one_pot", "tiffin", "festive"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const RANK_SELECT =
  "id, slug, title, titles, description, cuisine_region, course, diet, base_servings, prep_time_min, cook_time_min, " +
  "difficulty, spice_level, equipment, tags, flavor_profile, food_groups, review_status, " +
  "recipe_ingredients(display_name, quantity, unit, local_measure, is_optional, group_name, role, substitutes, sort_order, ingredients(canonical_name)), " +
  "recipe_variation_rules(rule_type, condition, action, note)";

type Body = {
  household_id?: string;
  member_id?: string;
  meal_slot?: string;
  craving?: string;
  chips?: string[];
  who_eating?: string[];
  focus?: string[];
  language_code?: string;
};

// --- model helpers (optional) ----------------------------------------------------------------------------------

const CravingOut = z.object({
  tags: z.array(z.string()),
  max_time_min: z.number().nullable(),
  spice_delta: z.number(),
  course: z.enum(["breakfast", "main", "side", "snack", "tiffin"]).nullable(),
});

async function modelCraving(client: Anthropic, text: string): Promise<Partial<Craving> | null> {
  const r = await client.messages.parse(
    {
      model: MODEL,
      max_tokens: 150,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(CravingOut) },
      system: [{
        type: "text",
        cache_control: { type: "ephemeral" },
        text: `Turn what an Indian home cook says they feel like eating (Hindi, Hinglish or English) into filters.
tags: only from ${KNOWN_TAGS.join(", ")}. max_time_min: only if they mention time. spice_delta: +1 for spicy/teekha,
-1 for mild/feeka, else 0. course: only if they name a meal type. Never invent preferences that were not said.`,
      }],
      messages: [{ role: "user", content: text }],
    },
    { timeout: 1500 },
  );
  if (r.stop_reason === "refusal" || !r.parsed_output) return null;
  const o = r.parsed_output;
  return { tags: o.tags, maxTimeMin: o.max_time_min, spiceDelta: o.spice_delta, course: o.course };
}

const ReasonsOut = z.object({ reasons: z.array(z.object({ id: z.string(), text: z.string() })) });

async function modelReasons(
  client: Anthropic,
  language: string,
  items: { id: string; title: string; template: string; facts: Record<string, number> }[],
): Promise<Map<string, string>> {
  const r = await client.messages.parse(
    {
      model: MODEL,
      max_tokens: 300,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(ReasonsOut) },
      system: [{
        type: "text",
        cache_control: { type: "ephemeral" },
        text: `You reword one-line reasons for dinner picks in an Indian family cooking app. Keep the same facts as the
draft reason (same items, numbers and names), make it sound warm and natural, at most 90 characters, in the language
given (Hindi in Devanagari for hi-IN, Hinglish in Latin script for hi-Latn-IN, Indian English for en-IN).
No health or nutrition claims. No emoji.`,
      }],
      messages: [{ role: "user", content: `Language: ${language}\n${JSON.stringify(items)}` }],
    },
    { timeout: 1500 },
  );
  const out = new Map<string, string>();
  for (const x of r.parsed_output?.reasons ?? []) out.set(x.id, x.text);
  return out;
}

// --- handler ---------------------------------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const householdId = body.household_id ?? "";
  if (!householdId) return json({ error: "household_id is required" }, 400);
  if ((body.craving ?? "").length > 300) return json({ error: "craving is too long" }, 413);

  // The user's own token: RLS decides what is visible, exactly as in the app.
  const sb: SupabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return json({ error: "sign in first" }, 401);
  const { data: me } = await sb
    .from("household_members")
    .select("id")
    .eq("household_id", householdId)
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!me) return json({ error: "not a member of this household" }, 403);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data: hh } = await sb.from("households").select("timezone").eq("id", householdId).maybeSingle();
  const tz = hh?.timezone ?? "Asia/Kolkata";
  const today = localDate(now, tz);
  const slot: MealSlot = SLOTS.includes(body.meal_slot as MealSlot) ? (body.meal_slot as MealSlot) : slotForHour(localHour(now, tz));

  const [members, inventory, recipes, memories, calendar, recs, sessions, equipment, disliked, dismissed] = await Promise.all([
    sb.from("household_members").select("id, display_name, age_group, diet, taste_profiles(spice)")
      .eq("household_id", householdId).eq("status", "active"),
    sb.from("inventory_items").select("id, confidence, expiry_date, staple_level, ingredients(canonical_name, names)")
      .eq("household_id", householdId).eq("status", "active"),
    sb.from("recipes").select(RANK_SELECT).is("household_id", null).is("parent_recipe_id", null),
    sb.from("memories").select("polarity, scope, expires_at, ingredients(canonical_name)")
      .eq("household_id", householdId).eq("status", "active").not("subject_ingredient_id", "is", null),
    sb.from("calendar_events").select("rules, event_date, end_date").lte("event_date", today)
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
  ]);
  const failed = [members, inventory, recipes].find((r) => r.error);
  if (failed?.error) return json({ error: failed.error.message }, 500);

  // Ranking weights are a feature flag (KIT-041); flags are only readable with the service role.
  let weightsRules: unknown = null;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey) {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false } });
    const { data: flag } = await admin.from("feature_flags").select("enabled, rules").eq("key", "ranking_weights").maybeSingle();
    if (flag?.enabled) weightsRules = flag.rules;
  }

  const excluded = excludedRecipes(
    (disliked.data ?? []) as { subject_recipe_id: string | null }[],
    (dismissed.data ?? []) as { recipe_id: string | null }[],
  );
  const docs = ((recipes.data ?? []) as unknown as RecipeRow[]).map(recipeDocFromRow).filter((d) => !excluded.has(d.id!));
  const invRows = (inventory.data ?? []) as unknown as InventoryRow[];
  const memPrefs = prefsFromMemories((memories.data ?? []) as unknown as MemoryRow[], now);
  // Events running today: single-day events on today, multi-day ones that haven't ended.
  const calPrefs = prefsFromCalendar(
    ((calendar.data ?? []) as unknown as (CalendarRow & { event_date: string; end_date: string | null })[])
      .filter((e) => (e.end_date ?? e.event_date) >= today),
  );
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
  let craving = interpretCraving(body.craving ?? "", body.chips ?? [], findIngredients);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const client = apiKey ? new Anthropic() : null;
  const cravingText = (body.craving ?? "").trim();
  if (client && cravingText && !craving.tags.length && !craving.ingredients.length && craving.maxTimeMin === null) {
    try {
      craving = mergeCraving(craving, await modelCraving(client, cravingText), KNOWN_TAGS);
    } catch (err) {
      console.error("craving_interpret failed", err instanceof Error ? err.message : err);
    }
  }

  const ctx: RankContext = {
    slot,
    eaters: eatersFromRows((members.data ?? []) as unknown as MemberRow[], body.who_eating),
    pantry: pantryFromRows(invRows, today),
    staples: [], // filled below from the catalog
    equipment: kit.length ? kit : null,
    avoid: [...new Set([...memPrefs.avoid, ...calPrefs.avoid])],
    like: memPrefs.like,
    prefer: calPrefs.prefer,
    recent,
    craving,
    timeBudgetMin: defaultBudget(slot),
    weights: weightsFrom(weightsRules),
    focus: body.focus?.filter((f) => typeof f === "string").slice(0, 10),
  };
  const { data: staples } = await sb.from("ingredients").select("canonical_name").eq("is_staple", true);
  ctx.staples = ((staples ?? []) as { canonical_name: string }[]).map((s) => s.canonical_name);

  const locale = localeFor(body.language_code);
  const names = new Map(invRows.filter((r) => r.ingredients).map((r) => [r.ingredients!.canonical_name, r.ingredients!.names]));
  const nameOf = (key: string) => {
    const n = names.get(key);
    return (locale === "hi" ? n?.hi : locale === "hinglish" ? n?.["hi-Latn"] : undefined) ?? key;
  };

  const picks: Ranked[] = choosePicks(rankRecipes(docs.map(toRankRecipe), ctx));
  const batchId = crypto.randomUUID();
  const docById = new Map(docs.map((d) => [d.id!, d]));
  const templates = picks.map((p) => reasonFor(p, ctx, locale, nameOf));

  let reasons = templates;
  if (client && picks.length) {
    try {
      const reworded = await modelReasons(client, body.language_code ?? "en-IN", picks.map((p, i) => ({
        id: String(i),
        title: p.recipe.title,
        template: templates[i]!,
        facts: p.breakdown,
      })));
      reasons = templates.map((t, i) => {
        const p = picks[i]!;
        const anchors = [
          ...p.match.items.filter((m) => m.entry?.daysLeft !== null && (m.entry?.daysLeft ?? 9) <= 2).map((m) => nameOf(m.key)),
          ...ctx.eaters.filter((e) => t.includes(e.name)).map((e) => e.name),
          ...(t.match(/\d+/g) ?? []),
        ];
        return acceptReason(t, reworded.get(String(i)), anchors);
      });
    } catch (err) {
      console.error("pick_reasons failed", err instanceof Error ? err.message : err);
    }
  }

  const rows = picks.map((p, i) => ({
    household_id: householdId,
    member_id: body.member_id ?? me.id,
    batch_id: batchId,
    meal_slot: slot,
    context: { craving: body.craving ?? null, chips: body.chips ?? [], who_eating: body.who_eating ?? null, focus: ctx.focus ?? null, interpreted: craving },
    recipe_id: p.recipe.id,
    rank: i,
    score: p.score,
    score_breakdown: p.breakdown,
    reason_text: reasons[i],
    uses_item_ids: p.match.items.filter((m) => m.entry).map((m) => m.entry!.itemId),
    missing: p.match.items.filter((m) => m.status === "missing").map((m) => ({ ingredient: m.key, substitute: m.substitute ?? null })),
    status: "shown",
  }));
  const ids: string[] = [];
  if (rows.length) {
    const { data: inserted, error } = await sb.from("recommendations").insert(rows).select("id, rank");
    if (error) return json({ error: error.message }, 500);
    for (const r of (inserted ?? []).sort((a, b) => a.rank - b.rank)) ids.push(r.id);
  }

  return json({
    batch_id: batchId,
    meal_slot: slot,
    picks: picks.map((p, i) => {
      const d = docById.get(p.recipe.id)!;
      return {
        recommendation_id: ids[i] ?? null,
        recipe: { id: d.id, slug: d.slug, title: d.title, titles: d.titles ?? null, total_time_min: totalTime(d) || null },
        reason_text: reasons[i],
        uses: p.match.items.filter((m) => m.entry).map((m) => m.entry!.key),
        missing: p.match.items.filter((m) => m.status === "missing").map((m) => m.key),
        have: p.match.have,
        total: p.match.total,
        score: p.score,
      };
    }),
  });
});
