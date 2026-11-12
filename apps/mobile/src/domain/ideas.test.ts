import { test } from "node:test";
import assert from "node:assert/strict";

import catalog from "../data/catalog.json" with { type: "json" };
import { IDEAS, ideaFor, ideaRecipe } from "./ideas.ts";

test("an idea is offered only when the kitchen has its key ingredients and it isn't already a recipe", () => {
  const have = new Set(["potato", "green peas", "tomato", "onion"]);
  assert.deepEqual(ideaFor(have, ["Rajma"], "en")?.name, "Aloo Matar");
  assert.equal(ideaFor(have, ["aloo matar"], "en"), null);
  assert.equal(ideaFor(new Set(["potato"]), [], "en"), null);
  assert.equal(ideaFor(have, [], "hi")?.name, "आलू मटर");
});

test("ideas are found by any of their names, and use only catalog ingredients", () => {
  assert.equal(ideaRecipe("tomato rice")?.slug, "idea-tomato-rice");
  assert.equal(ideaRecipe("पनीर भुर्जी")?.slug, "idea-paneer-bhurji");
  assert.equal(ideaRecipe("biryani"), null);
  const names = new Set((catalog as { name: string }[]).map((c) => c.name));
  for (const i of IDEAS) for (const x of i.doc.ingredients) assert.ok(names.has(x.ingredient), x.ingredient);
});
