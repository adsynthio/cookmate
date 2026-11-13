// suggest-meals (KIT-040/041/042/043/046): "Tonight, decided". One hero pick and two alternates for the meal slot.
// The rules (../_shared/ranking.ts, the same code the app runs in mock mode) rank every recipe and drop anything that
// breaks a diet, allergy, fast or leftover rule. Claude Haiku reads a free-text craving; then the chef step (./chef.ts)
// lets Claude Sonnet choose tonight's three from the rules' best eight, say why, and name one new dish idea. Every
// model step falls back to the rules. Every batch is stored in recommendations with its score breakdown (and who
// chose it) so a pick can always be explained.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { z } from "npm:zod@4.6.5";

import { timedAiCall } from "../_shared/aiLog.ts";
import { type Craving, type Ranked, reasonFor } from "../_shared/ranking.ts";
import { totalTime } from "../_shared/recipes.ts";
import { acceptChef, acceptNewDish, CHEF_POOL, chefBrief, type ChefOut } from "./chef.ts";
import { calendarSummary, checkQuestion, type Kitchen, loadKitchen, rank } from "./engine.ts";
import { localeFor, mergeCraving } from "./logic.ts";
import { checkQuota, quotaResponse } from "../_shared/quota.ts";
import { serverError } from "../_shared/errors.ts";

