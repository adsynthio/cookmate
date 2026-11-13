// Sprint 13 S7: quiet learning, always with Undo. Learned from what the cook does, never from questions:
//   * usual skips: an ingredient left out of the last two cooks of a dish is left out by default (said once);
//   * familiar dishes: after three cooks, steps show their first sentence, with "Show full steps" one tap away;
//   * a mild share: whoever finds a dish too spicy gets a portion set aside before the chilli goes in.
// Every default can be undone, and an undo sticks. No React, no network.

export type DishHabit = {
  cooks: number;
  /** Ingredients left out, one entry per cook, newest last (kept short). */
  skipped: string[][];
  /** Ingredients the cook put back after we left them out: never dropped again for this dish. */
  keep?: string[];
  /** The cook asked for full steps on this dish. */
  full?: boolean;
};
export type Habits = Record<string, DishHabit>;

const RECENT = 3;
const SKIP_RUN = 2;
const FAMILIAR = 3;

/** One finished cook: what was left out of it (from the finish sheet). */
export function recordCook(h: Habits, dish: string, skipped: string[]): Habits {
  const d = h[dish] ?? { cooks: 0, skipped: [] };
  return { ...h, [dish]: { ...d, cooks: d.cooks + 1, skipped: [...d.skipped, [...new Set(skipped)]].slice(-RECENT) } };
}

/** Ingredients this cook leaves out of this dish: skipped in each of the last two cooks, and not put back. */
export function usualSkips(h: Habits, dish: string): string[] {
  const d = h[dish];
  if (!d || d.skipped.length < SKIP_RUN) return [];
  const last = d.skipped.slice(-SKIP_RUN);
  return last[0]!.filter((k) => last.every((s) => s.includes(k)) && !d.keep?.includes(k));
}

/** Put one back: it stays in this dish from now on. */
export function keepIngredient(h: Habits, dish: string, key: string): Habits {
  const d = h[dish] ?? { cooks: 0, skipped: [] };
  return { ...h, [dish]: { ...d, keep: [...new Set([...(d.keep ?? []), key])] } };
}

export function isFamiliar(h: Habits, dish: string): boolean {
  const d = h[dish];
  return !!d && d.cooks >= FAMILIAR && !d.full;
}

export function setFull(h: Habits, dish: string, full: boolean): Habits {
  const d = h[dish] ?? { cooks: 0, skipped: [] };
  return { ...h, [dish]: { ...d, full } };
}

/** Words that make a sentence matter for safety: a step that says them later is never shortened. */
const SAFETY = /fridge|refrigerat|cover|wash|soap|cooked through|steaming|pink|pressure|hot oil|splash|safe|फ़्रिज|फ्रिज|ढक|धो|साबुन|प्रेशर|dhak|dho|sabun/i;

/** A step in a few words for a dish the cook knows: its first sentence, unless something after it is about safety. */
export function shortStep(text: string): string {
  const parts = text.split(/(?<=[.।!?])\s/);
  const first = (parts[0] ?? text).trim();
  if (parts.slice(1).some((s) => SAFETY.test(s))) return text;
  return first;
}

// --- a mild share ------------------------------------------------------------------------------------------------

const HEAT = /chill?i|mirch|मिर्च|garam masala|गरम मसाला|red chilli|lal mirch/i;

/** The first step that adds chilli: that's where a mild share is set aside. Null when nothing adds heat. */
export function heatStep(steps: { text: string }[]): number | null {
  const i = steps.findIndex((s) => HEAT.test(s.text));
  return i < 0 ? null : i + 1;
}

type Eater = { id: string; displayName: string; spice: number; ageGroup: string };
type SpiceMemory = { memberId: string | null; recipeId: string | null; about: string | null; polarity: number };

/**
 * Who gets a mild share of this dish: adults and teens eating today who said this dish (or food in general) was too
 * spicy, or who like it mild while the dish is hot. Children already get their own branch in family plates.
 */
export function mildShare(dishSpice: number, dishIds: string[], eaters: Eater[], memories: SpiceMemory[]): string[] {
  if (dishSpice < 2) return [];
  return eaters
    .filter((e) => e.ageGroup !== "child")
    .filter((e) => {
      const said = memories.some(
        (m) => m.memberId === e.id && m.about === "spice" && m.polarity < 0 && (m.recipeId === null || dishIds.includes(m.recipeId)),
      );
      return said || (e.spice <= 1 && dishSpice >= 3);
    })
    .map((e) => e.displayName);
}
