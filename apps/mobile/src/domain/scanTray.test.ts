import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeTray } from "./scanTray.ts";

const it = (said: string, key: string | null, quantity: number | null, unit: string | null, confidence = 0.9) => ({ said, ingredientKey: key, quantity, unit, confidence });

test("two photos of the same shelf don't double the paneer", () => {
  const first = [it("paneer", "paneer", 200, "g"), it("eggs", "egg", 6, "piece")];
  const second = [it("paneer", "paneer", 200, "g", 0.95), it("milk", "milk", 1, "l")];
  const tray = mergeTray(first, second);
  assert.deepEqual(tray.map((t) => [t.ingredientKey, t.quantity, t.unit]), [["paneer", 200, "g"], ["egg", 6, "piece"], ["milk", 1, "l"]]);
  assert.equal(tray[0]!.confidence, 0.95);
});

test("an amount fills in when the first photo couldn't see one; packets add up", () => {
  assert.deepEqual(mergeTray([it("curd", "curd", null, null)], [it("curd", "curd", 400, "g")]).map((t) => [t.quantity, t.unit]), [[400, "g"]]);
  assert.deepEqual(mergeTray([it("toor dal", "toor dal", 1, "kg")], [it("toor dal", "toor dal", 1, "kg")], "packet").map((t) => t.quantity), [2]);
  // Different units stay apart rather than being added wrongly.
  assert.equal(mergeTray([it("milk", "milk", 1, "l")], [it("milk", "milk", 2, "packet")]).length, 2);
  // Unknown foods match by name.
  assert.equal(mergeTray([it("Kissan Jam", null, 1, "bottle")], [it("kissan jam", null, 1, "bottle")]).length, 1);
});
