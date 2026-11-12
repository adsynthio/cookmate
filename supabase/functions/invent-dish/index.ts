// invent-dish (KIT-056, REC-06): "Kuch naya banao" from the odds and ends in the kitchen. Flavour logic picks what
// to combine (../_shared/invent.ts, same code as the app); Claude Sonnet writes the dish; validateInvention() checks
// it (catalog ingredients that fit the table's diet, nothing to buy beyond staples, every odd-and-end used,
// leftovers reheated until steaming hot, raw meat and egg cooked through, no unsafe shortcuts). One retry with the
// problems listed; a dish that still fails is never shown. A passing dish is saved as the household's own recipe,
// source 'generated', labelled "new creation" (tag new_creation), so it can be cooked like any other.
// With `dish` ("Aloo Methi", from Home's search or the chef step's new-dish idea) Claude writes that dish the home way
// from this kitchen instead, with at most three things to buy (returned as to_buy); the same checks apply.
// Without a model key it answers 503 invent_unavailable and the app hides the option (11_ai_tasks_and_models.csv).
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { z } from "npm:zod@4.6.5";

import { logAiRequest } from "../_shared/aiLog.ts";
import { type InventPlan, planInvention, validateInvention } from "../_shared/invent.ts";
import type { Diet } from "../_shared/ranking.ts";
import type { RecipeDoc } from "../_shared/recipes.ts";
import { variantRows } from "../adapt-recipe/logic.ts";
import { localDate } from "../suggest-meals/logic.ts";
import { CATALOG, cleanDishName, docFromModel, inventItems, type ItemRow, MAX_TO_BUY, type ModelDish, namedPlan, tableDiet, toBuyFor } from "./logic.ts";

const TASK = "invent_combination";
const MODEL = "claude-sonnet-5-5";
const PROMPT_VERSION = "invent_combination@1";
const NAMED_TASK = "write_named_dish";
const NAMED_VERSION = "write_named_dish@1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const Dish = z.object({
  title: z.string(),
  title_hi: z.string(),
  title_hinglish: z.string(),
  description: z.string(),
  servings: z.number(),
  prep_min: z.number(),
  cook_min: z.number(),
  spice_level: z.number(),
  ingredients: z.array(z.object({ ingredient: z.string(), qty: z.number(), unit: z.string(), local: z.string().nullable() })),
  steps: z.array(z.object({ text: z.string(), minutes: z.number().nullable(), cue: z.string().nullable(), safety: z.string().nullable() })),
});

const SYSTEM = (staples: string[]) => `You invent one simple home dish for an Indian family from what is already in their kitchen,
so that nothing goes to waste. Use EVERY item in "use" (they are leftovers, homemade components or about to spoil).
Besides those, use only these staples: ${staples.join(", ")}. Never ask the cook to buy anything.
Flavour logic: a good plate has a starch to carry it, something rich, some heat, something sour (acid) and some crunch;
the "gaps" list says what the items lack, fill gaps from the staples where it makes sense.
Diet: every ingredient must suit the given diet.
Food safety, always: leftovers and cooked food are reheated until steaming hot all the way through, in a step with a
safety note; raw meat, fish and eggs are cooked through (no pink, egg fully set), said in a step with a safety note;
no shortcuts (no skipping soaking or boiling, no reheating more than once, no half-cooked anything).
Quantities in g or ml (or piece/bunch/packet), for 2 servings. 3 to 7 short steps in plain English a home cook
follows easily; minutes on steps that take time; a sensory cue where it helps. Titles: English, Hindi (Devanagari)
and Hinglish (Latin script). No health or nutrition claims.`;

