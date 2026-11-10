// parse-inventory (KIT-031): natural-language pantry text -> structured items for the confirm sheet.
// Rules first (fast, free, works offline-ish); Claude Haiku only for what the rules can't place.
// Nothing is written to the pantry here: the app shows the items back and calls add_inventory_items on confirm.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { z } from "npm:zod@4.6.5";

import { allConfident, buildIndex, type CatalogIndex, parsePantryText, type ParsedItem } from "../_shared/pantryParse.ts";
import { type CatalogRow, catalogHints, toCatalog, toResponseItem, wasMentioned } from "./logic.ts";

const TASK = "parse_inventory_text";
const MODEL = "claude-haiku-5-5";
const PROMPT_VERSION = "parse_inventory_text@1";
const MAX_TEXT = 600;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Catalog is global and changes only with a content deploy: cache it for the life of the worker.
let cached: { rows: CatalogRow[]; index: CatalogIndex; hints: string; ids: Map<string, string> } | null = null;

async function loadCatalog(sb: SupabaseClient) {
  if (cached) return cached;
  const { data, error } = await sb
    .from("ingredients")
    .select("id, canonical_name, names, aliases, default_location_kind, default_unit, is_staple");
  if (error) throw error;
  const rows = (data ?? []) as CatalogRow[];
  const catalog = toCatalog(rows);
  cached = {
    rows,
    index: buildIndex(catalog),
    hints: catalogHints(catalog),
    ids: new Map(rows.map((r) => [r.canonical_name, r.id])),
  };
  return cached;
}

const ModelItems = z.object({
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

const INSTRUCTIONS = `You turn what an Indian home cook says about their kitchen into pantry items.
The text may be Hindi (Devanagari), Hinglish or English, often mixed, and may come from speech recognition.

Rules:
- One item per thing mentioned. Never add anything that was not mentioned.
- said: the item in the user's own words, without quantity words.
- ingredient_key: the canonical name from the catalog below when the item is clearly one of those; otherwise null.
- quantity and unit: only when stated. Convert number words (ek, do, dedh, dhai, sawa, paune, aadha; एक, दो, डेढ़).
  Units: kg, g, l, ml, piece, packet, bunch, katori, cup, bottle, box. "dozen" = 12 piece. "paav kilo" = 0.25 kg.
- location_kind: only if the user said where it is, or for homemade things (ready_made).
- state: "homemade" for things made at home (ghar ki chutney), "leftover" for leftovers (bachi hui dal), else null.
- confidence: 0.9+ when certain, lower when unsure what the item is or how much.

Catalog (canonical | hinglish | hindi | aliases):
`;

async function callModel(text: string, language: string, hints: string) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const started = Date.now();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1500,
    // Extraction with a fixed format: no thinking, lowest effort, for the 1.2 s latency budget.
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(ModelItems) },
    system: [{ type: "text", text: INSTRUCTIONS + hints, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Language: ${language}\nText: ${text}` }],
  });
  return { response, latencyMs: Date.now() - started };
}

async function logRequest(entry: {
  household_id: string;
  status: "ok" | "error" | "timeout" | "refused" | "invalid_output";
  latency_ms: number;
  usage?: Anthropic.Usage;
  error?: string;
}) {
  // ai_requests has no RLS policies: only the service role writes it.
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await admin.from("ai_requests").insert({
    household_id: entry.household_id,
    task: TASK,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
    input_tokens: entry.usage?.input_tokens ?? null,
    cached_tokens: entry.usage?.cache_read_input_tokens ?? null,
    output_tokens: entry.usage?.output_tokens ?? null,
    latency_ms: entry.latency_ms,
    status: entry.status,
    error: entry.error?.slice(0, 500) ?? null,
  });
  if (error) console.error("ai_requests insert failed", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { household_id?: string; text?: string; language_code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const text = (body.text ?? "").trim();
  const householdId = body.household_id ?? "";
  if (!text || !householdId) return json({ error: "household_id and text are required" }, 400);
  if (text.length > MAX_TEXT) return json({ error: `text is longer than ${MAX_TEXT} characters` }, 413);

  // The user's own token: RLS decides what they can read, exactly as in the app.
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return json({ error: "sign in first" }, 401);
  const { data: member } = await sb
    .from("household_members")
    .select("id")
    .eq("household_id", householdId)
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!member) return json({ error: "not a member of this household" }, 403);

  const catalog = await loadCatalog(sb);
  const ruled = parsePantryText(text, catalog.index);
  const fromRules = (items: ParsedItem[], source: string) =>
    json({ items: items.map((i) => toResponseItem(i, catalog.ids)), source });

  if (allConfident(ruled)) return fromRules(ruled, "rules");
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return fromRules(ruled, "rules_fallback");

  const started = Date.now();
  try {
    const { response, latencyMs } = await callModel(text, body.language_code ?? "en-IN", catalog.hints);
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      await logRequest({
        household_id: householdId,
        status: response.stop_reason === "refusal" ? "refused" : "invalid_output",
        latency_ms: latencyMs,
        usage: response.usage,
      });
      return fromRules(ruled, "rules_fallback");
    }
    await logRequest({ household_id: householdId, status: "ok", latency_ms: latencyMs, usage: response.usage });

    const byName = new Map(catalog.rows.map((r) => [r.canonical_name, r]));
    const entries = new Map(toCatalogEntries(catalog.rows));
    const items = response.parsed_output.items
      .map((m) => {
        const key = m.ingredient_key && byName.has(m.ingredient_key) ? m.ingredient_key : null;
        return {
          said: m.said.trim(),
          ingredientKey: key,
          quantity: m.quantity,
          unit: m.unit,
          locationKind: m.location_kind,
          state: m.state,
          confidence: Math.max(0, Math.min(1, m.confidence)) * (key ? 1 : 0.7),
        } satisfies ParsedItem;
      })
      .filter((i) => i.said && wasMentioned(text, i.said, i.ingredientKey ? entries.get(i.ingredientKey) : undefined));
    return fromRules(items, "model");
  } catch (err) {
    const status = err instanceof Anthropic.APIConnectionTimeoutError ? "timeout" : "error";
    await logRequest({
      household_id: householdId,
      status,
      latency_ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    return fromRules(ruled, "rules_fallback");
  }
});

function toCatalogEntries(rows: CatalogRow[]) {
  return toCatalog(rows).map((e) => [e.name, e] as const);
}
