// Recipe adaptation (KIT-051, REC-03) and its safety validator. Rules first: the curated variation rules and the
// recipe's own substitutes cover most requests deterministically. The model (adapt-recipe Edge Function) only fills
// gaps the rules can't, and only by swapping an ingredient or rewording an existing step; everything it proposes
// goes through validateAdaptation() before it is saved or shown.
// Pure TypeScript, shared with the Edge Functions by scripts/sync-shared.py.
import type { Diet } from "./ranking.ts";
import { scaleQty, type RecipeDoc, type RecipeIngredientDoc, type RecipeStepDoc } from "./recipes.ts";

export type AdaptRequest = {
  /** Ingredients the cook doesn't have. */
  missing?: string[];
  /** Target spice 1-5 for the whole pot. */
  spice?: number;
  servings?: number;
  /** Equipment the kitchen lacks, e.g. ["pressure_cooker"]. */
  missingEquipment?: string[];
  diet?: Diet;
  maxTimeMin?: number;
};

export type Change = {
  kind: "diet" | "substitute" | "omit" | "equipment" | "spice" | "time" | "servings" | "model";
  /** What the cook should know, from the reviewed rule or a template. */
  note: string;
  step?: number;
  /** True when it came from a culinary-reviewed rule rather than a generic template or the model. */
  reviewed: boolean;
};

export type Adaptation = {
  doc: RecipeDoc;
  changes: Change[];
  changedSteps: number[];
  /** Essential ingredients nothing could replace; the model may try, or the cook needs to buy them. */
  unresolved: string[];
  /** Steps removed by a reviewed rule (1-based numbers in the base recipe). */
  skipped: number[];
};

const DROPPABLE: Record<string, string> = {
  garnish: "Skip the {key} on top.",
  heat: "Leave out the {key}; it will be milder.",
  aromatic: "Leave out the {key}; it will be a little less fragrant.",
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const asList = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);

function addIngredients(doc: RecipeDoc, list: unknown) {
  for (const a of Array.isArray(list) ? list : []) {
    const add = a as { ingredient?: string; qty?: number; unit?: string };
    if (!add.ingredient || doc.ingredients.some((i) => i.ingredient === add.ingredient)) continue;
    doc.ingredients.push({ ingredient: add.ingredient, qty: add.qty ?? 1, unit: add.unit ?? "g", role: "spice" });
  }
}

function omitIngredients(doc: RecipeDoc, keys: string[]) {
  doc.ingredients = doc.ingredients.filter((i) => !keys.includes(i.ingredient));
}

function replaceIngredient(doc: RecipeDoc, from: string, to: string, ratio = 1) {
  const i = doc.ingredients.find((x) => x.ingredient === from);
  if (!i) return;
  i.ingredient = to;
  i.qty = Math.round(i.qty * ratio * 100) / 100;
  delete i.local; // the spoken measure was for the old ingredient
  delete i.substitutes;
}

