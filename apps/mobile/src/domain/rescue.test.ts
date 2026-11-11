// Rescue scenario set (KIT-091): the same cases run against the app's rules and the Edge Function's shared copy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  catalogLookup,
  isWetDish,
  leftoverSafety,
  MAX_STEPS,
  missingResolved,
  mustUseRules,
  PROBLEMS,
  SAFETY_PLAYBOOK,
  safetyFor,
  staticRescue,
  validateModelRescue,
  type RescueContext,
  type RescueLocale,
} from "./rescue.ts";

type Doc = { slug: string; ingredients: RescueContext["ingredients"]; steps: { technique?: string }[] };
const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
const recipes: Doc[] = JSON.parse(readFileSync(new URL("../data/recipes.json", import.meta.url), "utf8"));
const cat = catalogLookup(catalog);
const LOCALES: RescueLocale[] = ["en", "hi", "hinglish"];

function ctxFor(slug: string, pantry: string[], extra: Partial<RescueContext> = {}): RescueContext {
  const doc = recipes.find((r) => r.slug === slug)!;
  return { ingredients: doc.ingredients, techniques: doc.steps.map((s) => s.technique), pantry, ...extra };
}

test("every problem, dish and language gets one to three steps with no blanks", () => {
  for (const doc of recipes) {
    for (const problem of PROBLEMS) {
      for (const locale of LOCALES) {
        const ctx = ctxFor(doc.slug, ["curd", "potato", "lemon", "sugar", "gram flour"], { missing: doc.ingredients[0]!.ingredient });
        const r = staticRescue(problem, ctx, cat, locale);
        assert.ok(r.steps.length >= 1 && r.steps.length <= MAX_STEPS, `${doc.slug} ${problem} ${locale}: ${r.steps.length} steps`);
        for (const s of r.steps) {
          assert.ok(s.trim().length > 10, `${doc.slug} ${problem} ${locale}: short step`);
          assert.ok(!s.includes("{"), `${doc.slug} ${problem} ${locale}: unfilled placeholder in "${s}"`);
        }
        assert.equal(r.source, "rules");
      }
    }
  }
});

test("fixes only name things in the kitchen", () => {
  // Nothing useful at home: the answer still works with water and what is on the stove.
  const bare = staticRescue("too_salty", ctxFor("dal-tadka", []), cat, "en");
  assert.deepEqual(bare.uses, []);
  assert.match(bare.steps[0]!, /hot water/);

  const stocked = staticRescue("too_salty", ctxFor("dal-tadka", ["curd", "potato"]), cat, "en");
  assert.deepEqual(stocked.uses, ["curd"]);
  assert.match(stocked.steps[0]!, /curd/);
  // The serving fallback survives when there are more fixes than room.
  assert.match(stocked.steps[stocked.steps.length - 1]!, /plain rice or roti/);

  const hindi = staticRescue("too_spicy", ctxFor("matar-paneer", ["curd"]), cat, "hi");
  assert.match(hindi.steps[0]!, /दही/);
});

test("dry and wet dishes get different fixes", () => {
  assert.equal(isWetDish(ctxFor("rajma", [])), true);
  assert.equal(isWetDish(ctxFor("besan-chilla", [])), false);
  assert.match(staticRescue("too_watery", ctxFor("rajma", []), cat, "en").steps[0]!, /lid off/);
  assert.match(staticRescue("too_watery", ctxFor("kanda-poha", []), cat, "en").steps[0]!, /water dries/);
  // Pulses and potatoes thicken their own gravy.
  assert.ok(staticRescue("too_watery", ctxFor("rajma", []), cat, "en").steps.some((s) => /Mash a few/.test(s)));
});

test("undercooked meat, egg and kidney beans always come from the playbook, with the safety line word for word", () => {
  const chicken = ctxFor("chicken-curry", []);
  assert.equal(mustUseRules("undercooked", chicken, cat), true);
  for (const locale of LOCALES) {
    const r = staticRescue("undercooked", chicken, cat, locale);
    assert.equal(r.safetyNote, SAFETY_PLAYBOOK.undercooked_meat[locale]);
  }
  assert.match(staticRescue("undercooked", chicken, cat, "en").steps.join(" "), /no pink inside/);

  const egg = ctxFor("egg-bhurji", []);
  assert.equal(mustUseRules("undercooked", egg, cat), true);
  assert.equal(staticRescue("undercooked", egg, cat, "en").safetyNote, SAFETY_PLAYBOOK.raw_egg.en);

  const rajma = ctxFor("rajma", []);
  assert.equal(mustUseRules("undercooked", rajma, cat), true);
  const r = staticRescue("undercooked", rajma, cat, "hinglish");
  assert.equal(r.safetyNote, SAFETY_PLAYBOOK.kidney_beans.hinglish);
  assert.match(r.steps[0]!, /seeti/);

  // Other dishes and other problems may go to the model.
  assert.equal(mustUseRules("undercooked", ctxFor("jeera-aloo", []), cat), false);
  assert.equal(mustUseRules("too_salty", chicken, cat), false);
  assert.equal(staticRescue("undercooked", ctxFor("jeera-aloo", []), cat, "en").safetyNote, null);
});

