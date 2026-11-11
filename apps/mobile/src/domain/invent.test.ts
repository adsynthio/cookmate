// Invent a combination (KIT-056): flavour logic picks the odds and ends; the safety validator gates the dish.
import assert from "node:assert/strict";
import { test } from "node:test";

import catalogJson from "../data/catalog.json" with { type: "json" };
import { type CatalogEntry, type InventItem, planInvention, templateInvention, validateInvention } from "./invent.ts";

const catalog = new Map((catalogJson as CatalogEntry[]).map((c) => [c.name, c]));
const item = (key: string, extra: Partial<InventItem> = {}): InventItem => ({
  itemId: `i-${key}`, key, state: "raw", roles: [], confidence: 0.9, daysLeft: null, ...extra,
});

const kitchen = [
  item("rice", { state: "leftover", daysLeft: 1 }),
  item("spinach", { daysLeft: 2 }),
  item("paneer"),
  item("onion"),
  item("hari chutney", { state: "homemade", roles: ["heat", "acid"] }),
  item("chicken", { daysLeft: 1 }),
  item("salt"),
];

test("the plan uses leftovers and what spoils first, and fills flavour gaps", () => {
  const plan = planInvention(kitchen, catalog, "veg")!;
  const keys = plan.use.map((u) => u.key);
  assert.equal(keys[0], "rice", "yesterday's rice goes first");
  assert.ok(keys.includes("spinach"), "spinach spoils in two days");
  assert.ok(!keys.includes("chicken"), "nothing outside the diet");
  assert.ok(!keys.includes("salt"), "raw staples are assumed, not planned");
  assert.deepEqual(plan.cooked, ["rice"]);
  assert.ok(plan.roles.includes("starch"));
  assert.ok(keys.includes("hari chutney"), "homemade components are used with the roles they were saved with");
  assert.ok(plan.roles.includes("acid"));
});

test("too little to invent with gives no plan", () => {
  assert.equal(planInvention([item("onion")], catalog, "veg"), null);
  assert.equal(planInvention([item("paneer"), item("onion")], catalog, "veg"), null, "nothing left over or about to spoil");
});

test("the template dish passes the safety validator", () => {
  const plan = planInvention(kitchen, catalog, "veg")!;
  const doc = templateInvention(plan, "veg");
  const have = new Set(kitchen.map((k) => k.key));
  assert.deepEqual(validateInvention(doc, plan, { catalog, diet: "veg", have }), []);
});

test("the validator refuses unsafe or impossible dishes", () => {
  const plan = planInvention(kitchen, catalog, "veg")!;
  const have = new Set(kitchen.map((k) => k.key));
  const ok = templateInvention(plan, "veg");

  const noReheat = { ...ok, steps: ok.steps.map((s) => ({ ...s, safety: undefined })) };
  assert.ok(validateInvention(noReheat, plan, { catalog, diet: "veg", have }).some((p) => p.includes("steaming hot")));

  const shopping = { ...ok, ingredients: [...ok.ingredients, { ingredient: "mushroom", qty: 100, unit: "g", role: "vegetable" }] };
  assert.ok(validateInvention(shopping, plan, { catalog, diet: "veg", have }).includes("mushroom isn't in the kitchen"));

  const unknown = { ...ok, ingredients: [...ok.ingredients, { ingredient: "dragon fruit", qty: 1, unit: "piece", role: "fruit" }] };
  assert.ok(validateInvention(unknown, plan, { catalog, diet: "veg", have }).includes("unknown ingredient dragon fruit"));

  const skipped = { ...ok, ingredients: ok.ingredients.filter((i) => i.ingredient !== "spinach") };
  assert.ok(validateInvention(skipped, plan, { catalog, diet: "veg", have }).includes("doesn't use spinach"));

  const shortcut = { ...ok, steps: [...ok.steps, { text: "No need to reheat the rice, just mix it in." }] };
  assert.ok(validateInvention(shortcut, plan, { catalog, diet: "veg", have }).some((p) => p.startsWith("unsafe instruction")));

  const meatPlan = planInvention(kitchen, catalog, "nonveg")!;
  const withChicken = templateInvention(meatPlan, "nonveg");
  if (meatPlan.use.some((u) => u.key === "chicken")) {
    assert.ok(validateInvention(withChicken, meatPlan, { catalog, diet: "nonveg", have }).some((p) => p.includes("cooked through")),
      "raw chicken needs a cooked-through safety step");
  }
  assert.ok(validateInvention({ ...withChicken, diet: "veg" }, meatPlan, { catalog, diet: "veg", have }).length > 0);
});
