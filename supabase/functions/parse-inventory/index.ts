// parse-inventory (KIT-031): natural-language pantry text -> structured items for the confirm sheet.
// Rules first (fast, free, works offline-ish); Claude Haiku only for what the rules can't place.
// Nothing is written to the pantry here: the app shows the items back and calls add_inventory_items on confirm.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";

import { logAiRequest } from "../_shared/aiLog.ts";
import { allConfident, buildIndex, type CatalogIndex, parsePantryText, type ParsedItem } from "../_shared/pantryParse.ts";
import { type CatalogRow, catalogHints, toCatalog, toResponseItem, wasMentioned } from "./logic.ts";
import { callModel, MODEL, PROMPT_VERSION, TASK } from "./prompt.ts";

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


async function logRequest(entry: {
  household_id: string;
  status: "ok" | "error" | "timeout" | "refused" | "invalid_output";
  latency_ms: number;
  usage?: Anthropic.Usage;
  error?: string;
}) {
  await logAiRequest({
    householdId: entry.household_id,
    task: TASK,
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    status: entry.status,
    latencyMs: entry.latency_ms,
    usage: entry.usage,
    error: entry.error,
  });
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
    const { response, latencyMs } = await callModel(new Anthropic(), text, body.language_code ?? "en-IN", catalog.hints);
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
