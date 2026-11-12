/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  avoidStatement,
  buildMembers,
  checkMembers,
  consentRows,
  type DraftMember,
  householdName,
  localeFromLanguageCode,
  LANGUAGE_CODES,
  spiceFor,
} from "./onboarding.ts";

const me: DraftMember = { key: "1", displayName: " Sunita ", ageGroup: "adult", isSelf: true };
const kid: DraftMember = { key: "2", displayName: "Aarav", ageGroup: "child", isSelf: false };

test("members: self required, names required, at most six", () => {
  assert.equal(checkMembers([]), "self_missing");
  assert.equal(checkMembers([kid]), "self_missing");
  assert.equal(checkMembers([me, kid]), "none");
  assert.equal(checkMembers([me, { ...kid, displayName: "  " }]), "name_missing");
  assert.equal(checkMembers([me, { ...kid, displayName: "x".repeat(41) }]), "name_too_long");
  const seven = Array.from({ length: 7 }, (_, i) => ({ ...kid, key: String(i) }));
  assert.equal(checkMembers([me, ...seven.slice(1)]), "too_many");
  assert.equal(checkMembers([me, ...seven.slice(2)]), "none");
});

test("children start mild; everyone else gets the household spice", () => {
  assert.equal(spiceFor("child", 5), 2);
  assert.equal(spiceFor("child", 1), 1);
  assert.equal(spiceFor("elder", 4), 4);
  const built = buildMembers([me, kid], 4, "veg");
  assert.deepEqual(built, [
    { displayName: "Sunita", ageGroup: "adult", diet: "veg", spice: 4, isSelf: true, preferredCuisines: [], maxTimeMin: null },
    { displayName: "Aarav", ageGroup: "child", diet: "veg", spice: 2, isSelf: false, preferredCuisines: [], maxTimeMin: null },
  ]);
});

test("the household's cuisines and weekday time go to every member; quick means 30 minutes", () => {
  const built = buildMembers([me, kid], 3, "veg", { cuisines: ["punjabi", "gujarati"], pace: "quick" });
  assert.deepEqual(built.map((m) => [m.preferredCuisines, m.maxTimeMin]), [
    [["punjabi", "gujarati"], 30],
    [["punjabi", "gujarati"], 30],
  ]);
  assert.equal(buildMembers([me], 3, "veg", { pace: "relaxed" })[0]!.maxTimeMin, null);
});

test("dislikes and allergies read plainly in each language", () => {
  assert.equal(avoidStatement("peanuts", "allergy", "en"), "Allergic to peanuts: never use it");
  assert.equal(avoidStatement("karela", "dislike", "hinglish"), "Humein karela pasand nahi: ise na daalein");
});

test("household name uses the cook's name", () => {
  assert.equal(householdName([me, kid], "{name}'s kitchen"), "Sunita's kitchen");
});

test("every purpose asked is recorded, unticked means not granted", () => {
  assert.deepEqual(consentRows({ voice_processing: true }), [
    { purpose: "voice_processing", granted: true },
    { purpose: "memory", granted: false },
    { purpose: "analytics", granted: false },
  ]);
});

test("language codes round-trip to UI locales", () => {
  for (const [locale, code] of Object.entries(LANGUAGE_CODES)) {
    assert.equal(localeFromLanguageCode(code), locale);
  }
  assert.equal(localeFromLanguageCode("ta-IN"), null);
});
