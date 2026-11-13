// Pure helpers for family-recipe (F2). Tested with `deno test`.
import { looksLikeInstructions } from "../_shared/recipeSafety.ts";

export const MIN_TELLING = 20;
export const MAX_TELLING = 3000;

/** The family's telling of a recipe, cleaned; null when it is too short, too long or reads as instructions to an AI. */
export function cleanTelling(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < MIN_TELLING || text.length > MAX_TELLING) return null;
  if (looksLikeInstructions(text)) return null;
  return text;
}

/** Whose recipe it is ("Nani", "Mummy"): a short name in any script, or null. */
export function cleanOwner(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > 30 || !/^[\p{L}\p{M} '.-]+$/u.test(name) || looksLikeInstructions(name)) return null;
  return name;
}

/** The model's lists for the cook, trimmed: at most three questions and the safety steps it added. */
export function shortList(items: unknown, max: number): string[] {
  if (!Array.isArray(items)) return [];
  return items.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 200)).filter((x) => x && !looksLikeInstructions(x)).slice(0, max);
}
