// Pure helpers for parse-inventory (no network). Tested with `deno test`.
import { buildIndex, type CatalogEntry, normalise, type ParsedItem } from "../_shared/pantryParse.ts";

export type CatalogRow = {
  id: string;
  canonical_name: string;
  names: { hi?: string; "hi-Latn"?: string } | null;
  aliases: string[] | null;
  default_location_kind: CatalogEntry["location"] | null;
  default_unit: string | null;
  is_staple: boolean;
};

export type ResponseItem = {
  name: string;
  ingredient_id: string | null;
  ingredient_key: string | null;
  quantity: number | null;
  unit: string | null;
  location_kind: CatalogEntry["location"] | null;
  state: ParsedItem["state"];
  confidence: number;
  /** The cook said it ran out: the app marks it finished and offers the list instead of adding it. */
  out?: boolean;
};

export function toCatalog(rows: CatalogRow[]): CatalogEntry[] {
  return rows.map((r) => ({
    name: r.canonical_name,
    hi: r.names?.hi,
    latn: r.names?.["hi-Latn"],
    aliases: r.aliases ?? [],
    location: r.default_location_kind ?? undefined,
    unit: r.default_unit ?? undefined,
    staple: r.is_staple,
  }));
}

/**
 * Catalog hints for the model, one line per ingredient, sorted so the text (and the prompt cache) is stable.
 * Format: canonical | hinglish | hindi | aliases
 */
export function catalogHints(catalog: CatalogEntry[]): string {
  return [...catalog]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => [e.name, e.latn ?? "", e.hi ?? "", (e.aliases ?? []).join(", ")].join(" | "))
    .join("\n");
}

/**
 * Guardrail "never invent items not mentioned" (11_ai_tasks_and_models.csv): keep a model item only if some word
 * of what it says was said, or one of its catalog names appears in the text.
 */
export function wasMentioned(text: string, said: string, entry: CatalogEntry | undefined): boolean {
  const spoken = ` ${normalise(text)} `;
  const words = normalise(said).split(" ").filter((w) => w.length >= 2);
  if (words.some((w) => spoken.includes(` ${w} `) || spoken.includes(w))) return true;
  if (!entry) return false;
  return [entry.name, entry.latn, entry.hi, ...(entry.aliases ?? [])]
    .filter((n): n is string => !!n)
    .some((n) => spoken.includes(normalise(n)));
}

export function toResponseItem(item: ParsedItem, ids: Map<string, string>): ResponseItem {
  return {
    name: item.said,
    ingredient_id: item.ingredientKey ? (ids.get(item.ingredientKey) ?? null) : null,
    ingredient_key: item.ingredientKey,
    quantity: item.quantity,
    unit: item.unit,
    location_kind: item.locationKind,
    state: item.state,
    confidence: Math.round(item.confidence * 100) / 100,
    ...(item.out ? { out: true } : {}),
  };
}

export { buildIndex };
