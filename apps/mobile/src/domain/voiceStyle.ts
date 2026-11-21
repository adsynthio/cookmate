// How Cookmate talks to this cook on the phone (KIT-068): the same rules as the voice agent
// (services/voice-agent/cookmate_voice/style.py), so a step read aloud in the app and by the agent says the same
// words. A beginner hears the sensory cue; an expert hears just the instruction; the safety note is always read.
// No React, no network.

export type Pace = "slow" | "normal" | "fast";
export type Verbosity = "detailed" | "normal" | "brief";
export type Skill = "beginner" | "intermediate" | "confident" | "expert";
export type Units = "metric" | "local" | "mixed";

export type VoiceProfile = { pace: Pace; verbosity: Verbosity; skill: Skill; units: Units };

export const DEFAULT_PROFILE: VoiceProfile = { pace: "normal", verbosity: "normal", skill: "intermediate", units: "local" };
export const PACES: Pace[] = ["slow", "normal", "fast"];
export const VERBOSITIES: Verbosity[] = ["detailed", "normal", "brief"];
export const SKILLS: Skill[] = ["beginner", "intermediate", "confident", "expert"];
export const UNITS: Units[] = ["local", "metric", "mixed"];

/** expo-speech rate for each pace (1 is the platform's normal; the app has always read a touch slower). */
export function speechRate(pace: Pace): number {
  return pace === "slow" ? 0.8 : pace === "fast" ? 1.1 : 0.95;
}

export function wantsCues(p: Pick<VoiceProfile, "verbosity" | "skill">): boolean {
  if (p.verbosity === "brief") return false;
  return p.skill === "beginner" || p.skill === "intermediate" || p.verbosity === "detailed";
}

const sentence = (s: string) => (/[.!?।]$/.test(s) ? s : `${s}.`);

/** The words for one step: instruction, the cue when this cook wants cues, the safety note always. */
export function stepWords(step: { text: string; cue?: string | null; safety?: string | null }, p: Pick<VoiceProfile, "verbosity" | "skill">): string {
  return [step.text, wantsCues(p) ? step.cue : null, step.safety]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .map(sentence)
    .join(" ");
}

