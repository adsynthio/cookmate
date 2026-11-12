// Pure helpers for Cook With Me (KIT-070/071/078) and the finish sheet's deduction (KIT-037). No React, no network.
// convertQty / deductionPreview mirror private.convert_qty and complete_cooking_session in the database so mock mode
// and the live backend agree.
import { parseQuantity } from "./kitchen.ts";
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

// --- finish sheet review ---------------------------------------------------------------------------------------------

export type StapleLevel = "full" | "low" | "out";
/** One line of the deduction review as the cook left it: switched on or off, the typed amount, a new staple level. */
export type LineReview = { on: boolean; qty: string; level: StapleLevel | null };
export type Adjustment = { itemId: string; quantity?: number; skip?: boolean; stapleLevel?: StapleLevel };

/**
 * What to send to apply_session_deduction for one reviewed line; null when the preview already says it.
 * A cleared or unreadable amount means "don't touch this item", never "take the suggested amount".
 */
export function adjustmentFor(line: DeductionLine, review: LineReview): Adjustment | null {
  if (!review.on) return { itemId: line.itemId, skip: true };
  if (line.staple) return review.level ? { itemId: line.itemId, stapleLevel: review.level } : null;
  const q = parseQuantity(review.qty);
  if (q === undefined || q === null) return line.quantity === null ? null : { itemId: line.itemId, skip: true };
  return q === line.quantity ? null : { itemId: line.itemId, quantity: q };
}

/**
 * 0.055 kg of onion reads better as 55 g. Returns the line in the smaller unit, plus the factor that turns an amount
 * typed in that unit back into the item's own unit.
 */
export function readableLine(line: DeductionLine): { line: DeductionLine; factor: number } {
  const small = line.unit === "kg" ? "g" : line.unit === "l" ? "ml" : null;
  if (!small || line.quantity === null || line.quantity >= 1) return { line, factor: 1 };
  return { line: { ...line, quantity: Math.round(line.quantity * 1000), unit: small }, factor: 1000 };
}

/** Whether to offer a timer for a step: always when the recipe asks for one, otherwise for waits worth timing. */
export function offersTimer(step: Pick<RecipeStepDoc, "minutes" | "seconds" | "timer" | "whistles">): boolean {
  const sec = stepSeconds(step);
  if (sec === null) return false;
  if (step.timer) return true;
  return !step.whistles && sec >= 120 && sec <= 3 * 60 * 60;
}

/** A deduction amount after a remembered "more" or "less" (KIT-104): whole numbers from 10 up, one decimal below. */
export function rememberedQty(qty: number, factor: number): number {
  const q = qty * factor;
  return q >= 10 ? Math.round(q) : Math.round(q * 10) / 10;
}

/** What to check when a step's timer rings: what it should look like first, else another sense, else the one-line cue. */
export function timerCue(step: Pick<RecipeStepDoc, "cue" | "cues">): string | undefined {
  const c = step.cues;
  return c?.look ?? c?.smell ?? c?.sound ?? c?.touch ?? c?.taste ?? step.cue;
}

/**
 * The timers screen: running timers soonest first (finished ones on top, they need you now), and the recipe's
 * timed steps that have no timer yet, so one can be started from here.
 */
export function timerBoard<T extends Pick<Timer, "endsAt" | "stepNo">>(
  timers: T[],
  steps: Pick<RecipeStepDoc, "minutes" | "seconds">[],
): { timers: T[]; startable: { stepNo: number; seconds: number }[] } {
  const sorted = [...timers].sort((a, b) => a.endsAt - b.endsAt);
  const taken = new Set(timers.map((x) => x.stepNo));
  const startable = steps.flatMap((s, i) => {
    const sec = stepSeconds(s);
    return sec && !taken.has(i + 1) ? [{ stepNo: i + 1, seconds: sec }] : [];
  });
  return { timers: sorted, startable };
}