/** Apply reviewed variation rules and the recipe's own substitutes. Never calls the model. */
export function applyRules(base: RecipeDoc, req: AdaptRequest): Adaptation {
  const doc = clone(base);
  const changes: Change[] = [];
  const changedSteps = new Set<number>();
  const skipped: number[] = [];
  const rules = base.variation_rules ?? [];
  const missing = new Set(req.missing ?? []);
  const unresolved: string[] = [];

  // 1. Diet (jain: no onion/garlic; vegan: no dairy).
  if (req.diet) {
    for (const r of rules.filter((r) => r.type === "diet" && r.condition?.diet === req.diet)) {
      omitIngredients(doc, asList(r.action.omit));
      addIngredients(doc, r.action.add);
      const replace = (r.action.replace ?? {}) as Record<string, string>;
      for (const [from, to] of Object.entries(replace)) replaceIngredient(doc, from, to);
      changes.push({ kind: "diet", note: r.note ?? "", reviewed: true });
    }
  }

  // 2. Missing ingredients: a reviewed substitute rule, else the recipe's own substitutes, else drop it if optional.
  for (const key of missing) {
    const ing = doc.ingredients.find((i) => i.ingredient === key);
    if (!ing) continue;
    const rule = rules.find((r) => r.type === "substitute" && r.condition?.missing === key);
    if (rule && typeof rule.action.use === "string") {
      replaceIngredient(doc, key, rule.action.use, typeof rule.action.qty_ratio === "number" ? rule.action.qty_ratio : 1);
      const at = typeof rule.action.at_step === "number" ? rule.action.at_step : undefined;
      if (at) changedSteps.add(at);
      changes.push({ kind: "substitute", note: rule.note ?? "", step: at, reviewed: true });
      continue;
    }
    const sub = ing.substitutes?.find((s) => !missing.has(s.ingredient));
    if (sub) {
      const note = sub.note ?? "";
      replaceIngredient(doc, key, sub.ingredient, sub.ratio);
      changes.push({ kind: "substitute", note: note || `${sub.ingredient} instead of ${key}`, reviewed: true });
      continue;
    }
    // Things a dish survives without: garnish, chilli heat (it gets milder) and aromatics (a little less fragrant).
    if (ing.optional || DROPPABLE[ing.role]) {
      omitIngredients(doc, [key]);
      changes.push({ kind: "omit", note: (DROPPABLE[ing.role] ?? "Leave out the {key}.").replace("{key}", key), reviewed: false });
      continue;
    }
    unresolved.push(key);
  }

  // 3. Equipment: e.g. no pressure cooker -> boil, with the reviewed note as the instruction.
  for (const eq of req.missingEquipment ?? []) {
    const r = rules.find((x) => x.type === "equipment" && x.condition?.missing_equipment === eq);
    const at = typeof r?.action.at_step === "number" ? r.action.at_step : undefined;
    if (!r || !at || !doc.steps[at - 1]) continue;
    const step = doc.steps[at - 1]!;
    step.text = r.note ?? step.text;
    delete step.whistles;
    if (step.technique === "pressure_cook") delete step.technique;
    if (typeof r.action.minutes === "number") {
      step.minutes = r.action.minutes;
      delete step.seconds;
    }
    doc.equipment = (doc.equipment ?? []).filter((e) => e !== eq);
    changedSteps.add(at);
    changes.push({ kind: "equipment", note: r.note ?? "", step: at, reviewed: true });
  }

  // 4. Spice for the whole pot.
  if (req.spice && req.spice !== base.spice_level) {
    const target = Math.max(1, Math.min(5, Math.round(req.spice)));
    const milder = target < base.spice_level;
    const rule = milder ? rules.find((r) => r.type === "spice") : undefined;
    if (rule && target <= 2) {
      omitIngredients(doc, asList(rule.action.omit));
      for (const [k, f] of Object.entries((rule.action.reduce ?? {}) as Record<string, number>)) {
        const i = doc.ingredients.find((x) => x.ingredient === k);
        if (i) {
          i.qty = Math.round(i.qty * f * 100) / 100;
          delete i.local;
        }
      }
      changes.push({ kind: "spice", note: rule.note ?? "", reviewed: true });
    } else if (target === 1) {
      // "No chilli" means none: leave out everything whose job is heat.
      const heat = doc.ingredients.filter((x) => x.role === "heat").map((x) => x.ingredient);
      omitIngredients(doc, heat);
      changes.push({ kind: "spice", note: heat.length ? `No chilli: leave out the ${heat.join(", ")}.` : "", reviewed: false });
    } else {
      const factor = Math.max(0.25, Math.min(2, target / base.spice_level));
      for (const i of doc.ingredients.filter((x) => x.role === "heat")) {
        i.qty = Math.round(i.qty * factor * 100) / 100;
        delete i.local;
      }
      changes.push({ kind: "spice", note: milder ? "Less chilli than the original." : "More chilli than the original.", reviewed: false });
    }
    doc.spice_level = target;
  }

  // 5. Time: a reviewed rule may drop steps ("plain kadhi without pakoras").
  if (req.maxTimeMin) {
    const r = rules.find((x) => x.type === "omit" && typeof x.condition?.max_time_min === "number" && req.maxTimeMin! <= (x.condition.max_time_min as number));
    const drop = r ? (Array.isArray(r.action.skip_steps) ? (r.action.skip_steps as number[]) : []) : [];
    if (r && drop.length) {
      doc.steps = doc.steps.filter((_, i) => !drop.includes(i + 1));
      skipped.push(...drop);
      changes.push({ kind: "time", note: r.note ?? "", reviewed: true });
    }
  }

  // 6. Servings.
  if (req.servings && req.servings !== base.base_servings) {
    for (const i of doc.ingredients) {
      i.qty = scaleQty(i.qty, base.base_servings, req.servings);
      delete i.local;
    }
    doc.base_servings = req.servings;
    changes.push({ kind: "servings", note: `Quantities for ${req.servings}.`, reviewed: false });
  }

  return { doc, changes, changedSteps: [...changedSteps].sort((a, b) => a - b), unresolved, skipped };
}

// --- model proposals ----------------------------------------------------------------------------------------------

/** What the model may propose: swap an ingredient, reword an existing step. Nothing else. */
export type ModelPlan = {
  replacements: { missing: string; use: string; ratio: number; note: string }[];
  stepEdits: { step: number; text: string }[];
  summary: string;
};

