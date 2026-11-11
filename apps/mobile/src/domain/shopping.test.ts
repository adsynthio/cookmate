import assert from "node:assert/strict";
import { test } from "node:test";

import { groupBySection, lineAmount, sectionOf, shareText, type ListLine } from "./shopping.ts";

const line = (id: string, key: string | null, name: string, quantity: number | null = null, unit: string | null = null): ListLine => ({
  id, ingredientKey: key, name, quantity, unit, reason: "manual",
});
const categories: Record<string, string> = { paneer: "dairy", tomato: "vegetable", "toor dal": "pulse", chicken: "meat", coriander: "herb" };
const categoryOf = (k: string) => categories[k];
const nameOf = (l: ListLine) => l.name;

test("catalog categories map to shop sections", () => {
  assert.equal(sectionOf("vegetable"), "produce");
  assert.equal(sectionOf("egg"), "dairy");
  assert.equal(sectionOf("spice"), "staples");
  assert.equal(sectionOf("seafood"), "meat");
  assert.equal(sectionOf("packaged"), "other");
  assert.equal(sectionOf(undefined), "other");
});

test("lines are grouped in walking order and sorted by name", () => {
  const groups = groupBySection(
    [line("1", "toor dal", "Toor dal", 1, "kg"), line("2", "tomato", "Tomato", 6, "piece"), line("3", null, "Birthday candles"), line("4", "paneer", "Paneer", 200, "g"), line("5", "coriander", "Coriander")],
    categoryOf,
    nameOf,
  );
  assert.deepEqual(groups.map((g) => g.section), ["produce", "dairy", "staples", "other"]);
  assert.deepEqual(groups[0]!.lines.map((l) => l.name), ["Coriander", "Tomato"]);
});

test("amounts read naturally", () => {
  assert.equal(lineAmount({ quantity: 200, unit: "g" }), "200 g");
  assert.equal(lineAmount({ quantity: 6, unit: "piece" }), "6");
  assert.equal(lineAmount({ quantity: 1.5, unit: "kg" }), "1.5 kg");
  assert.equal(lineAmount({ quantity: null, unit: null }), "");
});

test("the shared text is readable without the app", () => {
  const groups = groupBySection([line("1", "tomato", "Tomato", 6, "piece"), line("2", "paneer", "Paneer", 200, "g"), line("3", null, "Candles")], categoryOf, nameOf);
  const names = { produce: "Vegetables and fruit", dairy: "Dairy and eggs", staples: "Staples", meat: "Meat and fish", other: "Other" };
  assert.equal(
    shareText(groups, (s) => names[s], nameOf, "en"),
    "Shopping list\n\nVegetables and fruit:\n- Tomato, 6\n\nDairy and eggs:\n- Paneer, 200 g\n\nOther:\n- Candles",
  );
  assert.match(shareText([], (s) => names[s], nameOf, "hi"), /^ख़रीदारी की सूची$/);
});
