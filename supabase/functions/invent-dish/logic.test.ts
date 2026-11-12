import { assertEquals } from "jsr:@std/assert@1";

import { planInvention, validateInvention } from "../_shared/invent.ts";
import { CATALOG, cleanDishName, docFromModel, inventItems, namedPlan, tableDiet, toBuyFor } from "./logic.ts";

Deno.test("the table eats what its strictest member eats", () => {
  assertEquals(tableDiet(["nonveg", "veg"]), "veg");
  assertEquals(tableDiet(["nonveg", "eggetarian"]), "eggetarian");
  assertEquals(tableDiet(["jain", "nonveg"]), "jain");
  assertEquals(tableDiet([null]), "veg");
});

Deno.test("a model dish becomes a new-creation recipe the validator can judge", () => {
  const items = inventItems([
    { id: "1", custom_name: null, state: "leftover", flavor_roles: [], confidence: 0.9, expiry_date: "2027-02-04", ingredients: { canonical_name: "rice" } },
    { id: "2", custom_name: null, state: "raw", flavor_roles: [], confidence: 0.9, expiry_date: "2027-02-05", ingredients: { canonical_name: "spinach" } },
    { id: "3", custom_name: "Hari Chutney", state: "homemade", flavor_roles: ["heat", "acid", "bogus"], confidence: 0.9, expiry_date: null, ingredients: null },
  ], "2027-02-03");
  assertEquals(items[2]!.key, "hari chutney");
  assertEquals(items[2]!.roles, ["heat", "acid"]);
  assertEquals(items[0]!.daysLeft, 1);

  const plan = planInvention(items, CATALOG, "veg")!;
  const doc = docFromModel({
    title: "Palak chutney rice",
    title_hi: "पालक चटनी चावल",
    title_hinglish: "Palak chutney chawal",
    description: "Yesterday's rice with spinach and green chutney.",
    servings: 2, prep_min: 5, cook_min: 10, spice_level: 2,
    ingredients: [
      { ingredient: "rice", qty: 300, unit: "g" },
      { ingredient: "Spinach", qty: 150, unit: "g" },
      { ingredient: "hari chutney", qty: 2, unit: "tbsp" },
      { ingredient: "refined oil", qty: 10, unit: "ml" },
      { ingredient: "salt", qty: 3, unit: "g" },
    ],
    steps: [
      { text: "Heat oil, add chopped spinach and cook until wilted.", minutes: 3 },
      { text: "Add the rice with a splash of water; stir until steaming hot all through.", minutes: 4, safety: "Reheat rice until steaming hot." },
      { text: "Stir in the chutney and salt, and serve.", cue: "Rice is evenly green." },
    ],
  }, "veg");
  assertEquals(doc.tags, ["new_creation"]);
  assertEquals(doc.ingredients[2]!.unit, "g", "unknown units fall back to grams");
  assertEquals(validateInvention(doc, plan, { catalog: CATALOG, diet: "veg", have: new Set(items.map((i) => i.key)) }), []);
});

Deno.test("named dishes: clean names, a few things to buy, leftovers they use must be reheated", () => {
  assertEquals(cleanDishName("  Aloo   Methi "), "Aloo Methi");
  assertEquals(cleanDishName("मेथी आलू"), "मेथी आलू");
  assertEquals(cleanDishName("x"), null);
  assertEquals(cleanDishName("<script>"), null);
  assertEquals(cleanDishName(42), null);

  const doc = docFromModel({
    title: "Aloo Methi", title_hi: "आलू मेथी", title_hinglish: "Aloo methi", description: "Potatoes with fenugreek leaves.",
    servings: 2, prep_min: 10, cook_min: 15, spice_level: 2,
    ingredients: [
      { ingredient: "potato", qty: 300, unit: "g", local: null },
      { ingredient: "fenugreek leaves", qty: 1, unit: "bunch", local: null },
      { ingredient: "rice", qty: 200, unit: "g", local: null },
      { ingredient: "salt", qty: 5, unit: "g", local: null },
    ],
    steps: [{ text: "Fry the potatoes.", minutes: 8, cue: null, safety: null }, { text: "Add methi and cook.", minutes: 5, cue: null, safety: null }],
  }, "veg");
  assertEquals(toBuyFor(doc, new Set(["potato", "rice"])), ["fenugreek leaves"]);
  const items = inventItems([
    { id: "1", custom_name: null, state: "leftover", flavor_roles: [], confidence: 0.9, expiry_date: null, ingredients: { canonical_name: "rice" } },
    { id: "2", custom_name: null, state: "leftover", flavor_roles: [], confidence: 0.9, expiry_date: null, ingredients: { canonical_name: "toor dal" } },
  ], "2027-02-03");
  const plan = namedPlan(doc, items);
  assertEquals(plan.cooked, ["rice"]);
  const problems = validateInvention(doc, plan, { catalog: CATALOG, diet: "veg", have: new Set(["potato", "rice", "fenugreek leaves"]) });
  assertEquals(problems.some((p) => p.includes("steaming hot")), true);
});
