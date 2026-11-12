// suggest-meals (KIT-040/041/042/043/046): "Tonight, decided". One hero pick and two alternates for the meal slot.
// Ranking is deterministic (../_shared/ranking.ts, the same code the app runs in mock mode); Claude Haiku is only
// used to read a free-text craving and to reword the reason, and both fall back to rules. Every batch is stored in
// recommendations with its score breakdown so a pick can always be explained.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { z } from "npm:zod@4.6.5";

import { timedAiCall } from "../_shared/aiLog.ts";
import { type Craving } from "../_shared/ranking.ts";
import { totalTime } from "../_shared/recipes.ts";
import { calendarSummary, checkQuestion, type Kitchen, loadKitchen, rank } from "./engine.ts";
import { acceptReason, localeFor, mergeCraving } from "./logic.ts";

const MODEL = "claude-haiku-5-5";
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

const ReasonsOut = z.object({ reasons: z.array(z.object({ id: z.string(), text: z.string() })) });

async function modelReasons(
  client: Anthropic,
  householdId: string,
  language: string,
  items: { id: string; title: string; template: string; facts: Record<string, number> }[],
): Promise<Map<string, string>> {
  const r = await timedAiCall({ householdId, task: "pick_reasons", model: MODEL, promptVersion: "pick_reasons@1" }, () => client.messages.parse(
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
  ));
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
  const { picks, templates, ctx, slot, craving, nameOf } = ranking;
  const batchId = crypto.randomUUID();
  const docById = new Map(kitchen.docs.map((d) => [d.id!, d]));

  let reasons = templates;
  if (client && picks.length) {
    try {
      const reworded = await modelReasons(client, householdId, body.language_code ?? "en-IN", picks.map((p, i) => ({
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

  // KIT-035: at most one "Still have X?" a day, and only when the answer changes tonight's pick.
  const check = await checkQuestion(sb, householdId, ranking).catch(() => null);

  return json({
    batch_id: batchId,
    meal_slot: slot,
    check,
    calendar: calendarSummary(kitchen),
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
