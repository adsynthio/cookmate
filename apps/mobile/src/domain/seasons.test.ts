import assert from "node:assert/strict";
import { test } from "node:test";

import catalogJson from "../data/catalog.json" with { type: "json" };
import { inSeason, monthOf } from "./seasons.ts";

const names = new Set((catalogJson as { name: string }[]).map((c) => c.name));

test("every month has at least six seasonal catalog foods", () => {
  for (let m = 1; m <= 12; m++) {
    const list = inSeason(m);
    assert.ok(list.length >= 6, `month ${m}`);
    for (const n of list) assert.ok(names.has(n), `${n} (month ${m}) is not a catalog name`);
  }
});

test("winter is gajar, matar and methi; summer is mango and lauki", () => {
  assert.ok(inSeason(12).includes("carrot") && inSeason(12).includes("green peas") && inSeason(12).includes("fenugreek leaves"));
  assert.ok(inSeason(5).includes("mango") && inSeason(5).includes("raw mango"));
  assert.ok(inSeason(6).includes("bottle gourd"));
  assert.equal(monthOf("2026-11-22"), 11);
  assert.deepEqual(inSeason(13), []);
});
