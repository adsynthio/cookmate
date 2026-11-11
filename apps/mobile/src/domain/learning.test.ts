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