async function askModel(client: Anthropic, plan: InventPlan, diet: Diet, staples: string[], problems: string[]) {
  const started = Date.now();
  const r = await client.messages.parse(
    {
      model: MODEL,
      max_tokens: 2500,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(Dish) },
      system: [{ type: "text", cache_control: { type: "ephemeral" }, text: SYSTEM(staples) }],
      messages: [{
        role: "user",
        content: JSON.stringify({
          diet,
          use: plan.use.map((u) => ({ item: u.key, state: u.state, brings: u.roles.length ? u.roles : undefined })),
          gaps: plan.gaps,
          ...(problems.length ? { fix_these_problems_from_your_last_answer: problems } : {}),
        }),
      }],
    },
    { timeout: 20_000 },
  );
  return { dish: r.stop_reason === "refusal" ? null : (r.parsed_output as ModelDish | null), usage: r.usage, ms: Date.now() - started, refused: r.stop_reason === "refusal" };
}

const NAMED_SYSTEM = (staples: string[]) => `You write one home recipe for an Indian family: the dish they asked for,
the way it is usually made at home, cooked from what is in their kitchen ("have"). Use the usual ingredients of the
dish; prefer what they have; besides "have" you may use these staples: ${staples.join(", ")}, and at most ${MAX_TO_BUY}
other things they would buy. Ingredient names must be plain lowercase English names from Indian kitchens (e.g.
"potato", "fenugreek leaves", "toor dal"). If the dish can't suit the given diet, write the closest version that does.
Food safety, always: leftovers and cooked food are reheated until steaming hot all the way through, in a step with a
safety note; raw meat, fish and eggs are cooked through (no pink, egg fully set), said in a step with a safety note;
no shortcuts. Quantities in g or ml (or piece/bunch/packet), for 2 servings. 3 to 8 short steps in plain English;
minutes on steps that take time; a sensory cue where it helps. Titles: English, Hindi (Devanagari) and Hinglish
(Latin script). No health or nutrition claims.`;

