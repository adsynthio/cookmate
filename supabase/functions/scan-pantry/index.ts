// scan-pantry (KIT-160 fridge photo, KIT-161 barcode, KIT-162 shop bill): one photo or one barcode -> pantry items
// for the confirm sheet. Nothing is written to the pantry and the photo is never stored: it goes to the model once
// and is dropped. The app shows the items back and calls add_inventory_items only after the cook confirms.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";

import { logAiRequest } from "../_shared/aiLog.ts";
import { buildIndex, type CatalogIndex, type ParsedItem } from "../_shared/pantryParse.ts";
import { type CatalogRow, catalogHints, toCatalog, toResponseItem } from "../parse-inventory/logic.ts";
import { cleanAppliances, fromModel, fromOpenFoodFacts, type OffProduct, readBody } from "./logic.ts";
import { callModel, MODEL, PROMPT_VERSION, TASK } from "./prompt.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

let cached: { rows: CatalogRow[]; index: CatalogIndex; hints: string; ids: Map<string, string> } | null = null;

async function loadCatalog(sb: SupabaseClient) {
  if (cached) return cached;
  const { data, error } = await sb
    .from("ingredients")
    .select("id, canonical_name, names, aliases, default_location_kind, default_unit, is_staple");
  if (error) throw error;
  const rows = (data ?? []) as CatalogRow[];
  const catalog = toCatalog(rows);
  cached = { rows, index: buildIndex(catalog), hints: catalogHints(catalog), ids: new Map(rows.map((r) => [r.canonical_name, r.id])) };
  return cached;
}

/** Open Food Facts, the open product database; a missing or slow answer is just "not found". */
async function lookUpBarcode(code: string): Promise<OffProduct | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,generic_name,quantity,categories_tags`,
      { headers: { "User-Agent": "Cookmate/1.0 (kitchen app)" }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { status?: number; product?: OffProduct };
    return body.status === 1 ? body.product ?? null : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const read = readBody(raw);
  if (!read.ok) return json({ error: read.error }, read.status);
  const body = read.body;

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
    .eq("household_id", body.householdId)
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!member) return json({ error: "not a member of this household" }, 403);

  const catalog = await loadCatalog(sb);
  const reply = (items: ParsedItem[], source: string, appliances: string[] = []) =>
    json({ items: items.map((i) => toResponseItem(i, catalog.ids)), source, appliances });

  if (body.kind === "barcode") {
    const item = fromOpenFoodFacts(await lookUpBarcode(body.code), catalog.index);
    return reply(item ? [item] : [], item ? "barcode" : "barcode_unknown");
  }

  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ items: [], source: "not_configured" });

  const started = Date.now();
  const log = (status: "ok" | "error" | "timeout" | "refused" | "invalid_output", latencyMs: number, usage?: Anthropic.Usage, error?: string) =>
    logAiRequest({ householdId: body.householdId, task: TASK, model: MODEL, promptVersion: PROMPT_VERSION, status, latencyMs, usage, error });
  try {
    const { response, latencyMs } = await callModel(new Anthropic(), body.kind, body.image, body.mediaType, catalog.hints);
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      await log(response.stop_reason === "refusal" ? "refused" : "invalid_output", latencyMs, response.usage);
      return json({ items: [], source: "unreadable" });
    }
    await log("ok", latencyMs, response.usage);
    return reply(
      fromModel(response.parsed_output.items, new Set(catalog.rows.map((r) => r.canonical_name))),
      "model",
      cleanAppliances(response.parsed_output.appliances),
    );
  } catch (err) {
    const status = err instanceof Anthropic.APIConnectionTimeoutError ? "timeout" : "error";
    await log(status, Date.now() - started, undefined, err instanceof Error ? err.message : String(err));
    return json({ items: [], source: "unreadable" });
  }
});
