import { assertEquals } from "jsr:@std/assert@1";

import { NO_CRAVING } from "../_shared/ranking.ts";
import {
  acceptReason,
  daysBetween,
  eatersFromRows,
  localDate,
  localeFor,
  mergeCraving,
  pantryFromRows,
  prefsFromMemories,
  recentFrom,
  weightsFrom,
  excludedRecipes,
} from "./logic.ts";

Deno.test("dates in the household's timezone", () => {
  assertEquals(localDate(new Date("2026-11-10T20:00:00Z"), "Asia/Kolkata"), "2026-11-11");
  assertEquals(localDate(new Date("2026-11-10T10:00:00Z"), "Bad/Zone"), "2026-11-10");
  assertEquals(daysBetween("2026-11-10", "2026-11-13"), 3);
  assertEquals(localeFor("hi-Latn-IN"), "hinglish");
  assertEquals(localeFor("hi-IN"), "hi");
  assertEquals(localeFor(null), "en");
});

Deno.test("pantry rows become ranking entries; uncatalogued items are skipped", () => {
  const p = pantryFromRows([
    { id: "a", confidence: 0.9, expiry_date: "2026-11-11", staple_level: null, ingredients: { canonical_name: "spinach", names: null } },
    { id: "b", confidence: 0.9, expiry_date: null, staple_level: "out", ingredients: { canonical_name: "salt", names: null } },
    { id: "c", confidence: 0.9, expiry_date: null, staple_level: null, ingredients: null },
  ], "2026-11-10");
  assertEquals(p.map((e) => [e.key, e.daysLeft, e.out]), [["spinach", 1, false], ["salt", null, true]]);
});

Deno.test("who's eating narrows the table; spice falls back by age", () => {
  const rows = [
    { id: "m1", display_name: "Sunita", age_group: "adult" as const, diet: "veg" as const, taste_profiles: { spice: 4 } },
    { id: "m2", display_name: "Aarav", age_group: "child" as const, diet: "veg" as const, taste_profiles: null },
  ];
  assertEquals(eatersFromRows(rows).map((e) => e.spice), [4, 1]);
  assertEquals(eatersFromRows(rows, ["m1"]).map((e) => e.name), ["Sunita"]);
  assertEquals(eatersFromRows(rows, ["nobody"]).length, 2);
});

Deno.test("memories and calendar become avoid / like / prefer lists", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const m = prefsFromMemories([
    { polarity: -1, scope: "permanent", expires_at: null, ingredients: { canonical_name: "brinjal" } },
    { polarity: 1, scope: "permanent", expires_at: null, ingredients: { canonical_name: "garlic" } },
    { polarity: -1, scope: "temporary", expires_at: "2026-11-09T00:00:00Z", ingredients: { canonical_name: "onion" } },
  ], now);
  assertEquals(m, { avoid: ["brinjal"], like: ["garlic"] });
  // Only plain likes and dislikes of the people eating count: not "less salt", not a note about one dish.
  const rows = [
    { polarity: -1, scope: "permanent", expires_at: null, ingredients: { canonical_name: "bitter gourd" }, member_id: "riya", attributes: { about: "preference" } },
    { polarity: -1, scope: "permanent", expires_at: null, ingredients: { canonical_name: "salt" }, member_id: "sunita", attributes: { about: "amount" } },
    { polarity: -1, scope: "permanent", expires_at: null, ingredients: { canonical_name: "garlic" }, member_id: "sunita", subject_recipe_id: "r1" },
    { polarity: -1, scope: "permanent", expires_at: null, ingredients: { canonical_name: "peanut" }, member_id: null },
  ];
  assertEquals(prefsFromMemories(rows, now, ["sunita", "riya"]).avoid, ["bitter gourd", "peanut"]);
  assertEquals(prefsFromMemories(rows, now, ["sunita"]).avoid, ["peanut"]);
  assertEquals(prefsFromMemories(rows, now).avoid, ["bitter gourd", "peanut"]);
  assertEquals(recentFrom([{ recipe_id: "r", at: "2026-11-08T12:00:00Z" }], now), [{ recipeId: "r", daysAgo: 2 }]);
});

Deno.test("weights from the flag, bad values ignored", () => {
  const w = weightsFrom({ weights: { coverage: 5, useSoon: "x", taste: -1, novelty: 99 } });
  assertEquals([w.coverage, w.useSoon, w.taste, w.novelty], [5, 2, 1.5, 1.5]);
  assertEquals(weightsFrom(null).coverage, 3);
});

Deno.test("model craving reading only adds known values", () => {
  const c = mergeCraving({ ...NO_CRAVING, tags: ["light"] }, { tags: ["light", "comforting", "made_up"], maxTimeMin: 30, spiceDelta: 5 }, ["comforting", "light"]);
  assertEquals(c.tags, ["light", "comforting"]);
  assertEquals(c.maxTimeMin, 30);
  assertEquals(c.spiceDelta, 2);
  assertEquals(mergeCraving(NO_CRAVING, null, []), NO_CRAVING);
});

Deno.test("reworded reasons must stay short, cite the same fact and make no health claims", () => {
  const t = "Uses your palak before it goes off";
  assertEquals(acceptReason(t, "Your palak won't last past tomorrow, so let's use it", ["palak"]), "Your palak won't last past tomorrow, so let's use it");
  assertEquals(acceptReason(t, "A lovely dinner tonight", ["palak"]), t);
  assertEquals(acceptReason(t, "Palak is healthy for you", ["palak"]), t);
  assertEquals(acceptReason(t, "x".repeat(91), []), t);
  assertEquals(acceptReason(t, null, []), t);
});

Deno.test("disliked dishes and dishes turned down today are left out", () => {
  const out = excludedRecipes([{ subject_recipe_id: "r1" }, { subject_recipe_id: null }], [{ recipe_id: "r2" }, { recipe_id: "r1" }]);
  assertEquals([...out].sort(), ["r1", "r2"]);
  assertEquals(excludedRecipes([], []).size, 0);
});

Deno.test("family reactions: only loved or not-for-me count", async () => {
  const { reactionsFromRows } = await import("./logic.ts");
  assertEquals(reactionsFromRows([
    { polarity: 1, member_id: "m1", subject_recipe_id: "r1" },
    { polarity: 0, member_id: "m1", subject_recipe_id: "r2" },
    { polarity: -1, member_id: "m2", subject_recipe_id: "r1" },
    { polarity: 1, member_id: null, subject_recipe_id: "r3" },
  ]), [{ memberId: "m1", recipeId: "r1", polarity: 1 }, { memberId: "m2", recipeId: "r1", polarity: -1 }]);
});
