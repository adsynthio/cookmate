// Kitchen and shopping-list edits with no network: the phone's copy shows each edit at once.
import assert from "node:assert/strict";
import { test } from "node:test";

import { applyEdit, EMPTY_COPY, isLocalId, replayable, type KitchenCopy } from "./kitchenOffline.ts";

const item = (id: string, over = {}) => ({
  id, ingredientKey: id, name: id, quantity: 1, unit: "kg", location: "pantry" as const, stapleLevel: null, expiryDate: null,
  expiryEstimated: true, confidence: 0.4, state: "raw" as const, flavorRoles: [], ...over,
});
const copy: KitchenCopy = {
  ...EMPTY_COPY,
  items: [item("potato"), item("onion")],
  list: [{ id: "l1", ingredientKey: "tomato", name: "tomato", quantity: null, unit: null, reason: "manual" }],
};
let n = 0;
const id = () => `local-${++n}`;

test("an edit offline changes the copy and counts as confirming the item", () => {
  const c = applyEdit(copy, { call: "kitchen.updateItem", itemId: "potato", changes: { quantity: 0.5 } });
  assert.equal(c.items[0]!.quantity, 0.5);
  assert.equal(c.items[0]!.confidence, 0.95);
  assert.equal(c.items[1]!.confidence, 0.4, "other items are untouched");
});

test("finish and undo work without the network", () => {
  const gone = applyEdit(copy, { call: "kitchen.finishItem", itemId: "onion" });
  assert.deepEqual(gone.items.map((i) => i.id), ["potato"]);
  const back = applyEdit(gone, { call: "kitchen.reopenItem", itemId: "onion" });
  assert.deepEqual(back.items.map((i) => i.id).sort(), ["onion", "potato"]);
  assert.equal(back.removed.length, 0);
});

test("things added offline show up with a local id", () => {
  const c = applyEdit(copy, {
    call: "kitchen.addItems",
    items: [{ key: "k", said: "do kilo gajar", ingredientKey: "carrot", quantity: 2, unit: "kg", locationKind: "fridge", state: null, flavorRoles: [], confidence: 0.9 }],
  }, id);
  const added = c.items[2]!;
  assert.equal(added.name, "carrot");
  assert.equal(added.location, "fridge");
  assert.ok(isLocalId(added.id));
});

test("the shopping list: add once, tick off, remove", () => {
  let c = applyEdit(copy, { call: "kitchen.addToList", items: [{ name: "Tomato", reason: "manual" }, { name: "atta", reason: "running_low" }] }, id);
  assert.deepEqual(c.list.map((l) => l.name), ["tomato", "atta"], "already on the list isn't added twice");
  c = applyEdit(c, { call: "kitchen.markBought", itemIds: ["l1"] });
  assert.deepEqual(c.list.map((l) => l.name), ["atta"]);
  c = applyEdit(c, { call: "kitchen.removeFromList", itemId: c.list[0]!.id });
  assert.equal(c.list.length, 0);
  assert.equal(applyEdit(copy, { call: "kitchen.markBought" }).list.length, 0, "no ids means everything was bought");
});

test("edits to things the server never saw don't replay", () => {
  assert.equal(replayable({ call: "kitchen.updateItem", itemId: "local-1", changes: { quantity: 1 } }), false);
  assert.equal(replayable({ call: "kitchen.finishItem", itemId: "potato" }), true);
  assert.equal(replayable({ call: "kitchen.markBought", itemIds: ["local-9"] }), false);
  assert.equal(replayable({ call: "kitchen.markBought" }), true);
  assert.equal(replayable({ call: "kitchen.addItems", items: [] }), true);
});
