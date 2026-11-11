// tts-cache logic (KIT-080): which step recordings are missing, the exact words for each, and the Sarvam request.
// The words and the cache key must match the voice agent (services/voice-agent/cookmate_voice/style.py), or the
// agent will never find a recording and will always fall back to live speech.

export const LANGUAGES = ["hi-IN", "en-IN"] as const;
export const DEFAULT_VOICE = "default";
export const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
export const MAX_CHARS = 1500;

export type StepRow = {
  id: string;
  recipe_id: string;
  instruction: string | null;
  sensory_cue: string | null;
  safety_note: string | null;
};

export type CacheRow = { step_id: string; language_code: string; voice_id: string; variant_hash: string };

export type Job = {
  recipeId: string;
  stepId: string;
  language: string;
  voiceId: string;
  text: string;
  hash: string;
  path: string;
};

function sentence(text: string): string {
  return /[.!?।]$/.test(text) ? text : `${text}.`;
}

/**
 * What the agent says for a step: with the cue (beginners, or anyone who asked for detail) and without it.
 * The safety note is in both, always. Mirrors step_speech() in style.py.
 */
export function stepVariants(step: StepRow): string[] {
  const text = (step.instruction ?? "").trim();
  if (!text) return [];
  const cue = (step.sensory_cue ?? "").trim();
  const safety = (step.safety_note ?? "").trim();
  const join = (parts: string[]) => parts.filter(Boolean).map(sentence).join(" ");
  const withCue = join([text, cue, safety]);
  const without = join([text, safety]);
  return withCue === without ? [without] : [withCue, without];
}

/** First 16 hex characters of the SHA-256 of the exact words. Mirrors variant_hash() in style.py. */
export async function variantHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function cachePath(language: string, voiceId: string, stepId: string, hash: string): string {
  return `${language}/${voiceId}/${stepId}/${hash}.mp3`;
}

/** Recordings still to make, oldest recipes first, at most `limit`. */
export async function plan(
  steps: StepRow[],
  cached: CacheRow[],
  opts: { languages?: readonly string[]; voiceId?: string; limit: number },
): Promise<Job[]> {
  const voiceId = opts.voiceId ?? DEFAULT_VOICE;
  const have = new Set(cached.map((c) => `${c.step_id}|${c.language_code}|${c.voice_id}|${c.variant_hash}`));
  const jobs: Job[] = [];
  for (const step of steps) {
    for (const text of stepVariants(step)) {
      if (text.length > MAX_CHARS) continue;
      const hash = await variantHash(text);
      for (const language of opts.languages ?? LANGUAGES) {
        if (have.has(`${step.id}|${language}|${voiceId}|${hash}`)) continue;
        jobs.push({ recipeId: step.recipe_id, stepId: step.id, language, voiceId, text, hash, path: cachePath(language, voiceId, step.id, hash) });
        if (jobs.length >= opts.limit) return jobs;
      }
    }
  }
  return jobs;
}

/** The Sarvam request body, at normal pace (the agent uses live speech for a cook who asked for slower). */
export function sarvamBody(job: Job, model: string): Record<string, unknown> {
  return {
    target_language_code: job.language,
    text: job.text,
    ...(job.voiceId === DEFAULT_VOICE ? {} : { speaker: job.voiceId }),
    pace: 1.0,
    speech_sample_rate: 22050,
    model,
    output_audio_codec: "mp3",
  };
}

/** Sarvam returns base64 audio chunks; MP3 frames can be joined end to end. */
export function decodeAudios(audios: unknown): Uint8Array | null {
  if (!Array.isArray(audios) || !audios.length || !audios.every((a) => typeof a === "string" && a.length)) return null;
  const parts = (audios as string[]).map((b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
