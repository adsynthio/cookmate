import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { airFryFor } from "./airFryer.ts";

const recipes = JSON.parse(readFileSync(new URL("../data/recipes.json", import.meta.url), "utf8")) as { slug: string; steps: { technique?: string }[] }[];

test("known dishes get their own air-fryer way, others a general guide", () => {
  const pakora = airFryFor("kadhi-pakora", 5, { technique: "deep_fry" }, "en")!;
  assert.equal(pakora.tempC, 190);
  assert.equal(pakora.general, false);
  assert.match(pakora.lines[0]!, /besan/);
  const other = airFryFor("aloo-tikki", 3, { technique: "shallow_fry" }, "hi")!;
  assert.equal(other.general, true);
  assert.equal(other.tempC, 180);
  assert.equal(airFryFor("dal-tadka", 4, { technique: "tadka" }, "en"), null);
});

test("every known entry points at a real frying step of a bundled recipe", () => {
  for (const [slug, n] of [["kadhi-pakora", 5], ["kanda-poha", 2], ["jeera-aloo", 4]] as const) {
    const step = recipes.find((r) => r.slug === slug)?.steps[n - 1];
    assert.ok(step && ["deep_fry", "shallow_fry"].includes(step.technique ?? ""), `${slug}:${n}`);
  }
});
