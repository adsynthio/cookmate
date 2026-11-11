// session-bundle logic (KIT-076): which cached step recording this cook would hear for each step, so the phone can
// download them when cooking starts and keep reading steps aloud with no network. The words, the hash and the path
// are the ones tts-cache recorded and the voice agent plays (../tts-cache/logic.ts, voice-agent style.py).
import { cachePath, DEFAULT_VOICE, stepVariants, type StepRow, variantHash } from "../tts-cache/logic.ts";

export type Profile = { verbosity: string; skill_level: string; tts_voice_id: string | null };
export type StepWithNo = StepRow & { step_no: number };
export type AudioRow = { step_id: string; language_code: string; voice_id: string; variant_hash: string; storage_path: string };
export type StepAudio = { step_no: number; path: string };

/** Beginners, and anyone who asked for detail, hear the sensory cue. Mirrors wants_cues() in style.py. */
export function wantsCues(p: Pick<Profile, "verbosity" | "skill_level"> | null): boolean {
  const verbosity = p?.verbosity ?? "normal";
  const skill = p?.skill_level ?? "intermediate";
  if (verbosity === "brief") return false;
  return skill === "beginner" || skill === "intermediate" || verbosity === "detailed";
}

/** Sarvam has no romanised Hindi voice: Hinglish is spoken by the Hindi voice. Mirrors sarvam_language() in metering.py. */
export function audioLanguage(code: string): string {
  if (code.startsWith("hi")) return "hi-IN";
  return code.endsWith("-IN") ? code : "en-IN";
}

/** The words this cook hears for a step: with the cue when they want cues (stepVariants lists that one first). */
export function wordsFor(step: StepRow, cues: boolean): string | null {
  const variants = stepVariants(step);
  if (!variants.length) return null;
  return cues ? variants[0]! : variants[variants.length - 1]!;
}

/** For each step, the recording that matches this cook's words, language and voice; steps with none are left out. */
export async function pickAudio(steps: StepWithNo[], cached: AudioRow[], opts: { languageCode: string; profile: Profile | null }): Promise<StepAudio[]> {
  const language = audioLanguage(opts.languageCode);
  const voice = opts.profile?.tts_voice_id || DEFAULT_VOICE;
  const cues = wantsCues(opts.profile);
  const have = new Map(cached.map((c) => [`${c.step_id}|${c.language_code}|${c.voice_id}|${c.variant_hash}`, c.storage_path]));
  const out: StepAudio[] = [];
  for (const step of [...steps].sort((a, b) => a.step_no - b.step_no)) {
    const words = wordsFor(step, cues);
    if (!words) continue;
    const hash = await variantHash(words);
    const path = have.get(`${step.id}|${language}|${voice}|${hash}`);
    if (path) out.push({ step_no: step.step_no, path });
  }
  return out;
}

export { cachePath };
