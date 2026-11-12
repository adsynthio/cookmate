// learn-from-cooking (AI 4, "Learns your family"): after a dish is finished, what the cook changed along the way
// ("kam mirchi daali", "Aarav ke liye pyaaz nahi", "added peas") is read into suggestions for next time: amounts for
// this dish, likes and dislikes of a family member, or a plain note. The finish sheet shows them ticked; the cook
// keeps or drops each, and kept ones change the next recipe's amounts and the picks (remembered amounts, avoid lists).
//
// Runs as the signed-in user, so row-level security decides which session can be read. Claude Haiku reads the
// changes in a fixed shape; logic.ts checks the answer. Without a model (503) or on any failure the app falls back to
// its own rules (domain/learning.ts changeCandidates). The change text is not stored here; each call is logged.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { z } from "npm:zod@4.6.5";

import { timedAiCall } from "../_shared/aiLog.ts";
import { LANGUAGE_NAME, localeFor } from "../rescue/logic.ts";
import { acceptLearned, changesOf, type ModelItem } from "./logic.ts";

const MODEL = "claude-haiku-5-5";
const TASK = "learn_from_cooking";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const Out = z.object({
  items: z.array(z.object({
    kind: z.enum(["amount", "avoid", "like", "note"]),
    ingredient: z.string().nullable(),
    amount: z.enum(["more", "less"]).nullable(),
    member: z.string().nullable(),
    statement: z.string(),
  })),
});

const SYSTEM = `You help a family cooking app remember how this family likes a dish. You get the dish, the family's
names and what the cook said they changed while cooking it. Turn the changes into at most four things worth
remembering for next time:
- kind "amount": they used more or less of one ingredient (amount "more" or "less"). About this dish.
- kind "avoid" or "like": a family member (member = their name exactly as given) doesn't eat or loves an ingredient.
  Only when the change says so about that person; leaving something out once is not a dislike.
- kind "note": anything else worth repeating next time (added peas, used curd instead of cream, cooked longer).
ingredient: a plain lowercase English ingredient name ("green chilli", "onion", "garlic"), else null.
statement: one short line (at most 100 characters) in the language given, saying what to remember, naming the dish
or the person. Hindi in Devanagari, Hinglish in Latin script, Indian English. No gendered verbs in Hindi; no health
claims. Nothing that wasn't said. If nothing is worth remembering, return no items.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: { session_id?: string; language_code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!body.session_id) return json({ error: "session_id is required" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return json({ error: "sign in first" }, 401);

  // Read through RLS: a session outside the user's household simply isn't found.
  const { data: session } = await sb.from("cooking_sessions").select("household_id, modifications, recipes!cooking_sessions_recipe_id_fkey(title)")
    .eq("id", body.session_id).maybeSingle();
  if (!session) return json({ error: "session not found" }, 404);
  const changes = changesOf(session.modifications);
  if (!changes.length) return json({ candidates: [], source: "none" });
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "learn_unavailable" }, 503);

  const householdId = session.household_id as string;
  const { data: memberRows } = await sb.from("household_members").select("id, display_name").eq("household_id", householdId).eq("status", "active");
  const members = ((memberRows ?? []) as { id: string; display_name: string }[]).map((m) => ({ id: m.id, name: m.display_name }));
  const dish = (session.recipes as unknown as { title: string } | null)?.title ?? "this dish";
  const locale = localeFor(body.language_code);

  try {
    const client = new Anthropic();
    const r = await timedAiCall({ householdId, task: TASK, model: MODEL, promptVersion: `${TASK}@1` }, () => client.messages.parse(
      {
        model: MODEL,
        max_tokens: 600,
        thinking: { type: "disabled" },
        output_config: { effort: "low", format: zodOutputFormat(Out) },
        system: [{ type: "text", cache_control: { type: "ephemeral" }, text: SYSTEM }],
        messages: [{
          role: "user",
          content: JSON.stringify({ language: LANGUAGE_NAME[locale], dish, family: members.map((m) => m.name), changes }),
        }],
      },
      { timeout: 6000 },
    ));
    if (r.stop_reason === "refusal" || !r.parsed_output) return json({ error: "no reading" }, 502);
    return json({ candidates: acceptLearned(r.parsed_output.items as ModelItem[], members), source: "model" });
  } catch (err) {
    console.error("learn_from_cooking failed", err instanceof Error ? err.message : err);
    return json({ error: "no reading" }, 502);
  }
});
