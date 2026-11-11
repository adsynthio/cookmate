// rescue (KIT-091, KIT-092, RES-02/03): a fix for this dish, at this step, with what is in the kitchen.
// The reviewed rules in ../_shared/rescue.ts always produce an answer. Claude Haiku may reword it for the exact dish
// and step, but: it never writes safety text (the pinned playbook line is attached here, word for word); it is never
// asked about undercooked meat, fish, egg or kidney beans; and its answer is dropped unless it passes
// validateModelRescue (at most three short steps, only things in the kitchen, no unsafe shortcuts).
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { z } from "npm:zod@4.6.5";

import { RECIPE_SELECT, type RecipeDoc, recipeDocFromRow, type RecipeRow } from "../_shared/recipes.ts";
import {
  MAX_STEP_CHARS,
  MAX_STEPS,
  missingResolved,
  mustUseRules,
  playbookText,
  type Problem,
  type RescueContext,
  type RescueLocale,
  staticRescue,
  validateModelRescue,
} from "../_shared/rescue.ts";
import { type Body, cat, confidentPantry, contextFor, LANGUAGE_NAME, localeFor, type PantryRow, parseBody } from "./logic.ts";

const TASK = "rescue_fix";
const MODEL = "claude-haiku-5-5";
const PROMPT_VERSION = "rescue_fix@1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const Fix = z.object({ steps: z.array(z.string()), uses: z.array(z.string()) });

async function askModel(doc: RecipeDoc, stepNo: number, problem: Problem, ctx: RescueContext, locale: RescueLocale) {
  const client = new Anthropic();
  const started = Date.now();
  const r = await client.messages.parse(
    {
      model: MODEL,
      max_tokens: 400,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(Fix) },
      system: [{
        type: "text",
        cache_control: { type: "ephemeral" },
        text: `You help an Indian home cook fix a dish that is going wrong, right now, at the stove.
Reply with at most ${MAX_STEPS} steps. Each step is one short instruction (under ${MAX_STEP_CHARS} characters) the cook can do immediately,
with household measures (chammach, katori, chutki). Use ONLY ingredients from the "kitchen" list, the recipe's own
ingredients, or water. List every ingredient you rely on in "uses", by its exact name from those lists.
Never suggest tasting or serving undercooked meat, fish, egg or beans. Never shorten cooking for them. Never suggest
pouring water on hot oil. Do not write safety warnings or health claims: the app adds its own safety text.
If nothing in the kitchen helps, say how to serve the dish so the problem matters less.

Safety playbook (pinned; never contradict it):
${playbookText()}`,
      }],
      messages: [{
        role: "user",
        content: JSON.stringify({
          write_in: LANGUAGE_NAME[locale],
          dish: doc.title,
          problem,
          missing_ingredient: ctx.missing,
          cook_said: ctx.details,
          current_step: { number: stepNo, text: doc.steps[stepNo - 1]?.text },
          next_step: doc.steps[stepNo]?.text,
          recipe_ingredients: doc.ingredients.map((i) => i.ingredient),
          kitchen: ctx.pantry,
        }),
      }],
    },
    { timeout: 2500 },
  );
  const ms = Date.now() - started;
  return { fix: r.stop_reason === "refusal" ? null : r.parsed_output, usage: r.usage, ms, refused: r.stop_reason === "refusal" };
}

async function logRequest(householdId: string, status: string, ms: number, usage?: Anthropic.Usage, error?: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { error: e } = await admin.from("ai_requests").insert({
    household_id: householdId,
    task: TASK,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
    input_tokens: usage?.input_tokens ?? null,
    cached_tokens: usage?.cache_read_input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
    latency_ms: ms,
    status,
    error: error?.slice(0, 500) ?? null,
  });
  if (e) console.error("ai_requests insert failed", e.message);
}

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

  // Row-level security decides whether this user may see the session at all.
  const { data: session, error: e0 } = await sb.from("cooking_sessions")
    .select("id, household_id, recipe_id, adapted_recipe_id, current_step, language_code")
    .eq("id", input.sessionId).maybeSingle();
  if (e0) return json({ error: e0.message }, 500);
  if (!session) return json({ error: "session not found" }, 404);
  const householdId = session.household_id as string;

  const [{ data: row, error: e1 }, { data: items, error: e2 }] = await Promise.all([
    sb.from("recipes").select(RECIPE_SELECT).eq("id", session.adapted_recipe_id ?? session.recipe_id).maybeSingle(),
    sb.from("inventory_items").select("confidence, staple_level, ingredients(canonical_name)")
      .eq("household_id", householdId).eq("status", "active"),
  ]);
  if (e1 || e2) return json({ error: (e1 ?? e2)!.message }, 500);
  if (!row) return json({ error: "recipe not found" }, 404);
  const doc = recipeDocFromRow(row as unknown as RecipeRow);
  const stepNo = Math.max(1, Math.min(doc.steps.length, session.current_step as number));

  const locale = localeFor(body.language_code ?? (session.language_code as string | undefined));
  const ctx = contextFor(doc, confidentPantry((items ?? []) as unknown as PantryRow[]), input.missing, input.details);
  const rules = staticRescue(input.problem, ctx, cat, locale);
  let result = rules;

  // The reviewed rules answer a missing ingredient when they can; the model is only asked when they can't.
  const rulesAreEnough = input.problem === "missing_ingredient" && (!ctx.missing || missingResolved(ctx));
  if (Deno.env.get("ANTHROPIC_API_KEY") && !mustUseRules(input.problem, ctx, cat) && !rulesAreEnough) {
    try {
      const { fix, usage, ms, refused } = await askModel(doc, stepNo, input.problem, ctx, locale);
      if (fix) {
        const problems = validateModelRescue(fix, ctx);
        await logRequest(householdId, problems.length ? "invalid_output" : "ok", ms, usage, problems.join("; ") || undefined);
        // Safety text stays the playbook's, whatever the model wrote.
        if (!problems.length) result = { steps: fix.steps.map((s) => s.trim()), uses: fix.uses, safetyNote: rules.safetyNote, source: "model" };
      } else {
        await logRequest(householdId, refused ? "refused" : "invalid_output", ms, usage);
      }
    } catch (err) {
      const status = err instanceof Anthropic.APIConnectionTimeoutError ? "timeout" : "error";
      await logRequest(householdId, status, 0, undefined, err instanceof Error ? err.message : String(err));
    }
  }

  const { error: e3 } = await sb.from("session_events").insert({
    household_id: householdId,
    session_id: session.id,
    event_type: "rescue",
    step_no: stepNo,
    channel: input.channel,
    payload: { problem: input.problem, missing: input.missing ?? null, source: result.source, steps: result.steps.length },
  });
  if (e3) console.error("session_events insert failed", e3.message);

  return json({ steps: result.steps, safety_note: result.safetyNote, uses: result.uses, source: result.source });
});
