// The same phrases as services/voice-agent/tests/test_fast_path.py: the phone and the agent must agree.
import assert from "node:assert/strict";
import { test } from "node:test";

import { match } from "./fastPath.ts";

test("commands in Hindi, Hinglish and English", () => {
  const cases: [string, string | null][] = [
    ["Agla batao", "next"], ["agla step", "next"], ["ho gaya", "next"], ["हो गया", "next"], ["next", "next"], ["acha, agla", "next"],
    ["pichla wala phir se", null], ["pichla wala", "back"], ["पिछला", "back"], ["phir se bolo", "repeat"], ["फिर से", "repeat"],
    ["thoda dheere bolo", "slower"], ["ruko", "pause"], ["रुको", "pause"], ["chalo", "resume"], ["sab ho gaya", "done"],
    ["khana ban gaya", "done"], ["ek seeti hui", "whistle"], ["सीटी आई", "whistle"], ["kitna time bacha hai?", "timer_check"],
    ["कितना समय बचा है", "timer_check"],
  ];
  for (const [said, command] of cases) assert.equal(match(said)?.command ?? null, command, said);
});

test("questions and problems are not commands", () => {
  for (const said of ["agle step mein kitna namak daalna hai", "namak zyada ho gaya!", "tamatar nahi hai", "paneer ki jagah kya daal sakte hain", ""]) {
    assert.equal(match(said), null, said);
  }
});

test("timers with minutes and an optional label", () => {
  const cases: [string, number, string | null][] = [
    ["dal ke liye das minute ka timer laga do", 10, "dal"],
    ["10 minute ka timer", 10, null],
    ["पाँच मिनट का टाइमर लगा दो", 5, null],
    ["set a fifteen minute timer", 15, null],
    ["set a rice fifteen minute timer", 15, "rice"],
    ["chawal ke liye ek ghante ka timer", 60, "chawal"],
    ["aadha minute ka timer", 0.5, null],
    ["चावल के लिए दस मिनट का टाइमर", 10, "चावल"],
  ];
  for (const [said, minutes, label] of cases) {
    const m = match(said);
    assert.equal(m?.command, "timer_set", said);
    assert.equal(m?.minutes, minutes, said);
    assert.equal(m?.label, label, said);
  }
});
