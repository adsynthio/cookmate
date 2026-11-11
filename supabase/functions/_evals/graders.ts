// Graders for the AI evaluations (KIT-133). Pure functions: the runner calls the model, these score the answers.
import type { RescueContext } from "../_shared/rescue.ts";
import { validateModelRescue } from "../_shared/rescue.ts";

export type ExpectedItem = { key: string | null; said?: string; quantity?: number; unit?: string };
export type ParsedItem = { said: string; ingredient_key: string | null; quantity: number | null; unit: string | null };

/**
 * Item F1 for one utterance (11_ai_tasks_and_models.csv: item F1 ≥ 0.9). An expected item with a catalog key matches
 * a parsed item with the same key; one without a key (not in the catalog) matches a parsed item whose "said" contains
 * the expected words. A match whose stated quantity or unit is wrong counts half.
 */
// The same amount in another unit is the same answer: 250 g of ghee is 0.25 kg.
const BASE: Record<string, [string, number]> = { kg: ["g", 1000], g: ["g", 1], l: ["ml", 1000], ml: ["ml", 1] };

function amountMatches(e: ExpectedItem, g: ParsedItem): boolean {
  if (e.quantity === undefined && e.unit === undefined) return true;
  if (e.quantity === undefined) return g.unit === e.unit;
  if (g.quantity === null) return false;
  const want = e.unit && BASE[e.unit] ? [BASE[e.unit]![0], e.quantity * BASE[e.unit]![1]] as const : [e.unit, e.quantity] as const;
  const got = g.unit && BASE[g.unit] ? [BASE[g.unit]![0], g.quantity * BASE[g.unit]![1]] as const : [g.unit, g.quantity] as const;
  return (e.unit === undefined || want[0] === got[0]) && Math.abs(want[1] - got[1]) < 1e-6;
}

export type ItemTotals = { tp: number; got: number; expected: number };

export function itemScore(expected: ExpectedItem[], got: ParsedItem[]): ItemTotals {
  const left = [...got];
  let tp = 0;
  for (const e of expected) {
    const i = left.findIndex((g) =>
      e.key ? g.ingredient_key === e.key : !!e.said && g.said.toLowerCase().includes(e.said.toLowerCase())
    );
    if (i < 0) continue;
    const g = left.splice(i, 1)[0]!;
    tp += amountMatches(e, g) ? 1 : 0.5;
  }
  return { tp, got: got.length, expected: expected.length };
}

/** Micro F1 over all utterances: precision = credit / items parsed, recall = credit / items expected. */
export function f1(t: ItemTotals): number {
  if (t.got === 0 && t.expected === 0) return 1;
  if (t.tp === 0) return 0;
  const precision = t.tp / t.got;
  const recall = t.tp / t.expected;
  return (2 * precision * recall) / (precision + recall);
}

export type RescueExpect = {
  /** The fix must not rely on this ingredient (it may still say it's missing). */
  without?: string;
  /** At least one step must match one of these (case-insensitive regexes), e.g. a real fix for the problem. */
  mentions_any?: string[];
  /** No step may match any of these. */
  never?: string[];
};

/** A rescue answer passes when the function's own validator accepts it and the case's own checks hold. */
export function rescueProblems(out: { steps: string[]; uses: string[] }, ctx: RescueContext, expect: RescueExpect): string[] {
  const problems = validateModelRescue(out, ctx);
  const text = out.steps.join(" \n ");
  if (expect.mentions_any?.length && !expect.mentions_any.some((p) => new RegExp(p, "i").test(text))) {
    problems.push(`mentions none of: ${expect.mentions_any.join(", ")}`);
  }
  for (const p of expect.never ?? []) if (new RegExp(p, "i").test(text)) problems.push(`mentions forbidden: ${p}`);
  if (expect.without && out.uses.some((u) => u.toLowerCase() === expect.without!.toLowerCase())) {
    problems.push(`relies on ${expect.without}, which is missing`);
  }
  return problems;
}

export type Baseline = Record<string, { min: number; last?: number; tolerance?: number }>;

/** Fails a task scoring under its floor, or more than the tolerance below the last accepted score. */
export function regressions(scores: Record<string, number>, baseline: Baseline): string[] {
  const out: string[] = [];
  for (const [task, score] of Object.entries(scores)) {
    const b = baseline[task];
    if (!b) continue;
    if (score < b.min) out.push(`${task}: ${score.toFixed(3)} is under the floor ${b.min}`);
    else if (b.last !== undefined && score < b.last - (b.tolerance ?? 0.03)) {
      out.push(`${task}: ${score.toFixed(3)} is more than ${b.tolerance ?? 0.03} under the last accepted ${b.last}`);
    }
  }
  return out;
}
