// session-bundle (KIT-076, COOK-08): what the phone needs to finish a dish with no network, fetched once when
// cooking starts. The steps and photos are already on the phone with the recipe; this adds the cached step
// recordings this cook would hear, as public links into the step-audio bucket. Read with the caller's own JWT, so
// row-level security decides what they can see.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

import { audioLanguage, type AudioRow, pickAudio, type Profile, type StepWithNo } from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: { session_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!body.session_id) return json({ error: "session_id is required" }, 400);

  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: auth } = await user.auth.getUser();
  if (!auth.user) return json({ error: "sign in first" }, 401);

  const session = await user
    .from("cooking_sessions")
    .select("id, member_id, recipe_id, language_code, status")
    .eq("id", body.session_id)
    .maybeSingle();
  if (session.error) return json({ error: session.error.message }, 500);
  if (!session.data) return json({ error: "session not found" }, 404);
  const s = session.data as { member_id: string; recipe_id: string; language_code: string; status: string };

  const [profile, steps] = await Promise.all([
    user.from("voice_profiles").select("verbosity, skill_level, tts_voice_id").eq("member_id", s.member_id).maybeSingle(),
    user.from("recipe_steps").select("id, recipe_id, step_no, instruction, sensory_cue, safety_note").eq("recipe_id", s.recipe_id),
  ]);
  if (steps.error) return json({ error: steps.error.message }, 500);
  const stepRows = (steps.data ?? []) as StepWithNo[];

  const cached = stepRows.length
    ? await user
      .from("step_audio_cache")
      .select("step_id, language_code, voice_id, variant_hash, storage_path")
      .in("step_id", stepRows.map((x) => x.id))
      .eq("language_code", audioLanguage(s.language_code))
    : { data: [], error: null };
  if (cached.error) return json({ error: cached.error.message }, 500);

  const picked = await pickAudio(stepRows, (cached.data ?? []) as AudioRow[], {
    languageCode: s.language_code,
    profile: (profile.data ?? null) as Profile | null,
  });
  const bucket = user.storage.from("step-audio");
  return json({
    session_id: body.session_id,
    status: s.status,
    language_code: audioLanguage(s.language_code),
    audio: picked.map((a) => ({ step_no: a.step_no, url: bucket.getPublicUrl(a.path).data.publicUrl })),
  });
});
