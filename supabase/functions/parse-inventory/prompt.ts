// parse-inventory prompt (KIT-031, KIT-133). The exact request the function sends, kept apart so the evaluation
// harness (../_evals) sends the same thing. Changing anything here is a prompt change: bump PROMPT_VERSION and run
// the evals (CI runs them on every pull request that touches a prompt).
import type Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { z } from "npm:zod@4.6.5";

export const TASK = "parse_inventory_text";
export const MODEL = "claude-haiku-5-5";
export const PROMPT_VERSION = "parse_inventory_text@2";

export const ModelItems = z.object({
  items: z.array(
    z.object({
      said: z.string(),
      ingredient_key: z.string().nullable(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      location_kind: z.enum(["fridge", "freezer", "pantry", "staples", "ready_made", "counter"]).nullable(),
      state: z.enum(["raw", "opened", "cooked", "homemade", "leftover"]).nullable(),
      confidence: z.number(),
      out: z.boolean(),
    }),
  ),
});

export const INSTRUCTIONS = `You turn what an Indian home cook says about their kitchen into pantry items.
The text may be Hindi (Devanagari), Hinglish or English, often mixed, and may come from speech recognition.

Rules:
- One item per thing mentioned. Never add anything that was not mentioned.
- said: the item in the user's own words, without quantity words or words about when ("kal ki bachi dal" -> "dal").
- ingredient_key: the canonical name from the catalog below when the item is clearly one of those; otherwise null.
- quantity and unit: only when stated. Convert number words (ek, do, dedh, dhai, sawa, paune, aadha; एक, दो, डेढ़);
  "sau" multiplies ("dhai sau gram" = 250 g). Vague amounts (thoda, kuch, some) are null.
  Units: kg, g, l, ml, piece, packet, bunch, katori, cup, bottle, box. "dozen" = 12 piece. "paav kilo" = 0.25 kg.
- location_kind: only if the user said where it is, or for homemade things (ready_made).
- state: "homemade" for things made at home (ghar ki chutney), "leftover" for cooked food left from an earlier meal
  (bachi hui dal, kal ki sabzi, leftover rice), else null. A leftover dish keeps its own name in "said".
- out: true when they say it ran out or is finished (khatam ho gaya, nahi hai, out of, ख़त्म), else false.
- confidence: 0.9+ when certain, lower when unsure what the item is or how much.

Catalog (canonical | hinglish | hindi | aliases):
`;

/** The request for one piece of pantry text. */
export function parseRequest(text: string, language: string, hints: string) {
  return {
    model: MODEL,
    max_tokens: 1500,
    // Extraction with a fixed format: no thinking, lowest effort, for the 1.2 s latency budget.
    thinking: { type: "disabled" as const },
    output_config: { effort: "low" as const, format: zodOutputFormat(ModelItems) },
    system: [{ type: "text" as const, text: INSTRUCTIONS + hints, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: `Language: ${language}\nText: ${text}` }],
  };
}

export async function callModel(client: Anthropic, text: string, language: string, hints: string) {
  const started = Date.now();
  const response = await client.messages.parse(parseRequest(text, language, hints));
  return { response, latencyMs: Date.now() - started };
}
