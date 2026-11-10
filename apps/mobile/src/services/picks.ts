// Building a pick batch from pantry items, members and recipes with the shared ranking engine (KIT-040/041).
// Mock mode runs this on the device; the suggest-meals Edge Function runs the same ranking on the server.
import { catalog, catalogEntry, catalogIndex } from "@/data/catalog";
import { displayName } from "@/domain/kitchen";
import { localeFromLanguageCode } from "@/domain/onboarding";
import { daysLeft } from "@/domain/pantry";
import { normalise } from "@/domain/pantryParse";
import {
  choosePicks,
  defaultBudget,
  DEFAULT_WEIGHTS,
  interpretCraving,
  rankRecipes,
  reasonFor,
  type Eater,
  type MealSlot,
  type PantryEntry,
  type RankContext,
  type Ranked,
  type Weights,
} from "@/domain/ranking";
import { toRankRecipe, totalTime, type RecipeDoc } from "@/domain/recipes";

import type { Member, PantryItem, Pick, PickBatch, PickInput } from "./types";

export function pantryEntries(items: PantryItem[], today: Date = new Date()): PantryEntry[] {
  return items
    .filter((i) => i.ingredientKey)
    .map((i) => ({
      itemId: i.id,
      key: i.ingredientKey!,
      confidence: i.confidence,
      daysLeft: i.expiryDate ? daysLeft(i.expiryDate, today) : null,
      out: i.stapleLevel === "out",
    }));
}

export const STAPLES = catalog.filter((c) => c.staple).map((c) => c.name);

/** Catalog ingredients named in free text ("kuch paneer wala", "palak"). */
export function findIngredients(text: string): string[] {
  const words = normalise(text).split(" ").filter(Boolean);
  const found: string[] = [];
  for (let len = 3; len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const hit = catalogIndex.get(words.slice(i, i + len).join(" "));
      if (hit && !found.includes(hit.name)) found.push(hit.name);
    }
  }
  return found;
}

export function eatersFrom(members: Member[], whoEating?: string[]): Eater[] {
  const chosen = whoEating?.length ? members.filter((m) => whoEating.includes(m.id)) : members;
  return (chosen.length ? chosen : members).map((m) => ({
    id: m.id,
    name: m.displayName,
    ageGroup: m.ageGroup,
    diet: m.diet,
    spice: m.spice,
  }));
}

export function toPick(r: Ranked, doc: RecipeDoc, ctx: RankContext, input: PickInput, recommendationId: string): Pick {
  const locale = localeFromLanguageCode(input.languageCode) ?? "en";
  const nameOf = (key: string) => displayName(catalogEntry(key), key, locale);
  return {
    recommendationId,
    recipeId: r.recipe.id,
    slug: doc.slug,
    title: doc.title,
    titles: doc.titles,
    reason: reasonFor(r, ctx, locale, nameOf),
    uses: r.match.items.filter((i) => i.entry).map((i) => i.entry!.key),
    missing: r.match.items.filter((i) => i.status === "missing").map((i) => i.key),
    totalTimeMin: totalTime(doc) || null,
    imageUrl: null,
    have: r.match.have,
    total: r.match.total,
    score: r.score,
  };
}

export function buildPicks(args: {
  docs: RecipeDoc[];
  items: PantryItem[];
  members: Member[];
  input: PickInput;
  slot: MealSlot;
  recent?: RankContext["recent"];
  avoid?: string[];
  like?: string[];
  weights?: Weights;
  batchId: string;
  today?: Date;
}): PickBatch {
  const { docs, input, slot } = args;
  const ctx: RankContext = {
    slot,
    eaters: eatersFrom(args.members, input.whoEating),
    pantry: pantryEntries(args.items, args.today),
    staples: STAPLES,
    equipment: null,
    avoid: args.avoid ?? [],
    like: args.like ?? [],
    prefer: [],
    recent: args.recent ?? [],
    craving: interpretCraving(input.craving ?? "", input.chips ?? [], findIngredients),
    timeBudgetMin: defaultBudget(slot),
    weights: args.weights ?? DEFAULT_WEIGHTS,
    focus: input.focus,
  };
  const bySlug = new Map(docs.map((d) => [d.id ?? d.slug, d]));
  const picks = choosePicks(rankRecipes(docs.map(toRankRecipe), ctx)).map((r, i) =>
    toPick(r, bySlug.get(r.recipe.id)!, ctx, input, `${args.batchId}-${i}`),
  );
  return { batchId: args.batchId, mealSlot: slot, hero: picks[0] ?? null, alternates: picks.slice(1) };
}
