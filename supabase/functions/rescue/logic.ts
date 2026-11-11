// Pure helpers for rescue (no network). Tested with `deno test`.
import catalogJson from "../_shared/catalog.json" with { type: "json" };
import type { RecipeDoc } from "../_shared/recipes.ts";
import { catalogLookup, isProblem, type Problem, type RescueContext, type RescueLocale } from "../_shared/rescue.ts";

type CatalogRow = { name: string; hi?: string; latn?: string; category?: string };
export const cat = catalogLookup(catalogJson as CatalogRow[]);
const known = new Set((catalogJson as CatalogRow[]).map((c) => c.name));

/** Items the household is confident about: the same bar the picks use (KIT-036). */
export const CONFIDENT = 0.5;

export function localeFor(languageCode: string | undefined): RescueLocale {
  if (!languageCode) return "en";
  if (languageCode.startsWith("hi-Latn") || languageCode === "hinglish") return "hinglish";
  return languageCode.startsWith("hi") ? "hi" : "en";
}

export const LANGUAGE_NAME: Record<RescueLocale, string> = {
  en: "simple English",
  hi: "simple Hindi in Devanagari script",
  hinglish: "Hinglish (everyday Hindi written in Latin letters)",
};

export type PantryRow = { confidence: number | null; staple_level: string | null; ingredients: { canonical_name: string } | null };

/** Canonical names of what is confidently in the kitchen. A staple marked Out is not there. */
export function confidentPantry(rows: PantryRow[]): string[] {
  const names = rows
    .filter((r) => r.ingredients && (r.staple_level ? r.staple_level !== "out" : (r.confidence ?? 0) >= CONFIDENT))
    .map((r) => r.ingredients!.canonical_name);
  return [...new Set(names)];
}

export type Body = { session_id?: string; problem?: string; details?: string; missing?: string; language_code?: string; channel?: string };

export function parseBody(body: Body): { sessionId: string; problem: Problem; details?: string; missing?: string; channel: "touch" | "voice" } | { error: string } {
  if (!body.session_id) return { error: "session_id is required" };
  if (!isProblem(body.problem)) return { error: "unknown problem" };
  const details = typeof body.details === "string" ? body.details.trim().slice(0, 300) || undefined : undefined;
  const missing = typeof body.missing === "string" && known.has(body.missing) ? body.missing : undefined;
  return { sessionId: body.session_id, problem: body.problem, details, missing, channel: body.channel === "voice" ? "voice" : "touch" };
}

export function contextFor(doc: Pick<RecipeDoc, "ingredients" | "steps">, pantry: string[], missing?: string, details?: string): RescueContext {
  return {
    ingredients: doc.ingredients,
    techniques: doc.steps.map((s) => s.technique),
    pantry: missing ? pantry.filter((p) => p !== missing) : pantry,
    missing,
    details,
  };
}
