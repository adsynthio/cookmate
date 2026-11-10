// adapt-recipe (KIT-051, REC-03): change spice, servings, equipment, diet or missing items. The reviewed variation
// rules and the recipe's own substitutes go first (../_shared/adapt.ts, same code as the app). Claude Sonnet is only
// asked about essentials nothing replaces, and only to swap an ingredient or reword an existing step. Every result
// passes validateAdaptation() (safety notes unchanged, no removed steps, no shorter cooking on safety steps, catalog
// ingredients that fit the diet, no unsafe shortcuts) before it is saved as the household's variant.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { z } from "npm:zod@4.6.5";

import {
  type Adaptation,
  type AdaptRequest,
  applyModelPlan,
  applyRules,
  type ModelPlan,
  summarise,
  validateAdaptation,
} from "../_shared/adapt.ts";
import type { Diet } from "../_shared/ranking.ts";
import { RECIPE_SELECT, type RecipeDoc, recipeDocFromRow, type RecipeRow } from "../_shared/recipes.ts";
import { catalogNames, DIETS, missingEquipment, validationContext, variantRows } from "./logic.ts";

const TASK = "adapt_recipe";
const MODEL = "claude-sonnet-5-5";
const PROMPT_VERSION = "adapt_recipe@1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Body = {
  household_id?: string;
  recipe_id?: string;
  missing?: string[];
  spice?: number;
  servings?: number;
  missing_equipment?: string[];
  diet?: string;
  max_time_min?: number;
};

const Plan = z.object({
  replacements: z.array(z.object({ missing: z.string(), use: z.string(), ratio: z.number(), note: z.string() })),
  step_edits: z.array(z.object({ step: z.number(), text: z.string() })),
  summary: z.string(),
});

