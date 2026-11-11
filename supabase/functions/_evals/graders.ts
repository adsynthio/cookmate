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
    const qtyOk = e.quantity === undefined || (g.quantity !== null && Math.abs(g.quantity - e.quantity) < 1e-6);
    const unitOk = e.unit === undefined || g.unit === e.unit;
    tp += qtyOk && unitOk ? 1 : 0.5;
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
