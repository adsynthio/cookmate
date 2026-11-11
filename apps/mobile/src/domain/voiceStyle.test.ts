import assert from "node:assert/strict";
import { test } from "node:test";

import { indianMobile, maskPhone, speechRate, stepWords, wantsCues } from "./voiceStyle.ts";

const STEP = { text: "Heat ghee and add cumin", cue: "until the seeds crackle", safety: "Keep the lid ajar." };

test("step words match the voice agent", () => {
  // Same words as services/voice-agent/tests/test_style.py, so cached recordings are found.
  assert.equal(stepWords(STEP, { skill: "beginner", verbosity: "normal" }), "Heat ghee and add cumin. until the seeds crackle. Keep the lid ajar.");
  assert.equal(stepWords(STEP, { skill: "expert", verbosity: "normal" }), "Heat ghee and add cumin. Keep the lid ajar.");
  assert.equal(stepWords({ text: "Serve" }, { skill: "beginner", verbosity: "normal" }), "Serve.");
});

test("brief never drops safety; detail brings cues back for confident cooks", () => {
  assert.equal(wantsCues({ skill: "beginner", verbosity: "brief" }), false);
  assert.match(stepWords(STEP, { skill: "beginner", verbosity: "brief" }), /Keep the lid ajar\.$/);
  assert.equal(wantsCues({ skill: "confident", verbosity: "detailed" }), true);
  assert.equal(wantsCues({ skill: "confident", verbosity: "normal" }), false);
});

test("pace sets the read-aloud rate", () => {
  assert.ok(speechRate("slow") < speechRate("normal") && speechRate("normal") < speechRate("fast"));
});

test("Indian mobile numbers as people type them", () => {
  assert.equal(indianMobile("98765 43210"), "+919876543210");
  assert.equal(indianMobile("+91-98765-43210"), "+919876543210");
  assert.equal(indianMobile("098765 43210"), "+919876543210");
  assert.equal(indianMobile("12345 67890"), null); // mobiles start 6-9
  assert.equal(indianMobile("98765"), null);
  assert.equal(maskPhone("+919876543210"), "+91 98••• ••210");
});
