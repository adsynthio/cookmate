import assert from "node:assert/strict";
import { test } from "node:test";

import { intentOf, localAnswer, wantsMild, type AskItem, type AskRecipe } from "./ask.ts";

test("everyday questions are recognised in English, Hinglish and Hindi", () => {
  assert.deepEqual(intentOf("What can I make in 20 minutes?"), { kind: "make", minutes: 20 });
  assert.deepEqual(intentOf("aaj kya banau?"), { kind: "make", minutes: null });
  assert.deepEqual(intentOf("क्या बना सकते हैं"), { kind: "make", minutes: null });
  assert.equal(intentOf("What's going off soon?").kind, "soon");
  assert.equal(intentOf("kya kharab hone wala hai").kind, "soon");
  assert.equal(intentOf("ideas for my leftovers").kind, "leftovers");
  assert.equal(intentOf("बचा हुआ खाना").kind, "leftovers");
  assert.deepEqual(intentOf("Do I have paneer?"), { kind: "have", item: "paneer" });
  assert.deepEqual(intentOf("paneer hai kya"), { kind: "have", item: "paneer" });
  assert.equal(intentOf("tell me a joke").kind, "other");
});

const items: AskItem[] = [
  { name: "Paneer", key: "paneer", daysLeft: 1, state: "raw", out: false },
  { name: "Green peas", key: "green peas", daysLeft: 5, state: "raw", out: false },
  { name: "Tomato", key: "tomato", daysLeft: 3, state: "raw", out: false },
  { name: "leftover rice", key: null, daysLeft: 1, state: "leftover", out: false },
];
const recipes: AskRecipe[] = [
  { slug: "matar-paneer", title: "Matar Paneer", minutes: 35, ingredients: [{ key: "paneer" }, { key: "green peas" }, { key: "tomato" }, { key: "salt" }, { key: "cream", optional: true }] },
  { slug: "rajma", title: "Rajma", minutes: 60, ingredients: [{ key: "kidney beans" }, { key: "onion" }, { key: "tomato" }] },
];
const ask = (question: string, locale: "en" | "hi" | "hinglish" = "en") =>
  localAnswer({ question, items, recipes, staples: new Set(["salt"]), locale, nameOf: (k) => k });

test("answers come from the kitchen", () => {
  const make = ask("What can I make?");
  assert.deepEqual(make.recipes.map((r) => r.slug), ["matar-paneer"]);
  assert.match(make.answer, /Matar Paneer/);
  // Nothing that quick: the quickest dish the kitchen can make instead.
  assert.match(ask("What can I make in 20 minutes?").answer, /^Nothing is quite that quick/);
  assert.match(ask("What's going off soon?").answer, /Paneer/);
  assert.deepEqual(ask("What's going off soon?").recipes.map((r) => r.slug), ["matar-paneer"]);
  assert.match(ask("leftovers?").answer, /leftover rice/);
  assert.match(ask("Do I have paneer?").answer, /^Yes/);
  assert.deepEqual(ask("Do I have curd?").addToList, ["curd"]);
  assert.match(ask("paneer hai kya", "hi").answer, /हाँ/);
});

test("nothing that quick: the quickest dish instead, and the question isn't offered back", () => {
  const items: AskItem[] = [{ name: "Potato", key: "potato", daysLeft: null, state: "raw", out: false }];
  const recipes: AskRecipe[] = [{ slug: "jeera-aloo", title: "Jeera Aloo", minutes: 25, ingredients: [{ key: "potato" }, { key: "cumin seeds" }] }];
  const r = localAnswer({ question: "What can I make in 20 minutes?", items, recipes, staples: new Set(["cumin seeds"]), locale: "en", nameOf: (k) => k });
  assert.equal(r.answer, "Nothing is quite that quick. The quickest you can make is Jeera Aloo, in about 25 minutes.");
  assert.deepEqual(r.recipes, [{ slug: "jeera-aloo", title: "Jeera Aloo" }]);
  assert.ok(!r.followUps.includes("What can I make in 20 minutes?"));
});

test("named ingredients and 'not spicy' shape the answer", () => {
  for (const q of ["My son doesnt like spicy food", "I dont eat spicy too much", "kam teekha chahiye", "तीखा नहीं", "something mild"]) assert.ok(wantsMild(q), q);
  assert.ok(!wantsMild("make it spicy"));
  const kitchen: AskItem[] = [
    { name: "Paneer", key: "paneer", daysLeft: 3, state: "raw", out: false },
    { name: "Spinach", key: "spinach", daysLeft: 2, state: "raw", out: false },
    { name: "Chicken", key: "chicken", daysLeft: 2, state: "raw", out: false },
    { name: "Onion", key: "onion", daysLeft: 9, state: "raw", out: false },
  ];
  const dishes: AskRecipe[] = [
    { slug: "chicken-curry", title: "Chicken Curry", minutes: 40, spice: 3, ingredients: [{ key: "chicken" }, { key: "onion" }] },
    { slug: "palak-paneer", title: "Palak Paneer", minutes: 30, spice: 2, ingredients: [{ key: "paneer" }, { key: "spinach" }, { key: "onion" }] },
    { slug: "paneer-tikka", title: "Paneer Tikka", minutes: 25, spice: 4, ingredients: [{ key: "paneer" }, { key: "onion" }] },
  ];
  const r = localAnswer({
    question: "My son doesnt like spicy food what can i make with paneer and spinach",
    items: kitchen, recipes: dishes, staples: new Set(), locale: "en", nameOf: (k) => k, named: ["paneer", "spinach"],
  });
  assert.deepEqual(r.recipes.map((x) => x.slug), ["palak-paneer"]);
  assert.equal(r.answer, "With paneer and spinach, Palak Paneer would work well. It's mild.");
  // Naming an ingredient alone is enough to ask what to make with it.
  const corn = localAnswer({ question: "paneer, not spicy", items: kitchen, recipes: dishes, staples: new Set(), locale: "hinglish", nameOf: (k) => k, named: ["paneer"] });
  assert.deepEqual(corn.recipes.map((x) => x.slug), ["palak-paneer"]);
});
