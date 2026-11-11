// tts-cache (KIT-080, VOICE-14): records published recipe steps once per language and voice into the public
// step-audio bucket and step_audio_cache, so the voice agent plays a file instead of paying for live speech every
// time a step is read. Run hourly (pg_cron or the scheduled workflow) with the service role; each run does at most
// `limit` recordings. Without SARVAM_API_KEY it answers 503 tts_not_configured and does nothing.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

import { decodeAudios, plan, SARVAM_TTS_URL, sarvamBody, type CacheRow, type StepRow } from "./logic.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // Only the scheduler, holding the service key, may run this: it spends money and writes a public bucket.
  if (!serviceKey || req.headers.get("Authorization") !== `Bearer ${serviceKey}`) return json({ error: "service role only" }, 401);
  const apiKey = Deno.env.get("SARVAM_API_KEY");
  if (!apiKey) return json({ error: "tts_not_configured" }, 503);

  let body: { limit?: number; languages?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // an empty body is fine
  }
  const limit = Math.max(1, Math.min(100, Number(body.limit) || 40));
  const model = Deno.env.get("SARVAM_TTS_MODEL") ?? "bulbul:v3";

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false } });
  const { data: steps, error } = await admin
    .from("recipe_steps")
    .select("id, recipe_id, instruction, sensory_cue, safety_note, recipes!inner(is_published, household_id, created_at)")
    .eq("recipes.is_published", true)
    .is("recipes.household_id", null)
    .order("recipe_id")
    .order("step_no");
  if (error) return json({ error: error.message }, 500);
  const stepIds = (steps ?? []).map((s) => s.id as string);
  const { data: cached, error: cacheError } = stepIds.length
    ? await admin.from("step_audio_cache").select("step_id, language_code, voice_id, variant_hash").in("step_id", stepIds)
    : { data: [], error: null };
  if (cacheError) return json({ error: cacheError.message }, 500);

  const jobs = await plan((steps ?? []) as unknown as StepRow[], (cached ?? []) as CacheRow[], { limit, languages: body.languages });
  let made = 0;
  let characters = 0;
  const failed: string[] = [];
  for (const job of jobs) {
    try {
      const res = await fetch(SARVAM_TTS_URL, {
        method: "POST",
        headers: { "api-subscription-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(sarvamBody(job, model)),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`sarvam ${res.status}`);
      const audio = decodeAudios((await res.json()).audios);
      if (!audio) throw new Error("sarvam returned no audio");
      const up = await admin.storage.from("step-audio").upload(job.path, audio, { contentType: "audio/mpeg", upsert: true });
      if (up.error) throw up.error;
      const row = await admin.from("step_audio_cache").upsert(
        { recipe_id: job.recipeId, step_id: job.stepId, language_code: job.language, voice_id: job.voiceId, variant_hash: job.hash, storage_path: job.path, characters: job.text.length },
        { onConflict: "step_id,language_code,voice_id,variant_hash" },
      );
      if (row.error) throw row.error;
      made++;
      characters += job.text.length;
    } catch (err) {
      console.error("tts-cache job failed", job.path, err instanceof Error ? err.message : err);
      failed.push(job.path);
    }
  }
  return json({ planned: jobs.length, made, characters, failed });
});
