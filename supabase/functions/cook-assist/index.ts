// cook-assist (KIT-074, KIT-075): help in the middle of a step.
//   mode "ask":     answer a question about this dish and step. The cook's place never moves; the step's own safety
//                   note is returned with the answer word for word.
//   mode "changed": the cook did something differently. The change is recorded on the session with short notes for
//                   the steps still ahead (log_session_change), never by rewriting the reviewed steps.
// Claude Haiku writes the answer or the notes; both are validated, and without a model (or a valid reply) the reviewed
// fallback in ../_shared/assist.ts is used.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { z } from "npm:zod@4.6.5";

import { logAiRequest } from "../_shared/aiLog.ts";
import { answerSafety, changeReply, cleanNotes, fallbackAnswer, MAX_ANSWER_CHARS, MAX_NOTE_CHARS, MAX_NOTES, type StepNote, validateAnswer } from "../_shared/assist.ts";
import { RECIPE_SELECT, type RecipeDoc, recipeDocFromRow, type RecipeRow } from "../_shared/recipes.ts";
import { playbookText, type RescueLocale } from "../_shared/rescue.ts";
import { confidentPantry, LANGUAGE_NAME, localeFor, type PantryRow } from "../rescue/logic.ts";
import { type Body, parseBody } from "./logic.ts";
import { checkQuota, quotaResponse } from "../_shared/quota.ts";
import { serverError } from "../_shared/errors.ts";

const MODEL = "claude-haiku-5-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const AnswerOut = z.object({ answer: z.string() });
const NotesOut = z.object({ notes: z.array(z.object({ step: z.number(), note: z.string() })) });

const RULES = `You help an Indian home cook while they are cooking. Only talk about cooking this dish.
Use household measures (chammach, katori, chutki). Keep it short and plain; the cook's hands are busy.
Never suggest tasting or serving undercooked meat, fish, egg or beans, shortening their cooking, or pouring water on
hot oil. Do not write safety warnings or health claims: the app adds its own safety text.

Safety playbook (pinned; never contradict it):
${playbookText()}`;

function situation(doc: RecipeDoc, stepNo: number, pantry: string[], locale: RescueLocale) {
  return {
    write_in: LANGUAGE_NAME[locale],
    dish: doc.title,
    servings: doc.base_servings,
    current_step: { number: stepNo, text: doc.steps[stepNo - 1]?.text, how_to_tell: doc.steps[stepNo - 1]?.cue },
    steps_ahead: doc.steps.slice(stepNo).map((s, i) => ({ number: stepNo + 1 + i, text: s.text })),
    recipe_ingredients: doc.ingredients.map((i) => `${i.qty} ${i.unit} ${i.ingredient}`),
    kitchen: pantry,
  };
}

