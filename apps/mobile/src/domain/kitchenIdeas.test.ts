// M4: ideas from what you have.
import assert from "node:assert/strict";
import { test } from "node:test";

import recipesJson from "../data/recipes.json" with { type: "json" };
import { kitchenIdeas, occasionOn } from "./kitchenIdeas.ts";
import type { PantryEntry } from "./ranking.ts";
import type { RecipeDoc } from "./recipes.ts";

const library = recipesJson as unknown as RecipeDoc[];
const entry = (key: string): PantryEntry => ({ itemId: key, key, confidence: 1, daysLeft: null, out: false });
const STAPLES = ["salt", "turmeric powder", "red chilli powder", "cumin seeds", "refined oil", "ghee", "sugar", "whole wheat flour", "asafoetida", "garam masala", "coriander powder", "mustard seeds"];

test("a kitchen with dal, onion, tomato, garlic and ginger can make dal right now", () => {
  const pantry = ["toor dal", "onion", "tomato", "garlic", "ginger", "green chilli"].map(entry);
  const ideas = kitchenIdeas(library, pantry, STAPLES);
  assert.ok(ideas.length >= 1 && ideas.length <= 3, "one to three ideas, never more");
  assert.ok(ideas.some((i) => i.doc.slug.includes("dal")), ideas.map((i) => i.doc.slug).join(","));
  assert.ok(ideas.every((i) => i.kind === "ready" || i.swap));
});

test("nothing that uses an avoided ingredient", () => {
  const pantry = ["toor dal", "onion", "tomato", "garlic", "ginger", "green chilli"].map(entry);
  const ideas = kitchenIdeas(library, pantry, STAPLES, { avoid: ["ghee", "garlic"] });
  for (const i of ideas) assert.ok(!i.doc.ingredients.some((x) => ["ghee", "garlic"].includes(x.ingredient)), i.doc.slug);
});

test("an empty kitchen has no ideas rather than wrong ones", () => {
  assert.deepEqual(kitchenIdeas(library, [], []), []);
});

test("occasions: a festival this week, a fast today, or nothing", () => {
  const events = [
    { event_date: "2026-11-08", end_date: null, kind: "festival" },
    { event_date: "2026-11-20", end_date: "2026-11-21", kind: "fast" },
  ];
  assert.equal(occasionOn(events, "2026-11-03"), "festival");
  assert.equal(occasionOn(events, "2026-11-20"), "fast");
  assert.equal(occasionOn(events, "2026-12-01"), null);
});

test("roti, puri and other basics are never offered as ideas; festive only marks festival sweets and snacks", () => {
  // Atta, oil and salt alone make roti, puri and paratha: that is not an idea.
  const ideas = kitchenIdeas(library, ["whole wheat flour", "refined oil", "salt", "semolina"].map(entry), STAPLES, { occasion: "festival" });
  assert.ok(ideas.every((i) => i.doc.course !== "component"), ideas.map((i) => i.doc.slug).join(","));
  assert.ok(ideas.every((i) => !i.festive || ["dessert", "snack"].includes(i.doc.course)));
  const dal = kitchenIdeas(library, ["toor dal", "onion", "tomato", "garlic", "ginger"].map(entry), STAPLES, { occasion: "festival" });
  assert.ok(dal.length >= 1 && dal.every((i) => !i.festive), "a dal near a festival isn't called a festival dish");
});
