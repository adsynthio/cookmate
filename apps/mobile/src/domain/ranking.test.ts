// Unit tests for each ranking factor (KIT-041) and the pick reasons.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  choosePicks,
  coverageFactor,
  DEFAULT_WEIGHTS,
  dietAllows,
  equipmentFactor,
  excludedBecause,
  interpretCraving,
  NO_CRAVING,
  noveltyFactor,
  pantryCheck,
  pantryMatch,
  rankRecipes,
  shoppingTier,
  reasonFor,
  slotForHour,
  tasteFactor,
  timeFactor,
  useSoonFactor,
  type PantryEntry,
  type RankContext,
  type RankRecipe,
} from "./ranking.ts";

const recipe = (over: Partial<RankRecipe> & Pick<RankRecipe, "id">): RankRecipe => ({
  slug: over.id,
  title: over.id,
  course: "main",
  diet: "veg",
  timeMin: 30,
  spiceLevel: 2,
  equipment: [],
  tags: [],
  flavor: {},
  ingredients: [],
  equipmentFallbacks: [],
  ...over,
});
const ing = (key: string, extra: Partial<RankRecipe["ingredients"][number]> = {}) => ({
  key,
  optional: false,
  role: "vegetable",
  substitutes: [],
  ...extra,
});
const item = (key: string, extra: Partial<PantryEntry> = {}): PantryEntry => ({
  itemId: `i-${key}`,
  key,
  confidence: 0.95,
  daysLeft: null,
  out: false,
  ...extra,
});
const ctx = (over: Partial<RankContext> = {}): RankContext => ({
  slot: "dinner",
  eaters: [{ id: "m1", name: "Sunita", ageGroup: "adult", diet: "veg", spice: 3 }],
  pantry: [],
  staples: ["salt", "refined oil"],
  equipment: null,
  avoid: [],
  like: [],
  prefer: [],
  recent: [],
  craving: NO_CRAVING,
  timeBudgetMin: 45,
  weights: DEFAULT_WEIGHTS,
  ...over,
});

const palakPaneer = recipe({
  id: "palak-paneer",
  ingredients: [ing("spinach", { role: "base" }), ing("paneer", { role: "protein" }), ing("salt", { role: "spice" }), ing("cream", { optional: true })],
});

test("diet: each eater's diet limits what the table can eat", () => {
  assert.equal(dietAllows("nonveg", "veg"), true);
  assert.equal(dietAllows("veg", "eggetarian"), false);
  assert.equal(dietAllows("eggetarian", "eggetarian"), true);
  assert.equal(dietAllows("jain", "veg"), false);
  assert.equal(dietAllows("vegan", "veg"), false);
  const egg = recipe({ id: "egg-bhurji", diet: "eggetarian" });
  assert.equal(excludedBecause(egg, ctx()), "diet");
  assert.equal(excludedBecause(egg, ctx({ eaters: [{ id: "a", name: "A", ageGroup: "adult", diet: "nonveg", spice: 3 }] })), null);
});

test("coverage counts confident items, staples and substitutes; optional items don't count", () => {
  const m = pantryMatch(palakPaneer, [item("spinach"), item("paneer", { confidence: 0.4 })], ["salt"]);
  assert.equal(m.total, 3);
  assert.deepEqual(m.items.map((i) => i.status), ["have", "missing", "assumed"]);
  assert.equal(m.have, 2);
  assert.equal(Math.round(coverageFactor(m) * 100), 40); // ((1 + 0 + 0.9) / 3)^2
  const out = pantryMatch(palakPaneer, [item("salt", { out: true })], ["salt"]);
  assert.equal(out.items.find((i) => i.key === "salt")?.status, "missing");
  const sub = recipe({ id: "s", ingredients: [ing("dry mango powder", { substitutes: ["lemon"] })] });
  assert.equal(pantryMatch(sub, [item("lemon")], []).items[0]?.status, "substitute");
});

test("use soon: today counts fully, three days out a quarter, capped at 1", () => {
  const today = pantryMatch(palakPaneer, [item("spinach", { daysLeft: 0 })], []);
  assert.equal(useSoonFactor(today), 1);
  const later = pantryMatch(palakPaneer, [item("spinach", { daysLeft: 3 })], []);
  assert.equal(useSoonFactor(later), 0.25);
  const fine = pantryMatch(palakPaneer, [item("spinach", { daysLeft: 9 })], []);
  assert.equal(useSoonFactor(fine), 0);
});

