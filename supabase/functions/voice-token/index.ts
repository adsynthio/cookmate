// voice-token (KIT-061, VOICE-07): a signed-in household member gets a LiveKit token for one new room, with the
// Cookmate cooking agent dispatched to it by name. The dispatch metadata carries the household, member, cooking
// session and the user's own JWT, so the agent reads and writes as that user under row-level security. A
// voice_sessions row is opened for usage and cost telemetry (no audio, no transcript).
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

import { languageOr, mintToken, roomName } from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Body = { household_id?: string; cooking_session_id?: string; language_code?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!body.household_id) return json({ error: "household_id is required" }, 400);

  const authorization = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return json({ error: "sign in first" }, 401);

  const { data: me } = await sb.from("household_members").select("id, display_name, voice_profiles(language_code)")
    .eq("household_id", body.household_id).eq("user_id", auth.user.id).eq("status", "active").maybeSingle();
  if (!me) return json({ error: "not a member of this household" }, 403);

  // Voice needs the member's consent to process their voice (KIT-023).
  const { data: consent } = await sb.from("consents").select("granted").eq("member_id", me.id).eq("consent_type", "voice_processing")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!consent?.granted) return json({ error: "voice_consent_needed" }, 403);

  let sessionId: string | null = null;
  if (body.cooking_session_id) {
    const { data: s } = await sb.from("cooking_sessions").select("id").eq("id", body.cooking_session_id)
      .eq("household_id", body.household_id).maybeSingle();
    if (!s) return json({ error: "session not found" }, 404);
    sessionId = s.id as string;
  }

  const url = Deno.env.get("LIVEKIT_URL");
  const apiKey = Deno.env.get("LIVEKIT_API_KEY");
  const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!url || !apiKey || !apiSecret) return json({ error: "voice_not_configured" }, 503);

  const profile = (me as unknown as { voice_profiles: { language_code: string } | { language_code: string }[] | null }).voice_profiles;
  const saved = Array.isArray(profile) ? profile[0]?.language_code : profile?.language_code;
  const language = languageOr(body.language_code, languageOr(saved, "en-IN"));
  const room = roomName();

  // Telemetry row, written with the service role (members can only read it).
  let voiceSessionId: string | null = null;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey) {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false } });
    const { data: vs, error } = await admin.from("voice_sessions")
      .insert({ household_id: body.household_id, member_id: me.id, cooking_session_id: sessionId, room_name: room, channel: "app" })
      .select("id").single();
    if (error) console.error("voice_sessions insert failed", error.message);
    voiceSessionId = (vs?.id as string | undefined) ?? null;
  }

  const token = await mintToken({
    apiKey,
    apiSecret,
    identity: me.id as string,
    name: me.display_name as string,
    room,
    agentName: Deno.env.get("LIVEKIT_AGENT_NAME") ?? "cookmate-voice-cook",
    metadata: {
      household_id: body.household_id,
      member_id: me.id as string,
      cooking_session_id: sessionId,
      voice_session_id: voiceSessionId,
      language_code: language,
      user_jwt: authorization.replace(/^Bearer\s+/i, ""),
    },
  });

  return json({ livekit_url: url, token, room_name: room, voice_session_id: voiceSessionId, language_code: language });
});
