import { assertEquals } from "jsr:@std/assert@1";

import { NO_CRAVING, type Ranked, type RankContext } from "../_shared/ranking.ts";
import { acceptChef, acceptNewDish, chefBrief, seasonOf } from "./chef.ts";

const dish = (id: string, title: string, items: { key: string; daysLeft?: number | null; missing?: boolean }[]): Ranked => ({
  recipe: { id, slug: id, title, course: "main", diet: "veg", timeMin: 30, spiceLevel: 2, equipment: [], tags: [], flavor: {}, ingredients: [], equipmentFallbacks: [] },
  score: 0.5,
  breakdown: { coverage: 1, useSoon: 0, taste: 0, novelty: 0, time: 0, equipment: 0, calendar: 0, craving: 0, slot: 0 },
  match: {
    total: items.length,
    have: items.filter((i) => !i.missing).length,
    items: items.map((i) => i.missing
      ? { key: i.key, status: "missing" as const }
      : { key: i.key, status: "have" as const, entry: { itemId: i.key, key: i.key, confidence: 1, daysLeft: i.daysLeft ?? null, out: false } }),
  },
});

const palak = dish("palak", "Palak Paneer", [{ key: "spinach", daysLeft: 1 }, { key: "paneer" }]);
const rajma = dish("rajma", "Rajma", [{ key: "rajma" }, { key: "onion" }]);
const poha = dish("poha", "Kanda Poha", [{ key: "poha" }, { key: "peanuts", missing: true }]);
const pool = [rajma, palak, poha];
const template = (r: Ranked) => `Rules reason for ${r.recipe.title}`;
const anchors = (r: Ranked) => r.match.items.filter((m) => m.entry?.daysLeft !== null && (m.entry?.daysLeft ?? 9) <= 2).map((m) => m.key);

Deno.test("seasons by month", () => {
  assertEquals(seasonOf("2026-11-12"), "autumn");
  assertEquals(seasonOf("2027-01-05"), "winter");
  assertEquals(seasonOf("2027-05-20"), "summer");
  assertEquals(seasonOf("2027-07-01"), "monsoon");
});

Deno.test("the model's order wins, reasons are checked against the dish's facts", () => {
  const r = acceptChef(
    { picks: [{ id: "palak", reason: "The spinach goes off tomorrow, so palak paneer tonight." }, { id: "poha", reason: "Light and quick." }], new_dish: null },
    pool, pool, template, anchors,
  )!;
  assertEquals(r.picks.map((p) => p.recipe.id), ["palak", "poha", "rajma"]);
  assertEquals(r.reasons[0], "The spinach goes off tomorrow, so palak paneer tonight.");
  assertEquals(r.reasons[1], "Light and quick.");
  assertEquals(r.reasons[2], "Rules reason for Rajma");
});

Deno.test("a reason that skips the real fact, or makes a health claim, falls back", () => {
  const r = acceptChef({ picks: [{ id: "palak", reason: "A lovely green dish." }, { id: "rajma", reason: "Healthy and filling." }], new_dish: null }, pool, pool, template, anchors)!;
  assertEquals(r.reasons[0], "Rules reason for Palak Paneer");
  assertEquals(r.reasons[1], "Rules reason for Rajma");
});

Deno.test("an id that was never offered throws the whole answer away", () => {
  assertEquals(acceptChef({ picks: [{ id: "palak", reason: "x" }, { id: "biryani", reason: "y" }], new_dish: null }, pool, pool, template, anchors), null);
  assertEquals(acceptChef({ picks: [], new_dish: null }, pool, pool, template, anchors), null);
});

Deno.test("new dish ideas: real names only, nothing we already have", () => {
  assertEquals(acceptNewDish({ name: " Aloo  Methi ", why: "Methi is fresh and there are potatoes." }, ["Rajma"]), { name: "Aloo Methi", why: "Methi is fresh and there are potatoes." });
  assertEquals(acceptNewDish({ name: "rajma", why: "x" }, ["Rajma"]), null);
  assertEquals(acceptNewDish({ name: "Detox Soup", why: "Good for you." }, []), null);
  assertEquals(acceptNewDish({ name: "<b>x</b>", why: "x" }, []), null);
  assertEquals(acceptNewDish({ name: "मेथी आलू", why: "मेथी ताज़ा है।" }, []), { name: "मेथी आलू", why: "मेथी ताज़ा है।" });
  assertEquals(acceptNewDish(null, []), null);
});

Deno.test("the brief carries leftovers, what's going off and who is eating", () => {
  const ctx = {
    slot: "dinner", eaters: [{ id: "a", name: "Aarav", ageGroup: "child", diet: "veg", spice: 1 }], pantry: [], staples: [], equipment: null,
    avoid: ["karela"], like: ["paneer"], prefer: [], recent: [{ recipeId: "rajma", daysAgo: 2 }], craving: NO_CRAVING, timeBudgetMin: 45,
    weights: {} as RankContext["weights"], alreadyCooked: ["leftover kadhi"],
  } as RankContext;
  const b = chefBrief({ ranked: pool, templates: new Map(), ctx, slot: "dinner", today: "2026-11-12", festivals: [], craving: NO_CRAVING, nameOf: (k) => k });
  assertEquals(b.leftovers_ready, ["leftover kadhi"]);
  assertEquals(b.eating[0]!.age_group, "child");
  assertEquals(b.candidates[1]!.uses[0], { item: "spinach", days_left: 1 });
  assertEquals(b.candidates[0]!.cooked_days_ago, 2);
  assertEquals(b.candidates[2]!.to_buy, ["peanuts"]);
  assertEquals(b.season, "autumn");
});