async function logRequest(householdId: string, task: string, status: string, ms: number, usage?: Anthropic.Usage, error?: string) {
  await logAiRequest({ householdId, task, model: MODEL, promptVersion: `${task}@1`, status, latencyMs: ms, usage, error });
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

  const { data: session, error: e0 } = await sb.from("cooking_sessions")
    .select("id, household_id, recipe_id, adapted_recipe_id, current_step, language_code, status")
    .eq("id", input.sessionId).maybeSingle();
  if (e0) return serverError(e0, json);
  if (!session) return json({ error: "session not found" }, 404);
  const householdId = session.household_id as string;
  // Finding 23: a per-household limit on AI calls.
  const quota = await checkQuota(householdId);
  if (!quota.ok) return quotaResponse(quota, CORS);

  const [{ data: row, error: e1 }, { data: items }] = await Promise.all([
    sb.from("recipes").select(RECIPE_SELECT).eq("id", session.adapted_recipe_id ?? session.recipe_id).maybeSingle(),
    sb.from("inventory_items").select("confidence, staple_level, ingredients(canonical_name)")
      .eq("household_id", householdId).eq("status", "active"),
  ]);
  if (e1) return serverError(e1, json);
  if (!row) return json({ error: "recipe not found" }, 404);
  const doc = recipeDocFromRow(row as unknown as RecipeRow);
  const stepNo = Math.max(1, Math.min(doc.steps.length, session.current_step as number));
  const step = doc.steps[stepNo - 1]!;
  const locale = localeFor(body.language_code ?? (session.language_code as string | undefined));
  const pantry = confidentPantry((items ?? []) as unknown as PantryRow[]);
  const client = Deno.env.get("ANTHROPIC_API_KEY") ? new Anthropic() : null;

  if (input.mode === "ask") {
    let result = fallbackAnswer(step, input.text, locale);
    if (client) {
      const started = Date.now();
      try {
        const r = await client.messages.parse(
          {
            model: MODEL,
            max_tokens: 300,
            thinking: { type: "disabled" },
            output_config: { effort: "low", format: zodOutputFormat(AnswerOut) },
            system: [{ type: "text", cache_control: { type: "ephemeral" }, text: `${RULES}\n\nAnswer the cook's question in at most three short sentences (under ${MAX_ANSWER_CHARS} characters), for the step they are on.` }],
            messages: [{ role: "user", content: JSON.stringify({ ...situation(doc, stepNo, pantry, locale), question: input.text }) }],
          },
          { timeout: 3000 },
        );
        const answer = r.stop_reason === "refusal" ? null : r.parsed_output?.answer?.trim();
        const problems = answer ? validateAnswer(answer) : ["no answer"];
        await logRequest(householdId, "cook_question", r.stop_reason === "refusal" ? "refused" : problems.length ? "invalid_output" : "ok", Date.now() - started, r.usage, problems.join("; ") || undefined);
        if (answer && !problems.length) result = { answer, safetyNote: answerSafety(step, input.text, locale), source: "model" };
      } catch (err) {
        await logRequest(householdId, "cook_question", err instanceof Anthropic.APIConnectionTimeoutError ? "timeout" : "error", Date.now() - started, undefined, err instanceof Error ? err.message : String(err));
      }
    }
    // The question is logged as an event; its words are not kept (transcript retention is a separate consent).
    const { error: e2 } = await sb.from("session_events").insert({
      household_id: householdId, session_id: session.id, event_type: "question", step_no: stepNo, channel: input.channel, payload: { source: result.source },
    });
    if (e2) console.error("session_events insert failed", e2.message);
    return json({ answer: result.answer, safety_note: result.safetyNote, source: result.source, current_step: stepNo });
  }

  // mode "changed"
  if (session.status !== "active" && session.status !== "paused") return json({ error: "session is not in progress" }, 409);
  let notes: StepNote[] = [];
  let source: "rules" | "model" = "rules";
  if (client && stepNo < doc.steps.length) {
    const started = Date.now();
    try {
      const r = await client.messages.parse(
        {
          model: MODEL,
          max_tokens: 400,
          thinking: { type: "disabled" },
          output_config: { effort: "low", format: zodOutputFormat(NotesOut) },
          system: [{ type: "text", cache_control: { type: "ephemeral" }, text: `${RULES}\n\nThe cook did something differently from the recipe. Give at most ${MAX_NOTES} short notes (under ${MAX_NOTE_CHARS} characters each) for steps that are still ahead and are affected by the change, saying what to do differently there. Use the step numbers given. If nothing ahead is affected, return no notes. Never change cooking times for meat, fish, egg or beans.` }],
          messages: [{ role: "user", content: JSON.stringify({ ...situation(doc, stepNo, pantry, locale), cook_changed: input.text }) }],
        },
        { timeout: 3000 },
      );
      const raw = r.stop_reason === "refusal" ? null : r.parsed_output?.notes;
      await logRequest(householdId, "cook_change", r.stop_reason === "refusal" ? "refused" : raw ? "ok" : "invalid_output", Date.now() - started, r.usage);
      if (raw) {
        notes = cleanNotes(raw, stepNo, doc.steps.length);
        source = "model";
      }
    } catch (err) {
      await logRequest(householdId, "cook_change", err instanceof Anthropic.APIConnectionTimeoutError ? "timeout" : "error", Date.now() - started, undefined, err instanceof Error ? err.message : String(err));
    }
  }
  const { data: entry, error: e3 } = await sb.rpc("log_session_change", { p_session: session.id, p_change: input.text, p_notes: notes, p_channel: input.channel });
  if (e3) return serverError(e3, json);
  const kept = ((entry as { notes?: StepNote[] } | null)?.notes ?? []) as StepNote[];
  return json({ reply: changeReply(kept, locale), notes: kept, source });
});
