// scan-pantry prompt (KIT-160, KIT-162): a photo of a fridge or shelf, or of a shop bill, -> pantry items for the
// confirm sheet. Kept apart from the handler so evaluations can send exactly the same request. Changing anything
// here is a prompt change: bump PROMPT_VERSION.
import type Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { z } from "npm:zod@4.6.5";

export const TASK = "scan_pantry_image";
export const MODEL = "claude-opus-5-5";
export const PROMPT_VERSION = "scan_pantry_image@1";

export type ScanKind = "fridge" | "bill";

export const ScanItems = z.object({
  items: z.array(
    z.object({
      said: z.string(),
      ingredient_key: z.string().nullable(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      location_kind: z.enum(["fridge", "freezer", "pantry", "staples", "ready_made", "counter"]).nullable(),
      state: z.enum(["raw", "opened", "cooked", "homemade", "leftover"]).nullable(),
      confidence: z.number(),
    }),
  ),
});

const COMMON = `Rules for every item:
- One item per distinct food. Never list anything you cannot see (or that is not on the bill).
- said: a short plain name for the item as an Indian home cook would say it, in English (e.g. "paneer", "toor dal").
- ingredient_key: the canonical name from the catalog below when it is clearly one of those; otherwise null.
- quantity and unit only when you can read or count them. Units: kg, g, l, ml, piece, packet, bunch, bottle, box.
- confidence: 0.9+ when certain, lower when the item or amount is a guess.
- Ignore people, hands, utensils, appliances, cleaning products, toiletries and anything that is not food.

Catalog (canonical | hinglish | hindi | aliases):
`;

export const INSTRUCTIONS: Record<ScanKind, string> = {
  fridge: `You look at a photo of an Indian home kitchen: an open fridge, a shelf, a freezer or a counter.
List the food you can see so the cook can add it to their kitchen.
- location_kind: where it is in the photo (fridge door and shelves = fridge, freezer drawer = freezer,
  shelf or cupboard = pantry, spice box and oil = staples, a steel container of cooked food = ready_made).
- state: "leftover" for cooked food in a container (dal, sabzi, rice), "opened" for an opened packet, else null.
- Count whole items you can see (eggs, tomatoes, lemons). Leave quantity null for things in closed containers.
` + COMMON,
  bill: `You read a photo of an Indian grocery bill or receipt (kirana, supermarket or app order).
List the food items bought so the cook can add them to their kitchen.
- Skip totals, taxes, discounts, bags, delivery charges and non-food lines.
- Bills abbreviate (e.g. "TD 1KG" = toor dal 1 kg, "AASHIRVAD ATTA 5" = whole wheat flour 5 kg). Expand them, and
  drop brand names from said.
- quantity and unit from the line (weight or count). If a line says only a count of packets, use unit "packet".
- location_kind: null (the app knows where each thing is usually kept). state: null.
` + COMMON,
};

/** The request for one photo. `hints` is the catalog, identical on every call so it stays cached. */
export function scanRequest(kind: ScanKind, imageBase64: string, mediaType: "image/jpeg" | "image/png", hints: string) {
  return {
    model: MODEL,
    max_tokens: 4000,
    // Extraction with a fixed format: the lowest effort is enough and keeps the wait short.
    output_config: { effort: "low" as const, format: zodOutputFormat(ScanItems) },
    system: [{ type: "text" as const, text: INSTRUCTIONS[kind] + hints, cache_control: { type: "ephemeral" as const } }],
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: imageBase64 } },
          { type: "text" as const, text: kind === "bill" ? "Read this bill." : "What food is in this photo?" },
        ],
      },
    ],
  };
}

export async function callModel(client: Anthropic, kind: ScanKind, imageBase64: string, mediaType: "image/jpeg" | "image/png", hints: string) {
  const started = Date.now();
  const response = await client.messages.parse(scanRequest(kind, imageBase64, mediaType, hints));
  return { response, latencyMs: Date.now() - started };
}
