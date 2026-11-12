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
  pantryCheck,
  rankRecipes,
  reasonFor,
  type Eater,
  type MealSlot,
  type PantryCheck,
  type PantryEntry,
  type RankContext,
  type Ranked,
  type Weights,
} from "@/domain/ranking";
import { toRankRecipe, totalTime, type RecipeDoc } from "@/domain/recipes";

import type { Member, PantryItem, PantryQuestion, Pick, PickBatch, PickInput } from "./types";

export function pantryEntries(items: PantryItem[], today: Date = new Date()): PantryEntry[] {
  return items
    // Homemade things the catalog doesn't know ("hari chutney") match by name, so an invented dish that uses
    // them shows them as in the kitchen (KIT-056). Catalog recipes never name them, so ranking is unchanged.
    .filter((i) => i.ingredientKey || i.state !== "raw")
    .map((i) => ({
      itemId: i.id,
      key: i.ingredientKey ?? i.name.trim().toLowerCase(),
      confidence: i.confidence,
      daysLeft: i.expiryDate ? daysLeft(i.expiryDate, today) : null,
      out: i.stapleLevel === "out",
    }));
}

/** Cooked food still good to eat ("leftover kadhi"): the same dish is not picked again. */
export function cookedNames(items: PantryItem[], today: Date = new Date()): string[] {
  return items
    .filter((i) => (i.state === "leftover" || i.state === "cooked") && (!i.expiryDate || daysLeft(i.expiryDate, today) >= 0))
    .map((i) => i.name);
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
  reactions?: RankContext["reactions"];
  /** Calendar preferences for today (KIT-144). */
  prefer?: string[];
  weights?: Weights;
  batchId: string;
  today?: Date;
  /** KIT-035: given the proposed check (or null), the item to ask about today, if any (the daily cap lives there). */
  askCheck?: (proposed: PantryCheck | null) => string | null;
}): PickBatch {
  const { docs, input, slot } = args;
  const ctx: RankContext = {
    slot,
    eaters: eatersFrom(args.members, input.whoEating),
    pantry: pantryEntries(args.items, args.today),
    alreadyCooked: cookedNames(args.items, args.today),
    staples: STAPLES,
    equipment: null,
    avoid: args.avoid ?? [],
    like: args.like ?? [],
    reactions: args.reactions ?? [],
    prefer: args.prefer ?? [],
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
  let check: PantryQuestion | null = null;
  if (args.askCheck) {
    const ordinary = !input.focus?.length && !ctx.craving.tags.length && !ctx.craving.ingredients.length;
    const proposed = ordinary ? pantryCheck(docs.map(toRankRecipe), ctx) : null;
    const itemId = args.askCheck(proposed);
    const item = itemId ? args.items.find((i) => i.id === itemId) : undefined;
    if (item) {
      const locale = localeFromLanguageCode(input.languageCode) ?? "en";
      const titleOf = (id?: string) => (id ? bySlug.get(id)?.title ?? null : null);
      const same = proposed?.itemId === itemId;
      check = {
        itemId: item.id,
        name: displayName(item.ingredientKey ? catalogEntry(item.ingredientKey) : undefined, item.name, locale),
        ifYes: same ? titleOf(proposed!.ifYes) : null,
        ifNo: same ? titleOf(proposed!.ifNo) : null,
      };
    }
  }
  return { batchId: args.batchId, mealSlot: slot, hero: picks[0] ?? null, alternates: picks.slice(1), check };
}
