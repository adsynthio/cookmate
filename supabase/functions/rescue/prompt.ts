// rescue prompt (KIT-091, KIT-133). The exact request the function sends, kept apart so the evaluation harness
// (../_evals) sends the same thing. Changing anything here is a prompt change: bump PROMPT_VERSION and run the evals.
import type Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { z } from "npm:zod@4.6.5";

import type { RecipeDoc } from "../_shared/recipes.ts";
import { MAX_STEP_CHARS, MAX_STEPS, playbookText, type Problem, type RescueContext, type RescueLocale } from "../_shared/rescue.ts";
import { LANGUAGE_NAME } from "./logic.ts";

export const TASK = "rescue_fix";
export const MODEL = "claude-haiku-5-5";
export const PROMPT_VERSION = "rescue_fix@1";

export const Fix = z.object({ steps: z.array(z.string()), uses: z.array(z.string()) });

export function rescueRequest(doc: RecipeDoc, stepNo: number, problem: Problem, ctx: RescueContext, locale: RescueLocale) {
  return {
    model: MODEL,
    max_tokens: 400,
    thinking: { type: "disabled" as const },
    output_config: { effort: "low" as const, format: zodOutputFormat(Fix) },
    system: [{
      type: "text" as const,
      cache_control: { type: "ephemeral" as const },
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
      role: "user" as const,
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
  };
}

export async function askModel(client: Anthropic, doc: RecipeDoc, stepNo: number, problem: Problem, ctx: RescueContext, locale: RescueLocale) {
  const started = Date.now();
  const r = await client.messages.parse(rescueRequest(doc, stepNo, problem, ctx, locale), { timeout: 2500 });
  const ms = Date.now() - started;
  return { fix: r.stop_reason === "refusal" ? null : r.parsed_output, usage: r.usage, ms, refused: r.stop_reason === "refusal" };
}
