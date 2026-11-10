// Pure helpers for Cook With Me (KIT-070/071/078) and the finish sheet's deduction (KIT-037). No React, no network.
// convertQty / deductionPreview mirror private.convert_qty and complete_cooking_session in the database so mock mode
// and the live backend agree.
import type { RecipeDoc, RecipeStepDoc } from "./recipes.ts";

export type Timer = { id: string; label: string; stepNo: number; durationSec: number; endsAt: number };

/** Seconds for a step's timer, or null when the step has no time. */
export function stepSeconds(step: Pick<RecipeStepDoc, "minutes" | "seconds">): number | null {
  if (step.seconds) return step.seconds;
  if (step.minutes) return step.minutes * 60;
  return null;
}

export function remaining(t: Pick<Timer, "endsAt">, now: number): number {
  return Math.max(0, Math.ceil((t.endsAt - now) / 1000));
}

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** Whistle counter (KIT-078): returns the new count and whether the target was reached with this whistle. */
export function countWhistle(count: number, target: number): { count: number; reached: boolean } {
  const next = Math.min(target, count + 1);
  return { count: next, reached: next >= target && count < target };
}

// --- units (same rules as private.to_grams / from_grams / convert_qty) -------------------------------------------

type Measures = Record<string, number> | undefined;

function toGrams(q: number, unit: string, m: Measures): number | null {
  if (unit === "g" || unit === "ml") return q;
  if (unit === "kg" || unit === "l") return q * 1000;
  return m?.[unit] ? q * m[unit]! : null;
}

function fromGrams(g: number, unit: string, m: Measures): number | null {
  if (unit === "g" || unit === "ml") return g;
  if (unit === "kg" || unit === "l") return g / 1000;
  return m?.[unit] ? g / m[unit]! : null;
}

export function convertQty(q: number, from: string, to: string, m: Measures): number | null {
  if (from === to) return q;
  const g = toGrams(q, from, m);
  if (g === null) return null;
  const out = fromGrams(g, to, m);
  return out === null ? null : Math.round(out * 1000) / 1000;
}

// --- deduction preview ----------------------------------------------------------------------------------------------

export type PantryLine = {
  id: string;
  ingredientKey: string | null;
  quantity: number | null;
  unit: string | null;
  stapleLevel: string | null;
  expiryDate: string | null;
};

export type DeductionLine = {
  itemId: string;
  ingredient: string;
  /** Amount to take off, in the item's unit; null for staples or when units can't be compared. */
  quantity: number | null;
  unit: string | null;
  currentQuantity: number | null;
  staple: boolean;
};

export function deductionPreview(
  doc: Pick<RecipeDoc, "ingredients" | "base_servings">,
  servings: number,
  pantry: PantryLine[],
  measuresOf: (key: string) => Measures,
): DeductionLine[] {
  const needed = new Map<string, { qty: number; unit: string }>();
  for (const i of doc.ingredients) {
    if (i.optional) continue;
    const n = needed.get(i.ingredient);
    const qty = (i.qty * servings) / Math.max(doc.base_servings, 1);
    needed.set(i.ingredient, { qty: (n?.qty ?? 0) + qty, unit: n?.unit ?? i.unit });
  }
  const lines: DeductionLine[] = [];
  for (const [key, need] of needed) {
    const item = pantry
      .filter((p) => p.ingredientKey === key)
      .sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"))[0];
    if (!item) continue;
    const staple = item.stapleLevel !== null;
    const converted = convertQty(need.qty, need.unit, item.unit ?? need.unit, measuresOf(key));
    lines.push({
      itemId: item.id,
      ingredient: key,
      quantity: staple || item.quantity === null || converted === null ? null : Math.min(item.quantity, converted),
      unit: item.unit ?? need.unit,
      currentQuantity: item.quantity,
      staple,
    });
  }
  return lines.sort((a, b) => a.ingredient.localeCompare(b.ingredient));
}
