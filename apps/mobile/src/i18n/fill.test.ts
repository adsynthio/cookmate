import assert from "node:assert/strict";
import { test } from "node:test";

import en from "./en.json" with { type: "json" };
import { fill } from "./fill.ts";

test("holes are filled, unknown ones are left as they are", () => {
  assert.equal(fill("{n} min, {x}", { n: 5 }), "5 min, {x}");
  assert.equal(fill("no holes"), "no holes");
});

test("the plural mark reads right for 1 and for more", () => {
  assert.equal(fill("{n} thing{n|s}", { n: 1 }), "1 thing");
  assert.equal(fill("{n} thing{n|s}", { n: 3 }), "3 things");
  assert.equal(fill("{n} thing{n|s} need{n||s} using", { n: 1 }), "1 thing needs using");
  assert.equal(fill("{n} thing{n|s} need{n||s} using", { n: 4 }), "4 things need using");
  assert.equal(fill("{n} dish{n|es}", { n: 2 }), "2 dishes");
  assert.equal(fill("{n|these|this} {n} photo{n|s}", { n: 1 }), "this 1 photo");
  assert.equal(fill("{n} item{n|s}", { n: "1" }), "1 item");
  assert.equal(fill("{n} item{n|s}", { n: 0 }), "0 items");
});

test("no English string says '(s)' or puts 1 before a plural it can't fix", () => {
  const e = en as Record<string, string>;
  for (const [k, v] of Object.entries(e)) {
    assert.ok(!v.includes("(s)"), k);
    for (const p of [1, 2]) {
      const s = fill(v, { n: p, count: p, days: p, hours: p, total: p, dish: "Rajma", dishes: "Rajma", item: "rajma", step: 2, start: "7:00", time: "5 min", q: "x" });
      if (p === 1) assert.ok(!/\b1 (things|items|days|dishes|photos|steps|meals|hours|whistles|guests|parts|weeks|months|years|guesses)\b/.test(s), `${k}: ${s}`);
    }
  }
});
