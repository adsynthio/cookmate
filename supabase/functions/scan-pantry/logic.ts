// Pure helpers for scan-pantry (no network). Tested with `deno test`.
import { type CatalogIndex, type ParsedItem, parsePantryText } from "../_shared/pantryParse.ts";

/** Photos larger than this (base64 characters, about 3 MB of JPEG) are refused; the app sends about 300 KB. */
export const MAX_IMAGE_CHARS = 4_000_000;

export type ScanBody =
  | { kind: "fridge" | "bill" | "photo"; householdId: string; image: string; mediaType: "image/jpeg" | "image/png" }
  | { kind: "barcode"; householdId: string; code: string };

/** Checks the request body; returns the problem as a short message, or the cleaned body. */
export function readBody(raw: unknown): { ok: true; body: ScanBody } | { ok: false; status: number; error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const householdId = typeof b.household_id === "string" ? b.household_id : "";
  if (!householdId) return { ok: false, status: 400, error: "household_id is required" };
  if (b.kind === "barcode") {
    const code = typeof b.code === "string" ? b.code.replace(/\D/g, "") : "";
    if (code.length < 8 || code.length > 14) return { ok: false, status: 400, error: "a barcode has 8 to 14 digits" };
    return { ok: true, body: { kind: "barcode", householdId, code } };
  }
  if (b.kind !== "fridge" && b.kind !== "bill" && b.kind !== "photo") return { ok: false, status: 400, error: "kind must be photo, fridge, bill or barcode" };
  const image = typeof b.image === "string" ? b.image.replace(/^data:image\/\w+;base64,/, "") : "";
  if (!image) return { ok: false, status: 400, error: "image is required" };
  if (image.length > MAX_IMAGE_CHARS) return { ok: false, status: 413, error: "the photo is too large" };
  const mediaType = b.media_type === "image/png" ? "image/png" : "image/jpeg";
  return { ok: true, body: { kind: b.kind, householdId, image, mediaType } };
}

type ModelItem = {
  said: string;
  ingredient_key: string | null;
  quantity: number | null;
  unit: string | null;
  location_kind: ParsedItem["locationKind"];
  state: ParsedItem["state"];
  confidence: number;
};

/**
 * Model output -> confirm-sheet items: unknown catalog keys become null (and less certain), amounts must be positive,
 * the same food listed twice is merged, and at most 40 items come back.
 */
export function fromModel(items: ModelItem[], known: Set<string>): ParsedItem[] {
  const out = new Map<string, ParsedItem>();
  for (const m of items) {
    const said = m.said.trim().slice(0, 60);
    if (!said) continue;
    const key = m.ingredient_key && known.has(m.ingredient_key) ? m.ingredient_key : null;
    const quantity = typeof m.quantity === "number" && m.quantity > 0 && m.quantity < 10_000 ? m.quantity : null;
    const item: ParsedItem = {
      said,
      ingredientKey: key,
      quantity,
      unit: quantity === null ? null : (m.unit?.trim().toLowerCase() || null),
      locationKind: m.location_kind,
      state: m.state,
      confidence: Math.max(0, Math.min(1, m.confidence)) * (key ? 1 : 0.7),
    };
    const id = key ?? said.toLowerCase();
    const prev = out.get(id);
    if (prev && prev.unit === item.unit && prev.quantity !== null && item.quantity !== null) {
      prev.quantity += item.quantity;
      prev.confidence = Math.min(prev.confidence, item.confidence);
    } else if (!prev) {
      out.set(id, item);
    }
  }
  return [...out.values()].slice(0, 40);
}

export type OffProduct = {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  quantity?: string;
  categories_tags?: string[];
};

/**
 * Open Food Facts product -> one confirm-sheet item. The product name is matched to the catalog with the same rules
 * as typed text ("Tata Sampann Toor Dal" -> toor dal); the pack size ("500 g", "1 kg") becomes the amount.
 * Null when the product has no usable name.
 */
export function fromOpenFoodFacts(p: OffProduct | null | undefined, index: CatalogIndex): ParsedItem | null {
  const name = (p?.product_name_en || p?.product_name || p?.generic_name || "").trim();
  if (!name) return null;
  const [matched] = parsePantryText(name, index);
  const size = /(\d+(?:[.,]\d+)?)\s*(kg|g|gm|gms|l|ltr|ml)\b/i.exec(p?.quantity ?? "");
  const unitMap: Record<string, string> = { gm: "g", gms: "g", ltr: "l" };
  const quantity = size ? Number(size[1]!.replace(",", ".")) : null;
  const unit = size ? (unitMap[size[2]!.toLowerCase()] ?? size[2]!.toLowerCase()) : null;
  return {
    said: name.slice(0, 60),
    ingredientKey: matched?.ingredientKey ?? null,
    quantity,
    unit,
    locationKind: null,
    state: null,
    // A packet that maps to a catalog item is almost certainly right; an unknown product needs a look.
    confidence: matched?.ingredientKey ? 0.9 : 0.5,
  };
}
