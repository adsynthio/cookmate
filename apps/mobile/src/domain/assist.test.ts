import assert from "node:assert/strict";
import { test } from "node:test";

import { answerSafety, changeReply, cleanNotes, fallbackAnswer, notesForStep, validateAnswer } from "./assist.ts";
import { SAFETY_PLAYBOOK } from "./rescue.ts";

const step = { text: "Simmer the dal.", cue: "It coats the back of a spoon.", safety: undefined };
const meat = { text: "Simmer the chicken.", cue: undefined, safety: "Cook the chicken until no pink remains." };

test("without a model the answer is the step's own cue, or the step again", () => {
  assert.equal(fallbackAnswer(step, "kab tak pakana hai?", "en").answer, "Here is how to tell: It coats the back of a spoon.");
  assert.match(fallbackAnswer(meat, "how long?", "hi").answer, /स्टेप यह कहता है: Simmer the chicken\./);
  assert.equal(fallbackAnswer(step, "x", "en").source, "rules");
});

test("a step's safety note goes with every answer, word for word", () => {
  assert.equal(answerSafety(meat, "can I eat it now?", "en"), "Cook the chicken until no pink remains.");
  assert.equal(answerSafety(step, "can I eat it now?", "en"), null);
  assert.equal(answerSafety(step, "the dal smells sour", "hinglish"), SAFETY_PLAYBOOK.spoiled_food.hinglish);
  assert.equal(answerSafety(meat, "badbu aa rahi hai", "en"), `Cook the chicken until no pink remains. ${SAFETY_PLAYBOOK.spoiled_food.en}`);
});

test("a model's answer is checked before it is shown", () => {
  assert.deepEqual(validateAnswer("Stir for two more minutes."), []);
  assert.ok(validateAnswer("  ").length > 0);
  assert.ok(validateAnswer("x".repeat(500)).length > 0);
  assert.ok(validateAnswer("It is fine if it is still pink inside.").length > 0);
});

test("notes are kept only for steps still ahead, one per step, at most three", () => {
  const notes = [
    { step: 2, note: "already done" },
    { step: 3, note: "Keep the heat medium." },
    { step: 3, note: "second note for the same step" },
    { step: 4, note: "  " },
    { step: 5, note: "Skip the boil to save time: no need to boil." },
    { step: 6, note: "Add salt at the end." },
    { step: 9, note: "no such step" },
    { step: 4.5, note: "not a step" },
  ];
  assert.deepEqual(cleanNotes(notes, 2, 6), [
    { step: 3, note: "Keep the heat medium." },
    { step: 6, note: "Add salt at the end." },
  ]);
  assert.equal(cleanNotes([3, 4, 5, 6].map((s) => ({ step: s, note: "ok note" })), 2, 6).length, 3);
});

test("the reply says whether later steps changed, and notes surface on their step", () => {
  assert.match(changeReply([], "en"), /stay as written/);
  assert.match(changeReply([{ step: 3, note: "x" }], "en"), /reminder/);
  const mods = [{ change: "used oil instead of ghee", notes: [{ step: 3, note: "Keep the heat medium." }] }, { change: "more water" }];
  assert.deepEqual(notesForStep(mods, 3), [{ change: "used oil instead of ghee", note: "Keep the heat medium." }]);
  assert.deepEqual(notesForStep(mods, 4), []);
});