async function askModel(doc: RecipeDoc, a: Adaptation, catalogNames: string[]): Promise<{ plan: ModelPlan | null; usage?: Anthropic.Usage; ms: number; refused: boolean }> {
  const client = new Anthropic();
  const started = Date.now();
  const r = await client.messages.parse(
    {
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(Plan) },
      system: [{
        type: "text",
        cache_control: { type: "ephemeral" },
        text: `You help an Indian home cook make a tested recipe without some ingredients.
You may ONLY: (1) replace each missing ingredient with ONE ingredient from the allowed list, with a quantity ratio and
a short note for the cook; (2) reword existing steps that mention a replaced ingredient so the method fits it.
Never add or remove steps, never change cooking times, temperatures or whistle counts, never weaken or remove a
safety instruction, never suggest raw or undercooked eggs, meat or beans. If nothing sensible replaces an ingredient,
leave it out of replacements. Keep the cook's language simple. No health claims.
Allowed ingredients: ${catalogNames.join(", ")}`,
      }],
      messages: [{
        role: "user",
        content: JSON.stringify({
          recipe: { title: doc.title, servings: doc.base_servings, ingredients: a.doc.ingredients, steps: a.doc.steps.map((s, i) => ({ step: i + 1, text: s.text })) },
          missing: a.unresolved,
        }),
      }],
    },
    { timeout: 6000 },
  );
  const ms = Date.now() - started;
  if (r.stop_reason === "refusal" || !r.parsed_output) return { plan: null, usage: r.usage, ms, refused: r.stop_reason === "refusal" };
  const p = r.parsed_output;
  return { plan: { replacements: p.replacements, stepEdits: p.step_edits, summary: p.summary }, usage: r.usage, ms, refused: false };
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
  const householdId = body.household_id ?? "";
  if (!householdId || !body.recipe_id) return json({ error: "household_id and recipe_id are required" }, 400);
  const diet = DIETS.includes(body.diet as Diet) ? (body.diet as Diet) : undefined;

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return json({ error: "sign in first" }, 401);
  const { data: me } = await sb.from("household_members").select("id")
    .eq("household_id", householdId).eq("user_id", auth.user.id).eq("status", "active").maybeSingle();
  if (!me) return json({ error: "not a member of this household" }, 403);

  const { data: row, error } = await sb.from("recipes").select(RECIPE_SELECT).eq("id", body.recipe_id).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!row) return json({ error: "recipe not found" }, 404);
  const base = recipeDocFromRow(row as unknown as RecipeRow);

  let lacking = body.missing_equipment;
  if (!lacking) {
    const { data: kit } = await sb.from("kitchen_equipment").select("equipment_type").eq("household_id", householdId);
    lacking = missingEquipment(base.equipment ?? [], ((kit ?? []) as { equipment_type: string }[]).map((k) => k.equipment_type));
  }
  const request: AdaptRequest = {
    missing: body.missing?.filter((m) => typeof m === "string").slice(0, 20),
    spice: typeof body.spice === "number" ? body.spice : undefined,
    servings: typeof body.servings === "number" && body.servings >= 1 && body.servings <= 20 ? Math.round(body.servings) : undefined,
    missingEquipment: lacking,
    diet,
    maxTimeMin: typeof body.max_time_min === "number" ? body.max_time_min : undefined,
  };
  const ctx = validationContext(diet);

  let adaptation = applyRules(base, request);
  let usedModel = false;
  if (adaptation.unresolved.length && Deno.env.get("ANTHROPIC_API_KEY")) {
    try {
      const { plan, usage, ms, refused } = await askModel(base, adaptation, catalogNames());
      if (plan) {
        const candidate = applyModelPlan(adaptation, plan);
        const problems = validateAdaptation(base, candidate, ctx);
        await logRequest(householdId, problems.length ? "invalid_output" : "ok", ms, usage, problems.join("; ") || undefined);
        if (!problems.length) {
          adaptation = candidate;
          usedModel = true;
        }
      } else {
        await logRequest(householdId, refused ? "refused" : "invalid_output", ms, usage);
      }
    } catch (err) {
      const status = err instanceof Anthropic.APIConnectionTimeoutError ? "timeout" : "error";
      await logRequest(householdId, status, 0, undefined, err instanceof Error ? err.message : String(err));
    }
  }

  const problems = validateAdaptation(base, adaptation, ctx);
  const summary = summarise(adaptation);
  if (problems.length) {
    // Nothing safe to save: tell the app what couldn't be done (e.g. buy the potatoes).
    return json({ adapted_recipe_id: null, summary, changed_steps: [], unresolved: adaptation.unresolved, problems, used_model: usedModel });
  }

  // Save the variant under the household, linked to its base recipe.
  const names = [...new Set([...adaptation.doc.ingredients.flatMap((i) => [i.ingredient, ...(i.substitutes ?? []).map((s) => s.ingredient)])])];
  const [{ data: ings }, { data: techs }] = await Promise.all([
    sb.from("ingredients").select("id, canonical_name").in("canonical_name", names),
    sb.from("techniques").select("id, slug"),
  ]);
  const ingredientIds = new Map(((ings ?? []) as { id: string; canonical_name: string }[]).map((i) => [i.canonical_name, i.id]));
  const techIds = new Map(((techs ?? []) as { id: string; slug: string }[]).map((t) => [t.slug, t.id]));
  const rows = variantRows(base, adaptation.doc, { recipeId: crypto.randomUUID(), householdId, memberId: me.id, ingredientIds }, summary);

  const { error: e1 } = await sb.from("recipes").insert(rows.recipe);
  if (e1) return json({ error: e1.message }, 500);
  const { error: e2 } = await sb.from("recipe_ingredients").insert(rows.ingredients);
  const { error: e3 } = await sb.from("recipe_steps").insert(
    rows.steps.map(({ technique_slug, ...s }) => ({ ...s, technique_id: technique_slug ? (techIds.get(technique_slug) ?? null) : null })),
  );
  if (e2 || e3) {
    await sb.from("recipes").delete().eq("id", rows.recipe.id);
    return json({ error: (e2 ?? e3)!.message }, 500);
  }

  return json({
    adapted_recipe_id: rows.recipe.id,
    summary,
    changed_steps: adaptation.changedSteps,
    unresolved: [],
    problems: [],
    used_model: usedModel,
  });
});