test("burning carries the oil-fire line; a bad smell carries the spoiled-food line", () => {
  const ctx = ctxFor("jeera-aloo", []);
  assert.deepEqual(safetyFor("burning", ctx, cat), ["oil_fire"]);
  assert.match(staticRescue("burning", ctx, cat, "en").steps[0]!, /heat off/);
  for (const details of ["the dal smells sour", "dahi kharab lag raha hai", "बदबू आ रही है"]) {
    assert.ok(safetyFor("too_thick", { ...ctx, details }, cat).includes("spoiled_food"), details);
  }
  assert.deepEqual(safetyFor("too_thick", { ...ctx, details: "bahut gaadha ho gaya" }, cat), []);
});

test("leftover rice dishes carry the rice storage line", () => {
  assert.equal(leftoverSafety(recipes.find((r) => r.slug === "moong-dal-khichdi")!.ingredients), "reheated_rice");
  assert.equal(leftoverSafety(recipes.find((r) => r.slug === "kanda-poha")!.ingredients), "reheated_rice");
  assert.equal(leftoverSafety(recipes.find((r) => r.slug === "matar-paneer")!.ingredients), null);
});

test("a missing ingredient: reviewed substitute, leave out, or stop", () => {
  const paneerDish = recipes.find((r) => r.slug === "matar-paneer")!;
  const withSub = paneerDish.ingredients.find((i) => (i.substitutes ?? []).length > 0)!;
  const sub = withSub.substitutes![0]!.ingredient;
  const swapped = staticRescue("missing_ingredient", ctxFor("matar-paneer", [sub], { missing: withSub.ingredient }), cat, "en");
  assert.deepEqual(swapped.uses, [sub]);
  assert.equal(missingResolved(ctxFor("matar-paneer", [sub], { missing: withSub.ingredient })), true);

  const garnish = paneerDish.ingredients.find((i) => i.role === "garnish" || i.optional)!;
  const dropped = staticRescue("missing_ingredient", ctxFor("matar-paneer", [], { missing: garnish.ingredient }), cat, "en");
  assert.match(dropped.steps[0]!, /Leave out/);

  // The main ingredient with nothing to replace it: say so, and stop the heat.
  const main = staticRescue("missing_ingredient", ctxFor("matar-paneer", [], { missing: "paneer" }), cat, "en");
  assert.match(main.steps[0]!, /heart of this dish|carry on without/);
  assert.equal(missingResolved(ctxFor("matar-paneer", [], { missing: "paneer" })), false);

  // Asked without saying which one.
  assert.match(staticRescue("missing_ingredient", ctxFor("matar-paneer", []), cat, "en").steps[0]!, /which ingredient/);
});

test("a model's fix is checked before it is shown", () => {
  const ctx = ctxFor("dal-tadka", ["curd", "lemon"]);
  assert.deepEqual(validateModelRescue({ steps: ["Stir in 2 chammach curd.", "Add a squeeze of lemon."], uses: ["curd", "lemon"] }, ctx), []);
  assert.ok(validateModelRescue({ steps: ["Add cream."], uses: ["cream"] }, ctx).some((p) => /not in the kitchen/.test(p)));
  assert.ok(validateModelRescue({ steps: ["a", "b", "c", "d"], uses: [] }, ctx).some((p) => /1 to 3 steps/.test(p)));
  assert.ok(validateModelRescue({ steps: [], uses: [] }, ctx).length > 0);
  assert.ok(validateModelRescue({ steps: ["It is fine if the chicken is still pink."], uses: [] }, ctx).some((p) => /unsafe/.test(p)));
  assert.ok(validateModelRescue({ steps: ["Pour water on the oil to cool it."], uses: [] }, ctx).some((p) => /unsafe/.test(p)));
  assert.ok(validateModelRescue({ steps: ["x".repeat(300)], uses: [] }, ctx).some((p) => /too long/.test(p)));
  // The missing ingredient itself can't be the fix.
  const missing = { ...ctx, missing: "toor dal" };
  assert.ok(validateModelRescue({ steps: ["Use toor dal."], uses: ["toor dal"] }, missing).length > 0);
});