test("taste: the mildest eater sets the spice, likes add a little", () => {
  const hot = recipe({ id: "hot", spiceLevel: 5 });
  const child = { id: "c", name: "Aarav", ageGroup: "child" as const, diet: "veg" as const, spice: 1 };
  assert.ok(tasteFactor(hot, ctx()) < 0.4);
  assert.equal(tasteFactor(hot, ctx({ eaters: [child] })), 0);
  assert.equal(tasteFactor(recipe({ id: "m", spiceLevel: 3 }), ctx()), 1);
  const liked = tasteFactor(recipe({ id: "l", spiceLevel: 1, ingredients: [ing("garlic")] }), ctx({ like: ["garlic"] }));
  assert.ok(liked > tasteFactor(recipe({ id: "l2", spiceLevel: 1 }), ctx()));
  const spicyCraving = ctx({ craving: { ...NO_CRAVING, spiceDelta: 1 } });
  assert.ok(tasteFactor(recipe({ id: "s4", spiceLevel: 4 }), spicyCraving) > tasteFactor(recipe({ id: "s4b", spiceLevel: 4 }), ctx()));
});

test("novelty: nothing repeated within 3 days", () => {
  const r = recipe({ id: "rajma" });
  assert.equal(noveltyFactor(r, [{ recipeId: "rajma", daysAgo: 1 }]), 0);
  assert.equal(noveltyFactor(r, [{ recipeId: "rajma", daysAgo: 5 }]), 0.5);
  assert.equal(noveltyFactor(r, [{ recipeId: "rajma", daysAgo: 12 }]), 1);
  assert.equal(noveltyFactor(r, []), 1);
});

test("time: within budget is full marks, double the budget is zero", () => {
  assert.equal(timeFactor(recipe({ id: "t", timeMin: 30 }), 45), 1);
  assert.equal(timeFactor(recipe({ id: "t", timeMin: 90 }), 45), 0);
  assert.equal(timeFactor(recipe({ id: "t", timeMin: 60 }), 40), 0.5);
});

test("equipment: unknown kitchens are assumed normal; fallbacks rescue a missing cooker", () => {
  const r = recipe({ id: "e", equipment: ["pressure_cooker", "kadai"], equipmentFallbacks: ["pressure_cooker"] });
  assert.equal(equipmentFactor(r, null), 1);
  assert.equal(equipmentFactor(r, ["pressure_cooker", "kadai"]), 1);
  assert.equal(equipmentFactor(r, ["kadai"]), 0.7);
  assert.equal(equipmentFactor(r, ["tawa"]), 0);
  assert.equal(excludedBecause(r, ctx({ equipment: ["tawa"] })), "equipment");
});

test("slot and craving filters", () => {
  const poha = recipe({ id: "poha", course: "breakfast", timeMin: 20, tags: ["light"] });
  assert.equal(excludedBecause(poha, ctx()), "course");
  assert.equal(excludedBecause(poha, ctx({ slot: "breakfast" })), null);
  const slow = recipe({ id: "rajma", timeMin: 60 });
  assert.equal(excludedBecause(slow, ctx({ craving: { ...NO_CRAVING, maxTimeMin: 20 } })), "time");
  assert.equal(excludedBecause(palakPaneer, ctx({ avoid: ["paneer"] })), "avoid");
  assert.equal(excludedBecause(palakPaneer, ctx({ avoid: ["cream"] })), null); // optional
  assert.equal(slotForHour(8), "breakfast");
  assert.equal(slotForHour(13), "lunch");
  assert.equal(slotForHour(16), "snack");
  assert.equal(slotForHour(20), "dinner");
  assert.equal(slotForHour(2), "dinner");
});

test("craving: chips and free text in three languages", () => {
  assert.deepEqual(interpretCraving("", ["under_20", "light"]).tags, ["quick", "light"]);
  assert.equal(interpretCraving("", ["under_20"]).maxTimeMin, 20);
  assert.deepEqual(interpretCraving("kuch halka aur jaldi").tags, ["quick", "light"]);
  assert.deepEqual(interpretCraving("कुछ हल्का").tags, ["light"]);
  assert.equal(interpretCraving("something spicy").spiceDelta, 1);
  assert.equal(interpretCraving("nashta").course, "breakfast");
  assert.equal(interpretCraving("in 15 minutes").maxTimeMin, 15);
  assert.deepEqual(interpretCraving("paneer wala", [], (t) => (t.includes("paneer") ? ["paneer"] : [])).ingredients, ["paneer"]);
});

test("ranking prefers what uses spoiling food and avoids repeating the same main ingredient", () => {
  const recipes = [
    palakPaneer,
    recipe({ id: "dal", ingredients: [ing("toor dal", { role: "base" }), ing("salt")] }),
    recipe({ id: "paneer-bhurji", ingredients: [ing("paneer", { role: "protein" }), ing("onion")] }),
    recipe({ id: "aloo", ingredients: [ing("potato", { role: "base" }), ing("salt")] }),
  ];
  const c = ctx({ pantry: [item("spinach", { daysLeft: 0 }), item("paneer"), item("toor dal"), item("potato")] });
  const ranked = rankRecipes(recipes, c);
  assert.equal(ranked[0]?.recipe.id, "palak-paneer");
  const picks = choosePicks(ranked);
  assert.equal(picks.length, 3);
  assert.equal(new Set(picks.map((p) => p.recipe.id)).size, 3);
  // With focus on potato, only potato dishes remain.
  const focused = rankRecipes(recipes, { ...c, focus: ["potato"] });
  assert.deepEqual(focused.map((r) => r.recipe.id), ["aloo"]);
  // Focus that nothing uses falls back to all.
  assert.equal(rankRecipes(recipes, { ...c, focus: ["okra"] }).length, 4);
});

