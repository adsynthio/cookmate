// ask-cookmate: "Ask Cookmate anything", on any screen. One question (with the last few turns) in, a short answer out,
// grounded in this household's kitchen, family, memories, recent cooking and the recipes Cookmate knows, plus up to
// three recipes to open, things to add to the shopping list and follow-up questions.
//
// Runs as the signed-in user, so household RLS decides what is read. Claude writes the reply in a fixed shape; it is
// checked (known recipes only, no health claims, length) and, without a model or a usable reply, a plain fallback is
// returned. The question's words are not stored; each call is logged in ai_requests (cost, latency, status).
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { z } from "npm:zod@4.6.5";

import { logAiRequest } from "../_shared/aiLog.ts";
import { LANGUAGE_NAME, localeFor } from "../rescue/logic.ts";
import { type Body, cleanReply, contextFor, fallbackReply, type ItemRow, MAX_ANSWER_CHARS, type MemberRow, parseBody, type RecipeRow } from "./logic.ts";
import { checkQuota, quotaResponse } from "../_shared/quota.ts";
import { serverError } from "../_shared/errors.ts";

const MODEL = "claude-opus-5-5";
const TASK = "ask_cookmate";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ReplyOut = z.object({
  answer: z.string(),
  recipes: z.array(z.string()),
  add_to_list: z.array(z.string()),
  follow_ups: z.array(z.string()),
});

// Stable instructions first (cached); the household's context and the question come after.
const SYSTEM = `You are Cookmate, a warm, practical kitchen helper for Indian home cooks. You know this household's kitchen,
family, what Cookmate remembers about their taste, what they cooked recently and the recipes Cookmate has.

How to answer:
- Answer in at most four short sentences (under ${MAX_ANSWER_CHARS} characters), in the language you are told to write in.
- Ground every suggestion in what is in their kitchen and who is eating. Use leftovers and things close to their use-by
  date first. Never suggest an ingredient someone in the family must avoid, or a dish that breaks anyone's diet.
- Use household measures (katori, chammach, chutki, a handful) and everyday Indian names.
- When a recipe Cookmate has fits, put its slug in "recipes" (only slugs from the list you are given; at most three).
  You may also describe a quick dish that is not in the list in words.
- Put things they would need to buy in "add_to_list" (plain ingredient names, at most six), and up to three short
  follow-up questions the cook might ask next in "follow_ups", written in the same language.
- Food safety: cooked rice keeps a day in the fridge; leftovers are reheated once until steaming hot; meat, fish, eggs
  and kidney beans are always cooked through. If something might have gone off, say to throw it away.
- No calorie counts, medical or health claims, and nothing outside cooking, food, the kitchen and shopping. For anything
  else, say kindly that you can only help with the kitchen.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const input = parseBody(body);
  if ("error" in input) return json({ error: input.error }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return json({ error: "sign in first" }, 401);

  const householdId = input.householdId;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [members, items, memories, sessions, recipes] = await Promise.all([
    sb.from("household_members").select("display_name, age_group, diet").eq("household_id", householdId).eq("status", "active"),
    sb.from("inventory_items").select("quantity, unit, state, staple_level, expiry_date, custom_name, ingredients(canonical_name)")
      .eq("household_id", householdId).eq("status", "active"),
    sb.from("memories").select("statement").eq("household_id", householdId).eq("status", "active").limit(30),
    sb.from("cooking_sessions").select("completed_at, recipes!cooking_sessions_recipe_id_fkey(title)").eq("household_id", householdId)
      .eq("status", "completed").gte("completed_at", twoWeeksAgo).order("completed_at", { ascending: false }).limit(10),
    sb.from("recipes").select("slug, title, course, diet, prep_time_min, cook_time_min").is("parent_recipe_id", null).eq("is_published", true),
  ]);
  // Members are read through RLS: none back means this user is not in the household.
  if (members.error) return serverError(members.error, json);
  if (!members.data?.length) return json({ error: "not a member of this household" }, 403);
  // Finding 23: a per-household limit on AI calls.
  const quota = await checkQuota(householdId);
  if (!quota.ok) return quotaResponse(quota, CORS);

  const locale = localeFor(input.languageCode);
  const recipeRows = (recipes.data ?? []) as RecipeRow[];
  const context = contextFor({
    today,
    items: (items.data ?? []) as unknown as ItemRow[],
    members: members.data as MemberRow[],
    memories: ((memories.data ?? []) as { statement: string }[]).map((m) => m.statement),
    cooked: ((sessions.data ?? []) as unknown as { completed_at: string; recipes: { title: string } | null }[])
      .filter((s) => s.recipes)
      .map((s) => ({ title: s.recipes!.title, daysAgo: Math.max(0, Math.round((Date.now() - Date.parse(s.completed_at)) / 86_400_000)) })),
    recipes: recipeRows,
  });
  const knownSlugs = new Set(recipeRows.map((r) => r.slug));

  let reply = fallbackReply(locale);
  let source: "model" | "fallback" = "fallback";
  if (Deno.env.get("ANTHROPIC_API_KEY")) {
    const client = new Anthropic();
    const started = Date.now();
    const messages: Anthropic.MessageParam[] = [
      // The household context sits in the first turn so it caches with the system prompt across a conversation.
      { role: "user", content: [{ type: "text", text: `Household (as of ${today}):\n${JSON.stringify(context)}`, cache_control: { type: "ephemeral" } }] },
      { role: "assistant", content: "Got it. What would you like to know?" },
      ...input.history.map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam),
      { role: "user", content: `Write in ${LANGUAGE_NAME[locale]}.\n\n${input.question}` },
    ];
    try {
      const r = await client.messages.parse(
        {
          model: MODEL,
          max_tokens: 2000,
          output_config: { effort: "low", format: zodOutputFormat(ReplyOut) },
          system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
          messages,
        },
        { timeout: 20_000 },
      );
      const refused = r.stop_reason === "refusal";
      const cleaned = !refused && r.parsed_output ? cleanReply(r.parsed_output, knownSlugs) : null;
      await logAiRequest({
        householdId, task: TASK, model: MODEL, promptVersion: `${TASK}@1`,
        status: refused ? "refused" : cleaned ? "ok" : "invalid_output", latencyMs: Date.now() - started, usage: r.usage,
      });
      if (cleaned) {
        reply = cleaned;
        source = "model";
      }
    } catch (err) {
      await logAiRequest({
        householdId, task: TASK, model: MODEL, promptVersion: `${TASK}@1`,
        status: err instanceof Anthropic.APIConnectionTimeoutError ? "timeout" : "error", latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const titles = new Map(recipeRows.map((r) => [r.slug, r.title]));
  return json({
    answer: reply.answer,
    recipes: reply.recipes.map((slug) => ({ slug, title: titles.get(slug) ?? slug })),
    add_to_list: reply.add_to_list,
    follow_ups: reply.follow_ups,
    source,
  });
});