const MODEL = "claude-haiku-5-5";
// Choosing tonight's picks is the reasoning step, so it gets the stronger model; it falls back to the rules on timeout.
const CHEF_MODEL = "claude-sonnet-5-5";
const KNOWN_TAGS = ["comforting", "quick", "high_protein", "kids_friendly", "light", "fasting", "one_pot", "tiffin", "festive"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

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

async function modelCraving(client: Anthropic, householdId: string, text: string): Promise<Partial<Craving> | null> {
  const r = await timedAiCall({ householdId, task: "craving_interpret", model: MODEL, promptVersion: "craving_interpret@1" }, () => client.messages.parse(
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
  ));
  if (r.stop_reason === "refusal" || !r.parsed_output) return null;
  const o = r.parsed_output;
  return { tags: o.tags, maxTimeMin: o.max_time_min, spiceDelta: o.spice_delta, course: o.course };
}

const ChefOutSchema = z.object({
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
  new_dish: z.object({ name: z.string(), why: z.string() }).nullable(),
});

const CHEF_SYSTEM = `You are the cook's friend in an Indian family kitchen, choosing what to make for one meal.
You get the household's facts and up to eight candidate dishes. Every candidate already fits everyone's diet, allergies,
fasts and equipment, so choose only from them, by id.

Choose three, best first, the way a thoughtful home cook would:
- Leftovers ready to eat come first: if there is dal or kadhi left over, don't cook the same thing again; pick what
  goes with it or something different.
- Use what is going off soon (days_left 0 to 2) before it spoils.
- Fit the people eating: the children, the spice level, what they like; nothing from "avoid".
- Not the same dish as the last few days; three different kinds of dish (not three paneer dishes).
- Fit the meal, the time asked for, the season (warming food in winter, light food in summer, monsoon snacks) and
  any festival today.
- Prefer dishes with nothing to buy.

For each pick write one warm line (at most 90 characters) saying the real reason, naming the actual ingredient,
person or number it rests on. Write in the language given: Hindi in Devanagari for hi-IN, Hinglish in Latin script
for hi-Latn-IN, Indian English for en-IN. No health, nutrition or weight claims. No emoji.

new_dish: optionally, one everyday Indian home dish that is NOT among the candidates' titles and that this kitchen
can make with at most two things to buy (e.g. "Aloo Methi", "Tomato Rice"), with one line on why it suits tonight.
Only dishes that fit everyone's diet. Null if nothing good comes to mind.`;

async function modelChef(client: Anthropic, householdId: string, language: string, brief: unknown) {
  const r = await timedAiCall({ householdId, task: "pick_chef", model: CHEF_MODEL, promptVersion: "pick_chef@1" }, () => client.messages.parse(
    {
      model: CHEF_MODEL,
      max_tokens: 800,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(ChefOutSchema) },
      system: [{ type: "text", cache_control: { type: "ephemeral" }, text: CHEF_SYSTEM }],
      messages: [{ role: "user", content: `Language: ${language}\n${JSON.stringify(brief)}` }],
    },
    { timeout: 4000 },
  ));
  return r.stop_reason === "refusal" ? null : (r.parsed_output as ChefOut | null);
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
  // Finding 23: a per-household limit on AI calls.
  const quota = await checkQuota(householdId);
  if (!quota.ok) return quotaResponse(quota, CORS);

  const now = new Date();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = serviceKey ? createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false } }) : null;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const client = apiKey ? new Anthropic() : null;
  const locale = localeFor(body.language_code);

  let kitchen: Kitchen;
  try {
    kitchen = await loadKitchen(sb, admin, householdId, {
      slot: body.meal_slot,
      craving: body.craving,
      chips: body.chips,
      whoEating: body.who_eating,
      focus: body.focus,
      locale,
    }, now, {
      interpretCraving: client
        ? async (text: string, base: Craving) => {
          try {
            return mergeCraving(base, await modelCraving(client, householdId, text), KNOWN_TAGS);
          } catch (err) {
            console.error("craving_interpret failed", err instanceof Error ? err.message : err);
            return base;
          }
        }
        : undefined,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "could not load the kitchen" }, 500);
  }
  const ranking = rank(kitchen, locale);
  const { templates, ctx, slot, craving, nameOf } = ranking;
  const batchId = crypto.randomUUID();
  const docById = new Map(kitchen.docs.map((d) => [d.id!, d]));

  // The chef step: the model chooses tonight's three from the rules' best few and says why, and may name a new dish.
  // Without a model, or when its answer fails the checks, the rules' picks and reasons stand.
  let picks = ranking.picks;
  let reasons = templates;
  let newDish: { name: string; why: string } | null = null;
  let chose: "model" | "rules" = "rules";
  const anchorsOf = (p: Ranked, t: string) => [
    ...p.match.items.filter((m) => m.entry?.daysLeft !== null && (m.entry?.daysLeft ?? 9) <= 2).map((m) => nameOf(m.key)),
    ...ctx.eaters.filter((e) => t.includes(e.name)).map((e) => e.name),
    ...(t.match(/\d+/g) ?? []),
  ];
  if (client && ranking.ranked.length) {
    const pool = ranking.ranked.slice(0, CHEF_POOL);
    const templateOf = (p: Ranked) => reasonFor(p, ctx, locale, nameOf);
    try {
      const brief = chefBrief({
        ranked: pool,
        templates: new Map(pool.map((p) => [p.recipe.id, templateOf(p)])),
        ctx,
        slot,
        today: kitchen.today,
        festivals: kitchen.calendarToday.map((e) => e.name),
        craving,
        cravingText: body.craving ?? null,
        nameOf,
      });
      const out = await modelChef(client, householdId, body.language_code ?? "en-IN", brief);
      const accepted = acceptChef(out, pool, ranking.picks, templateOf, anchorsOf);
      if (accepted) {
        picks = accepted.picks;
        reasons = accepted.reasons;
        chose = "model";
      }
      newDish = acceptNewDish(out?.new_dish ?? null, kitchen.docs.map((d) => d.title));
    } catch (err) {
      console.error("pick_chef failed", err instanceof Error ? err.message : err);
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
    score_breakdown: { ...p.breakdown, chosen_by: chose === "model" ? 1 : 0 },
    reason_text: reasons[i],
    uses_item_ids: p.match.items.filter((m) => m.entry).map((m) => m.entry!.itemId),
    missing: p.match.items.filter((m) => m.status === "missing").map((m) => ({ ingredient: m.key, substitute: m.substitute ?? null })),
    status: "shown",
  }));
  const ids: string[] = [];
  if (rows.length) {
    const { data: inserted, error } = await sb.from("recommendations").insert(rows).select("id, rank");
    if (error) return serverError(error, json);
    for (const r of (inserted ?? []).sort((a, b) => a.rank - b.rank)) ids.push(r.id);
  }

  // KIT-035: at most one "Still have X?" a day, and only when the answer changes tonight's pick.
  const check = await checkQuestion(sb, householdId, ranking).catch(() => null);

  return json({
    batch_id: batchId,
    meal_slot: slot,
    check,
    calendar: calendarSummary(kitchen),
    chosen_by: chose,
    new_dish: newDish,
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