test("reasons cite real factors and stay short", () => {
  const c = ctx({
    pantry: [item("spinach", { daysLeft: 1 }), item("paneer")],
    eaters: [
      { id: "m1", name: "Sunita", ageGroup: "adult", diet: "veg", spice: 3 },
      { id: "c1", name: "Aarav", ageGroup: "child", diet: "veg", spice: 1 },
    ],
  });
  const [top] = rankRecipes([palakPaneer], c);
  const names: Record<string, string> = { spinach: "palak" };
  const en = reasonFor(top!, c, "en", (k) => names[k] ?? k);
  assert.match(en, /palak/);
  assert.ok(en.length <= 90, en);
  assert.match(reasonFor(top!, c, "hi", (k) => names[k] ?? k), /palak/);
  const bare = rankRecipes([recipe({ id: "x", spiceLevel: 4, timeMin: 40, ingredients: [ing("okra")] })], ctx())[0]!;
  assert.equal(reasonFor(bare, ctx(), "en", (k) => k), "A good fit for today");
});

test("reasons: a liked ingredient is named (KIT-104)", () => {
  const c = ctx({ like: ["okra"] });
  const [top] = rankRecipes([recipe({ id: "y", spiceLevel: 2, timeMin: 40, ingredients: [ing("okra")] })], c);
  assert.equal(reasonFor(top!, c, "en", (k) => (k === "okra" ? "bhindi" : k)), "Has bhindi, a favourite here");
});

test("pantry check: asks only about an unsure item whose answer changes the hero pick (KIT-035)", () => {
  const dal = recipe({ id: "dal", ingredients: [ing("toor dal", { role: "base" }), ing("salt", { role: "spice" })] });
  const sure = [item("spinach"), item("toor dal")];
  // Paneer at 0.45: unsure. With paneer, palak paneer wins; without it, dal does.
  const c = ctx({ pantry: [...sure, item("paneer", { confidence: 0.45 })] });
  const check = pantryCheck([palakPaneer, dal], c);
  assert.deepEqual(check, { itemId: "i-paneer", key: "paneer", ifYes: "palak-paneer", ifNo: "dal" });

  // Confident or barely-known items are never asked about.
  assert.equal(pantryCheck([palakPaneer, dal], ctx({ pantry: [...sure, item("paneer", { confidence: 0.9 })] })), null);
  assert.equal(pantryCheck([palakPaneer, dal], ctx({ pantry: [...sure, item("paneer", { confidence: 0.1 })] })), null);
  // An unsure item that no answer would change isn't worth a question.
  const onlyDal = ctx({ pantry: [item("toor dal"), item("paneer", { confidence: 0.45 })] });
  assert.equal(pantryCheck([dal], onlyDal), null);
  // Unsure item no recipe uses: no question.
  assert.equal(pantryCheck([palakPaneer, dal], ctx({ pantry: [...sure, item("paneer"), item("karela", { confidence: 0.45 })] })), null);
});

test("pantry check: the item that spoils first is asked about first", () => {
  const dal = recipe({ id: "dal", ingredients: [ing("toor dal", { role: "base" })] });
  const matarPaneer = recipe({ id: "matar-paneer", ingredients: [ing("peas", { role: "base" }), ing("paneer", { role: "protein" })] });
  const c = ctx({
    pantry: [item("toor dal"), item("spinach", { confidence: 0.5, daysLeft: 5 }), item("paneer", { confidence: 0.55, daysLeft: 1 }), item("peas")],
  });
  const check = pantryCheck([palakPaneer, matarPaneer, dal], c);
  assert.equal(check?.key, "paneer");
});

test("dishes you can make now come before dishes that need shopping, whatever else scores higher", () => {
  const ready = recipe({ id: "aloo", ingredients: [ing("potato", { role: "base" }), ing("salt", { role: "spice" })] });
  // Loved, quick and matching the craving, but two things short.
  const short = recipe({ id: "palak", tags: ["comforting"], ingredients: [ing("spinach", { role: "base" }), ing("paneer", { role: "protein" }), ing("potato")] });
  const ranked = rankRecipes([short, ready], ctx({ pantry: [item("potato")], like: ["spinach", "paneer"] }));
  assert.deepEqual(ranked.map((r) => r.recipe.id), ["aloo", "palak"]);
  assert.equal(shoppingTier(ranked[0]!.match), 0);
  assert.equal(shoppingTier(ranked[1]!.match), 1);
});
