// M2: a dish as the parts you already know.
import assert from "node:assert/strict";
import { test } from "node:test";

import recipesJson from "../data/recipes.json" with { type: "json" };
import { blueprint, ease, recordDone, stepTechnique } from "./blueprint.ts";
import type { RecipeDoc } from "./recipes.ts";

const library = recipesJson as unknown as RecipeDoc[];
const get = (slug: string) => library.find((r) => r.slug === slug)!;

const boondiLadoo = {
  steps: [
    { text: "Whisk besan, a pinch of Eno and water into a smooth, flowing batter." },
    { text: "Hold a jhara over the hot oil and tap the batter through it. Fry in batches until crisp.", safety: "Never leave hot oil alone." },
    { text: "Boil sugar and water to a one-string syrup with elaichi." },
    { text: "Stir the boondi into the warm syrup and let it soak 10 minutes." },
    { text: "With greased hands, roll into balls while still warm." },
  ],
} as Pick<RecipeDoc, "steps">;

test("boondi ladoo is batter, deep fry, sugar syrup and shape", () => {
  assert.deepEqual(blueprint(boondiLadoo).map((p) => p.technique), ["batter", "deep_fry", "sugar_syrup", "shape"]);
});

test("tagged steps keep their tag; plain steps are not parts", () => {
  assert.equal(stepTechnique({ technique: "tadka", text: "Heat ghee." }), "tadka");
  assert.equal(stepTechnique({ text: "Serve hot with rice." }), null);
  assert.equal(stepTechnique({ text: "Close the cooker and cook for three whistles." }), "pressure_cook");
});

test("every library recipe has at least one part and at most six", () => {
  for (const r of library) {
    const n = blueprint(r).length;
    assert.ok(n >= 1 && n <= 6, `${r.slug}: ${n}`);
  }
});

test("what you've done before makes a dish easy; a new hard part is a stretch", () => {
  let done = {};
  const first = ease(boondiLadoo, done);
  assert.equal(first.feel, "stretch", "a one-string syrup is new");
  assert.deepEqual(first.known, []);
  done = recordDone(done, get("puri"), "Puri", 1);
  done = recordDone(done, { steps: [{ text: "Make a one-string sugar syrup." }] }, "Gulab jamun", 2);
  const later = ease(boondiLadoo, done);
  assert.equal(later.feel, "easy");
  assert.deepEqual(later.known.map((k) => `${k.technique}:${k.dish}`).sort(), ["deep_fry:Puri", "sugar_syrup:Gulab jamun"]);
});
