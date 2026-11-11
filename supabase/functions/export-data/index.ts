// export-data (KIT-121, DPDP right of access): a zip of everything Cookmate keeps about the caller's household,
// read with the caller's own JWT (row-level security decides), stored in the private exports bucket and handed
// back as a signed link that works for 24 hours. Earlier exports of the household are removed first.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

import { exportFiles, exportPath, zip } from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: { household_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!body.household_id) return json({ error: "household_id is required" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: auth } = await user.auth.getUser();
  if (!auth.user) return json({ error: "sign in first" }, 401);

  const { data, error } = await user.rpc("export_household", { p_household: body.household_id });
  if (error) return json({ error: error.code === "42501" ? "not a member of this household" : error.message }, error.code === "42501" ? 403 : 500);

  const now = new Date();
  const bytes = zip(exportFiles(data as Record<string, unknown[]>, now), now);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const bucket = admin.storage.from("exports");
  const old = await bucket.list(body.household_id);
  if (old.data?.length) await bucket.remove(old.data.map((f) => `${body.household_id}/${f.name}`));
  const path = exportPath(body.household_id, crypto.randomUUID());
  const up = await bucket.upload(path, bytes, { contentType: "application/zip" });
  if (up.error) return json({ error: up.error.message }, 500);
  const signed = await bucket.createSignedUrl(path, 24 * 60 * 60, { download: `cookmate-${now.toISOString().slice(0, 10)}.zip` });
  if (signed.error) return json({ error: signed.error.message }, 500);
  return json({ url: signed.data.signedUrl, expires_at: new Date(now.getTime() + 86_400_000).toISOString(), bytes: bytes.length });
});