export function applyModelPlan(a: Adaptation, plan: ModelPlan): Adaptation {
  const doc = clone(a.doc);
  const changes = [...a.changes];
  const changed = new Set(a.changedSteps);
  const unresolved = new Set(a.unresolved);
  for (const r of plan.replacements) {
    if (!unresolved.has(r.missing)) continue;
    replaceIngredient(doc, r.missing, r.use, r.ratio);
    unresolved.delete(r.missing);
    changes.push({ kind: "model", note: r.note, reviewed: false });
  }
  for (const e of plan.stepEdits) {
    const s = doc.steps[e.step - 1];
    if (!s) continue;
    s.text = e.text.trim();
    changed.add(e.step);
  }
  return { ...a, doc, changes, changedSteps: [...changed].sort((x, y) => x - y), unresolved: [...unresolved] };
}

// --- validator ----------------------------------------------------------------------------------------------------

export type ValidationContext = {
  /** Is this a catalog ingredient? */
  known: (key: string) => boolean;
  /** Can someone on this diet eat this ingredient? */
  allowed: (diet: Diet, key: string) => boolean;
  diet?: Diet;
};

const UNSAFE = /\b(raw egg|half[- ]cooked|undercook|still pink|slightly pink|skip (the )?(boil|soak)|no need to (boil|cook)|reuse (the )?oil|room temperature overnight)\b/i;

/** Problems with an adaptation; empty means it is safe to show and save. */
export function validateAdaptation(base: RecipeDoc, a: Adaptation, ctx: ValidationContext): string[] {
  const problems: string[] = [];
  const doc = a.doc;
  if (!doc.steps.length) problems.push("no steps left");
  if (!doc.ingredients.length) problems.push("no ingredients left");

  // Steps: same count unless a reviewed rule skipped some.
  if (doc.steps.length !== base.steps.length - a.skipped.length) problems.push("steps were added or removed");

  // Safety notes travel unchanged with the steps that remain. Only reviewed rules can skip steps (applyRules),
  // and skipping one removes its hazard too ("plain kadhi" never heats oil for pakoras).
  const kept = base.steps.map((s, i) => ({ s, n: i + 1 })).filter(({ n }) => !a.skipped.includes(n));
  kept.forEach(({ s }, idx) => {
    const now = doc.steps[idx];
    if (s.safety && now?.safety !== s.safety) problems.push(`safety note changed at step ${idx + 1}`);
  });

  // Cooking time on safety steps may not shrink unless a reviewed equipment rule changed the method.
  const reviewedSteps = new Set(a.changes.filter((c) => c.reviewed && c.step).map((c) => c.step!));
  kept.forEach(({ s, n }, idx) => {
    const now = doc.steps[idx];
    if (!s.safety || !now || reviewedSteps.has(n)) return;
    const before = s.seconds ?? (s.minutes ?? 0) * 60;
    const after = now.seconds ?? (now.minutes ?? 0) * 60;
    if (after < before) problems.push(`less cooking time at step ${n}`);
    if ((s.whistles ?? 0) > (now.whistles ?? 0)) problems.push(`fewer whistles at step ${n}`);
  });

  for (const s of doc.steps) {
    if (!s.text.trim() || s.text.length > 600) problems.push("a step is empty or too long");
    if (UNSAFE.test(s.text)) problems.push(`unsafe instruction: "${s.text.slice(0, 60)}"`);
  }
  for (const i of doc.ingredients) {
    if (!ctx.known(i.ingredient)) problems.push(`unknown ingredient ${i.ingredient}`);
    if (!(i.qty > 0) || !Number.isFinite(i.qty)) problems.push(`bad quantity for ${i.ingredient}`);
    if (ctx.diet && !ctx.allowed(ctx.diet, i.ingredient)) problems.push(`${i.ingredient} doesn't fit a ${ctx.diet} diet`);
  }
  if (a.unresolved.length) problems.push(`nothing replaces ${a.unresolved.join(", ")}`);
  return [...new Set(problems)];
}

/** One line for the screen: the reviewed notes first. */
export function summarise(a: Adaptation): string {
  return a.changes
    .filter((c) => c.note)
    .sort((x, y) => Number(y.reviewed) - Number(x.reviewed))
    .map((c) => c.note)
    .slice(0, 3)
    .join(" ");
}

export type { RecipeIngredientDoc, RecipeStepDoc };

/** Whether one ingredient fits a diet (same rules the content build uses to label dishes). */
export function ingredientFitsDiet(
  diet: Diet,
  entry: { category: string; flags?: string[]; allergens?: string[] } | undefined,
): boolean {
  if (!entry) return false;
  if (diet === "nonveg") return true;
  if (entry.category === "meat" || entry.category === "seafood") return false;
  if (diet === "eggetarian") return true;
  if (entry.category === "egg") return false;
  if (diet === "jain") return !(entry.flags ?? []).includes("jain_avoid");
  if (diet === "vegan") {
    return entry.category !== "dairy" && !(entry.allergens ?? []).includes("milk") && !(entry.flags ?? []).includes("animal");
  }
  return true; // veg
}
