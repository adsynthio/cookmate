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

/**
 * An Indian mobile number in E.164 (+91 and ten digits starting 6-9), from what people type:
 * "98765 43210", "+91-98765-43210", "098765 43210". Anything else is null.
 */
export function indianMobile(input: string): string | null {
  let digits = input.replace(/[^\d]/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/** "+91 98••• ••210": enough to recognise your own number on a shared screen. */
export function maskPhone(e164: string): string {
  const d = e164.replace(/^\+91/, "");
  return d.length === 10 ? `+91 ${d.slice(0, 2)}••• ••${d.slice(7)}` : e164;
}