async function askNamed(client: Anthropic, dish: string, have: string[], diet: Diet, staples: string[], problems: string[]) {
  const started = Date.now();
  const r = await client.messages.parse(
    {
      model: MODEL,
      max_tokens: 3000,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(Dish) },
      system: [{ type: "text", cache_control: { type: "ephemeral" }, text: NAMED_SYSTEM(staples) }],
      messages: [{
        role: "user",
        content: JSON.stringify({ dish, diet, have, ...(problems.length ? { fix_these_problems_from_your_last_answer: problems } : {}) }),
      }],
    },
    { timeout: 25_000 },
  );
  return { dish: r.stop_reason === "refusal" ? null : (r.parsed_output as ModelDish | null), usage: r.usage, ms: Date.now() - started, refused: r.stop_reason === "refusal" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: { household_id?: string; dish?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const householdId = body.household_id ?? "";
  if (!householdId) return json({ error: "household_id is required" }, 400);
  const named = body.dish === undefined || body.dish === null || body.dish === "" ? null : cleanDishName(body.dish);
  if (body.dish && !named) return json({ error: "dish name is not valid" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return json({ error: "sign in first" }, 401);
  const { data: me } = await sb.from("household_members").select("id")
    .eq("household_id", householdId).eq("user_id", auth.user.id).eq("status", "active").maybeSingle();
  if (!me) return json({ error: "not a member of this household" }, 403);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "invent_unavailable" }, 503);

  const [{ data: hh }, { data: members }, { data: rows, error }] = await Promise.all([
    sb.from("households").select("timezone").eq("id", householdId).maybeSingle(),
    sb.from("household_members").select("diet").eq("household_id", householdId).eq("status", "active"),
    sb.from("inventory_items").select("id, custom_name, state, flavor_roles, confidence, expiry_date, ingredients(canonical_name)")
      .eq("household_id", householdId).eq("status", "active"),
  ]);
  if (error) return json({ error: error.message }, 500);
  const today = localDate(new Date(), (hh?.timezone as string | undefined) ?? "Asia/Kolkata");
  const items = inventItems((rows ?? []) as unknown as ItemRow[], today);
  const diet = tableDiet(((members ?? []) as { diet: Diet | null }[]).map((m) => m.diet));
  const plan = named ? null : planInvention(items, CATALOG, diet);
  if (!named && !plan) return json({ recipe_id: null, reason: "too_little" });

  const staples = [...CATALOG.values()].filter((c) => c.staple && (diet === "nonveg" || !["meat", "seafood", "egg"].includes(c.category))).map((c) => c.name);
  const have = new Set(items.filter((i) => i.confidence >= 0.5).map((i) => i.key));
  const client = new Anthropic();
  const task = named ? NAMED_TASK : TASK;
  const version = named ? NAMED_VERSION : PROMPT_VERSION;
  let doc: RecipeDoc | null = null;
  let toBuy: string[] = [];
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2 && !doc; attempt++) {
    try {
      const r = named
        ? await askNamed(client, named, [...have].sort(), diet, staples, problems)
        : await askModel(client, plan!, diet, staples, problems);
      const candidate = r.dish ? docFromModel(r.dish, diet) : null;
      if (!candidate) problems = ["no dish"];
      else if (named) {
        // A named dish may need a few things from the shop; the validator treats those as bought.
        toBuy = toBuyFor(candidate, have);
        problems = toBuy.length > MAX_TO_BUY ? [`needs ${toBuy.length} things to buy; at most ${MAX_TO_BUY}`] : [];
        problems.push(...validateInvention(candidate, namedPlan(candidate, items), { catalog: CATALOG, diet, have: new Set([...have, ...toBuy]) }));
      } else {
        problems = validateInvention(candidate, plan!, { catalog: CATALOG, diet, have });
      }
      await logAiRequest({
        householdId, task, model: MODEL, promptVersion: version, latencyMs: r.ms, usage: r.usage,
        status: r.refused ? "refused" : problems.length ? "invalid_output" : "ok", error: problems.join("; ") || null,
      });
      if (candidate && !problems.length) doc = candidate;
      if (r.refused) break;
    } catch (err) {
      const status = err instanceof Anthropic.APIConnectionTimeoutError ? "timeout" : "error";
      await logAiRequest({ householdId, task, model: MODEL, promptVersion: version, latencyMs: 0, status, error: err instanceof Error ? err.message : String(err) });
      break;
    }
  }
  if (!doc) return json({ recipe_id: null, reason: "nothing_safe", problems }, 200);

  // Save as the household's own recipe, a new creation (not a variant of anything).
  const names = [...new Set(doc.ingredients.map((i) => i.ingredient))];
  const { data: ings } = await sb.from("ingredients").select("id, canonical_name").in("canonical_name", names);
  const ingredientIds = new Map(((ings ?? []) as { id: string; canonical_name: string }[]).map((i) => [i.canonical_name, i.id]));
  const rowsOut = variantRows({ ...doc, id: undefined }, doc, { recipeId: crypto.randomUUID(), householdId, memberId: me.id, ingredientIds }, doc.description);
  const recipe = { ...rowsOut.recipe, parent_recipe_id: null, source: "generated" };
  const { error: e1 } = await sb.from("recipes").insert(recipe);
  if (e1) return json({ error: e1.message }, 500);
  const { error: e2 } = await sb.from("recipe_ingredients").insert(rowsOut.ingredients);
  const { error: e3 } = await sb.from("recipe_steps").insert(rowsOut.steps.map(({ technique_slug: _t, ...s }) => ({ ...s, technique_id: null })));
  if (e2 || e3) {
    await sb.from("recipes").delete().eq("id", recipe.id);
    return json({ error: (e2 ?? e3)!.message }, 500);
  }
  return json({
    recipe_id: recipe.id,
    title: doc.title,
    titles: doc.titles,
    description: doc.description,
    uses: plan ? plan.use.map((u) => u.key) : doc.ingredients.map((i) => i.ingredient).filter((k) => have.has(k)),
    to_buy: toBuy,
    named: !!named,
    new_creation: true,
  });
});
