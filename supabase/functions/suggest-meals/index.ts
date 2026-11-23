// suggest-meals (KIT-040/041/042/043/046): "Tonight, decided". One hero pick and two alternates for the meal slot.
// The rules (../_shared/ranking.ts, the same code the app runs in mock mode) rank every recipe and drop anything that
// breaks a diet, allergy, fast or leftover rule. Claude Haiku reads a free-text craving; then the chef step (./chef.ts)
// lets Claude Sonnet choose tonight's three from the rules' best eight, say why, and name two or three new dishes
// this kitchen can make beyond Cookmate's recipes, avoiding what Home showed lately (sent by the app). Every
// model step falls back to the rules. Every batch is stored in recommendations with its score breakdown (and who
// chose it) so a pick can always be explained.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { z } from "npm:zod@4.6.5";

import { timedAiCall } from "../_shared/aiLog.ts";
import { type Craving, type Ranked, reasonFor } from "../_shared/ranking.ts";
import { totalTime } from "../_shared/recipes.ts";
import { acceptChef, acceptIdeas, CHEF_POOL, chefBrief, type ChefIdea, type ChefOut } from "./chef.ts";
import { calendarSummary, checkQuestion, type Kitchen, loadKitchen, rank } from "./engine.ts";
import { localeFor, mergeCraving } from "./logic.ts";
import { checkQuota, quotaResponse } from "../_shared/quota.ts";
import { creditsFor } from "../_shared/credits.ts";
import { serverError } from "../_shared/errors.ts";
import { thinkingOff } from "../_shared/thinking.ts";

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
  /** Recipe ids Home showed in the last few days, so tonight's picks change. */
  shown_lately?: string[];
  /** New dish ideas Home showed in the last few days, so new ones come. */
  ideas_lately?: string[];
  /** Recipe ids whose soaking or marinating is done (the app's plan). */
  prepped?: string[];
};

/** A short list of short strings from the request, or []. */
const shortList = (x: unknown, max: number) =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 60).slice(0, max) : [];

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
      ...thinkingOff(MODEL),
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
    { timeout: 3000, maxRetries: 0 },
  ));
  if (r.stop_reason === "refusal" || !r.parsed_output) return null;
  const o = r.parsed_output;
  return { tags: o.tags, maxTimeMin: o.max_time_min, spiceDelta: o.spice_delta, course: o.course };
}

const ChefOutSchema = z.object({
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
  ideas: z.array(z.object({ name: z.string(), why: z.string(), uses: z.array(z.string()) })),
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
- Something new each time: prefer candidates that are not shown_lately; pick a shown_lately one only when it is
  clearly the best tonight (it uses leftovers or something about to go off).
- Fit the meal, the time asked for, the season (warming food in winter, light food in summer, monsoon snacks) and
  any festival today.
- Prefer dishes with nothing to buy.

For each pick write one warm line (at most 90 characters) saying the real reason, naming the actual ingredient,
person or number it rests on. Write in the language given: Hindi in Devanagari for hi-IN, Hinglish in Latin script
for hi-Latn-IN, Indian English for en-IN. No health, nutrition or weight claims. No emoji.

candidates can be empty (none of Cookmate's recipes fits this meal): then return no picks, only ideas.

ideas: three dishes this kitchen can make for this meal that are NOT among the candidates' titles and not in
ideas_lately. If "use_first" is given, the cook tapped those to use up: every idea is built around at least one of
them. If "mood" is given (comforting, quick, light, high_protein, kids_friendly, one_pot), every idea fits it; "wants"
names ingredients the cook asked for. Think like a creative Indian home cook who can make almost anything from what is in "kitchen" plus
everyday staples (salt, oil, ghee, spices, onion, tomato, atta, rice, dals), swapping by job (Eno for baking soda, curd
for cream, besan to bind) and buying at most two small things. Make them exciting and different from each other:
mix regions and styles (Punjabi, South Indian, Gujarati, Bengali, Maharashtrian, Indo-Chinese, street food, a
restaurant favourite made at home, a festive or weekend special), and build at least one around leftovers or what
goes off soon. Real dishes with their real names (e.g. "Pav Bhaji", "Masala Dosa", "Paneer Tikka Masala", "Veg Hakka
Noodles", "Dahi Vada", "Stuffed Capsicum", "Besan ke Gatte", "Aloo Tikki Chaat"), right for the meal, the season and
the time asked for. The main ingredient an idea is named for (the dal, beans, paneer, meat, egg or vegetable) must
be in "kitchen": no Rajma without rajma. Every idea fits everyone's diet, any fast today and nothing from "avoid". "why": one warm line, at
most 90 characters, naming what in the kitchen it uses; "uses": those kitchen items. Same language rules as the
reasons; no health claims, no emoji.`;

async function modelChef(client: Anthropic, householdId: string, language: string, brief: unknown) {
  const r = await timedAiCall({ householdId, task: "pick_chef", model: CHEF_MODEL, promptVersion: "pick_chef@4" }, () => client.messages.parse(
    {
      model: CHEF_MODEL,
      max_tokens: 1400,
      ...thinkingOff(CHEF_MODEL),
      output_config: { effort: "low", format: zodOutputFormat(ChefOutSchema) },
      system: [{ type: "text", cache_control: { type: "ephemeral" }, text: CHEF_SYSTEM }],
      messages: [{ role: "user", content: `Language: ${language}\n${JSON.stringify(brief)}` }],
    },
    // Ideas make the answer longer; Home shows the breathing placeholder meanwhile and keeps the picks 30 minutes.
    { timeout: 12_000, maxRetries: 0 },
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
      prepped: shortList(body.prepped, 10),
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
  let ideas: ChefIdea[] = [];
  const shownLately = new Set(shortList(body.shown_lately, 30));
  const ideasLately = shortList(body.ideas_lately, 30);
  let chose: "model" | "rules" = "rules";
  const anchorsOf = (p: Ranked, t: string) => [
    ...p.match.items.filter((m) => m.entry?.daysLeft !== null && (m.entry?.daysLeft ?? 9) <= 2).map((m) => nameOf(m.key)),
    ...ctx.eaters.filter((e) => t.includes(e.name)).map((e) => e.name),
    ...(t.match(/\d+/g) ?? []),
  ];
  // T1: out of AI credits, the rules' picks stand too. With no library dish for this meal (breakfast with no poha or
  // besan) the chef still runs, for new dishes from the kitchen instead of "nothing fits" (23 Nov 2026).
  if (client && (await creditsFor(sb, householdId)).allowed) {
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
        shownLately,
        ideasLately,
      });
      const out = await modelChef(client, householdId, body.language_code ?? "en-IN", brief);
      const accepted = acceptChef(out, pool, ranking.picks, templateOf, anchorsOf);
      if (accepted) {
        picks = accepted.picks;
        reasons = accepted.reasons;
        chose = "model";
      }
      ideas = acceptIdeas(out, kitchen.docs.map((d) => d.title), { avoid: ctx.avoid, lately: ideasLately });
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
    ideas,
    // Dishes to plan for later because they need soaking or marinating first (Home's evening "plan ahead").
    ahead: ranking.ahead.map((r) => {
      const d = docById.get(r.recipe.id)!;
      return { recipe: { id: d.id, slug: d.slug, title: d.title, titles: d.titles ?? null }, hours: r.recipe.aheadHours ?? 0 };
    }),
    // Older app versions read one idea.
    new_dish: ideas[0] ? { name: ideas[0].name, why: ideas[0].why } : null,
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
