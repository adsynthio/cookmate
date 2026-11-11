// Help in the middle of a step (KIT-074 "ask", KIT-075 "I changed something"). Shared by the app and the
// cook-assist Edge Function (copied by scripts/sync-shared.py). No React, no network.
//
// Asking never moves the cook's place. A step's own safety note is always returned with the answer, word for word.
import type { RecipeStepDoc } from "./recipes.ts";
import { SAFETY_PLAYBOOK, UNSAFE, type RescueLocale } from "./rescue.ts";

type L = Record<RescueLocale, string>;

export type Answer = { answer: string; safetyNote: string | null; source: "rules" | "model" };
export type StepNote = { step: number; note: string };
export type ChangeResult = { reply: string; notes: StepNote[]; source: "rules" | "model" };

export const MAX_QUESTION_CHARS = 300;
export const MAX_ANSWER_CHARS = 420;
export const MAX_NOTES = 3;
export const MAX_NOTE_CHARS = 200;

const T = {
  cue: { en: "Here is how to tell: {cue}", hi: "ऐसे पहचानें: {cue}", hinglish: "Aise pehchaanein: {cue}" },
  stepSays: {
    en: "That can't be answered right now. The step says: {text}",
    hi: "अभी इसका जवाब नहीं मिल पाया। स्टेप यह कहता है: {text}",
    hinglish: "Abhi iska jawaab nahi mil paaya. Step yeh kehta hai: {text}",
  },
  noted: {
    en: "Noted. The remaining steps stay as written; taste at the end and adjust.",
    hi: "नोट कर लिया। बाकी स्टेप वैसे ही रहेंगे; आख़िर में चखकर ठीक कर लें।",
    hinglish: "Note kar liya. Baaki steps waise hi rahenge; aakhir mein chakhkar theek kar lein.",
  },
  notedWithNotes: {
    en: "Noted. Later steps now carry a reminder.",
    hi: "नोट कर लिया। आगे के स्टेप में अब याद दिलाने वाली बात जुड़ गई है।",
    hinglish: "Note kar liya. Aage ke steps mein ab reminder jud gaya hai.",
  },
} satisfies Record<string, L>;

const SPOILED = /smell|sour|spoil|slim|mould|mold|rotten|kharab|kharaab|baasi|basi|badbu|खराब|ख़राब|बासी|बदबू|सड़|फफूँद/i;

/** Safety text that goes with any answer on this step: the step's own note, and the spoiled-food line if asked. */
export function answerSafety(step: Pick<RecipeStepDoc, "safety">, question: string, locale: RescueLocale): string | null {
  const parts = [step.safety, SPOILED.test(question) ? SAFETY_PLAYBOOK.spoiled_food[locale] : undefined].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** The answer when no model is available: the step's own cue, or the step again. */
export function fallbackAnswer(step: Pick<RecipeStepDoc, "text" | "cue" | "safety">, question: string, locale: RescueLocale): Answer {
  const answer = step.cue ? T.cue[locale].replace("{cue}", step.cue) : T.stepSays[locale].replace("{text}", step.text);
  return { answer, safetyNote: answerSafety(step, question, locale), source: "rules" };
}

/** Check a model's answer before it is shown. An empty list means it may be used. */
export function validateAnswer(text: string): string[] {
  const problems: string[] = [];
  if (!text.trim()) problems.push("empty answer");
  if (text.length > MAX_ANSWER_CHARS) problems.push(`answer too long (${text.length} chars)`);
  if (UNSAFE.test(text)) problems.push("unsafe instruction");
  return problems;
}

/** Keep only usable notes: for steps still ahead, short, safe, one per step, at most three. */
export function cleanNotes(notes: { step: number; note: string }[], currentStep: number, totalSteps: number): StepNote[] {
  const seen = new Set<number>();
  const out: StepNote[] = [];
  for (const n of notes) {
    const note = typeof n.note === "string" ? n.note.trim() : "";
    if (!Number.isInteger(n.step) || n.step <= currentStep || n.step > totalSteps) continue;
    if (!note || note.length > MAX_NOTE_CHARS || UNSAFE.test(note) || seen.has(n.step)) continue;
    seen.add(n.step);
    out.push({ step: n.step, note });
    if (out.length === MAX_NOTES) break;
  }
  return out;
}

export function changeReply(notes: StepNote[], locale: RescueLocale): string {
  return (notes.length ? T.notedWithNotes : T.noted)[locale];
}

/** Notes recorded on a session (cooking_sessions.modifications) that apply to one step. */
export function notesForStep(modifications: { change: string; notes?: StepNote[] }[], stepNo: number): { change: string; note: string }[] {
  return modifications.flatMap((m) => (m.notes ?? []).filter((n) => n.step === stepNo).map((n) => ({ change: m.change, note: n.note })));
}
