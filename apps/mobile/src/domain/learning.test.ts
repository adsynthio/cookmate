import assert from "node:assert/strict";
import { test } from "node:test";

import { feedbackCandidates } from "./learning.ts";

test("feedback tags become things to remember about this dish", () => {
  const c = feedbackCandidates(["too_spicy", "more_garlic"], true, "Dal Tadka", "en");
  assert.deepEqual(c.map((x) => x.statement), ["Less chilli in Dal Tadka next time", "Extra garlic in Dal Tadka next time", "Dal Tadka is a favourite: make it again"]);
  assert.deepEqual(c.map((x) => x.about), ["spice", "garlic", "favourite"]);
  assert.equal(c[0]!.polarity, -1);
});

test("the cook's language is used, and unknown tags are ignored", () => {
  assert.equal(feedbackCandidates(["more_garlic"], false, "दाल तड़का", "hi")[0]!.statement, "अगली बार दाल तड़का में लहसुन ज़्यादा");
  assert.equal(feedbackCandidates(["more_garlic"], false, "Dal Tadka", "hinglish")[0]!.statement, "Agli baar Dal Tadka mein lehsun zyada");
  assert.deepEqual(feedbackCandidates(["perfect", "???"], false, "Dal", "en"), []);
});

test("opposite tags about one subject keep the last one chosen", () => {
  const c = feedbackCandidates(["too_spicy", "not_spicy_enough"], false, "Dal", "en");
  assert.equal(c.length, 1);
  assert.equal(c[0]!.key, "not_spicy_enough");
});

import { amountChanges, parseNote, preferenceStatement, type AmountMemory } from "./learning.ts";

const NAMES: Record<string, string> = { lahsun: "garlic", garlic: "garlic", "लहसुन": "garlic", karela: "bitter gourd", namak: "salt", salt: "salt", paneer: "paneer", pyaz: "onion" };
const find = (text: string) => [...new Set(text.split(/[^\p{L}\p{M}]+/u).map((w) => NAMES[w]).filter((x): x is string => !!x))];
const family = [{ id: "m1", name: "Sunita" }, { id: "m2", name: "Riya" }];

test("typed notes: amounts in three languages", () => {
  assert.deepEqual(parseNote("Agli baar lahsun zyada", find), { kind: "amount", ingredientKey: "garlic", amount: "more", memberId: undefined });
  assert.deepEqual(parseNote("less salt please", find), { kind: "amount", ingredientKey: "salt", amount: "less", memberId: undefined });
  assert.deepEqual(parseNote("अगली बार लहसुन ज़्यादा", find), { kind: "amount", ingredientKey: "garlic", amount: "more", memberId: undefined });
  assert.equal(parseNote("namak kam", find).kind, "amount");
});

test("typed notes: likes and dislikes, about the person named", () => {
  assert.deepEqual(parseNote("Riya ko karela pasand nahi", find, family), { kind: "preference", ingredientKey: "bitter gourd", polarity: -1, memberId: "m2" });
  assert.deepEqual(parseNote("Sunita loves paneer", find, family), { kind: "preference", ingredientKey: "paneer", polarity: 1, memberId: "m1" });
  assert.equal((parseNote("allergic to paneer", find) as { polarity: number }).polarity, -1);
  // "kam" inside another word is not "less"; a dislike beats an amount word.
  assert.equal(parseNote("kamal ko paneer", find).kind, "plain");
  assert.equal((parseNote("doesn't like extra garlic", find) as { kind: string }).kind, "preference");
});

test("typed notes: anything unclear stays a plain note", () => {
  assert.equal(parseNote("Sunday ko late khana", find).kind, "plain");
  assert.equal(parseNote("more garlic and salt", find).kind, "plain"); // two ingredients: which one?
  assert.equal(parseNote("garlic", find).kind, "plain");
});

test("like and dislike sentences carry no gendered verb", () => {
  assert.equal(preferenceStatement("Riya", "karela", -1, "hinglish"), "Riya ko karela pasand nahi");
  assert.equal(preferenceStatement("Riya", "paneer", 1, "en"), "Riya loves paneer");
});

const mem = (over: Partial<AmountMemory>): AmountMemory => ({ statement: "s", about: null, polarity: 0, amount: null, ingredientKey: null, recipeId: null, ...over });

test("remembered amounts: general notes apply everywhere, dish notes only to that dish", () => {
  const memories = [
    mem({ statement: "more garlic", about: "amount", amount: "more", ingredientKey: "garlic" }),
    mem({ statement: "less salt in dal", about: "salt", polarity: -1, recipeId: "dal" }),
  ];
  const dal = amountChanges(memories, ["dal"]);
  assert.equal(dal.get("garlic")?.factor, 1.25);
  assert.equal(dal.get("salt")?.amount, "less");
  assert.equal(dal.get("black salt")?.factor, 0.75);
  const rajma = amountChanges(memories, ["rajma"]);
  assert.equal(rajma.get("garlic")?.amount, "more");
  assert.equal(rajma.has("salt"), false);
});

test("remembered amounts: the dish's own note wins, then the newest", () => {
  const memories = [
    mem({ statement: "newest general", about: "amount", amount: "less", ingredientKey: "garlic" }),
    mem({ statement: "older general", about: "amount", amount: "more", ingredientKey: "garlic" }),
    mem({ statement: "this dish", about: "garlic", polarity: 1, recipeId: "dal" }),
  ];
  assert.equal(amountChanges(memories, ["dal"]).get("garlic")?.statement, "this dish");
  assert.equal(amountChanges(memories, ["rajma"]).get("garlic")?.statement, "newest general");
  // Likes, dislikes and unrelated memories change nothing.
  assert.equal(amountChanges([mem({ polarity: -1, ingredientKey: "garlic", about: "preference" }), mem({ about: "favourite", polarity: 1, recipeId: "dal" })], ["dal"]).size, 0);
});
