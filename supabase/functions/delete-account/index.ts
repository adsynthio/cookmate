// delete-account (KIT-122, DPDP right of erasure): households the caller alone owns are deleted with everything in
// them; in households someone else owns too, the caller is unlinked. Then the auth user goes (profile cascades).
// It runs at once, well inside the 30 days the PRD allows. The cook must type the confirmation word.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

import { confirmed } from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: { confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!confirmed(body.confirm)) return json({ error: "confirmation_required" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: auth } = await user.auth.getUser();
  if (!auth.user) return json({ error: "sign in first" }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: result, error } = await admin.schema("private").rpc("delete_account_data", { p_user: auth.user.id });
  if (error) return json({ error: error.message }, 500);
  const gone = await admin.auth.admin.deleteUser(auth.user.id);
  if (gone.error) return json({ error: gone.error.message }, 500);
  return json({ deleted: true, ...(result as Record<string, unknown>) });
});
