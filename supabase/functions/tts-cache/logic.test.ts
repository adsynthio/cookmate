import { assertEquals } from "jsr:@std/assert@1";

import { cachePath, decodeAudios, plan, sarvamBody, stepVariants, variantHash, type StepRow } from "./logic.ts";

const step = (over: Partial<StepRow>): StepRow => ({ id: "s1", recipe_id: "r1", instruction: "Heat ghee and add cumin", sensory_cue: null, safety_note: null, ...over });

Deno.test("step words match the voice agent, safety in every variant", async () => {
  const s = step({ sensory_cue: "until the seeds crackle", safety_note: "Keep the lid ajar." });
  assertEquals(stepVariants(s), [
    "Heat ghee and add cumin. until the seeds crackle. Keep the lid ajar.",
    "Heat ghee and add cumin. Keep the lid ajar.",
  ]);
  assertEquals(stepVariants(step({})), ["Heat ghee and add cumin."]);
  assertEquals(stepVariants(step({ instruction: "  " })), []);
  // Pinned in services/voice-agent/tests/test_style.py too: both sides must give the same key.
  assertEquals(await variantHash("Heat ghee and add cumin. Keep the lid ajar."), "819b4c4e362c3c0f");
});

Deno.test("plan skips what is recorded and stops at the limit", async () => {
  const steps = [step({ id: "a", sensory_cue: "till golden" }), step({ id: "b" })];
  const all = await plan(steps, [], { limit: 100 });
  assertEquals(all.length, 6); // a: 2 variants x 2 languages, b: 1 x 2
  const done = all.slice(0, 3).map((j) => ({ step_id: j.stepId, language_code: j.language, voice_id: j.voiceId, variant_hash: j.hash }));
  const rest = await plan(steps, done, { limit: 100 });
  assertEquals(rest.length, 3);
  assertEquals((await plan(steps, [], { limit: 2 })).length, 2);
  assertEquals(all[0]!.path, cachePath("hi-IN", "default", "a", all[0]!.hash));
  assertEquals((await plan(steps, [], { limit: 100, languages: ["en-IN"] })).every((j) => j.language === "en-IN"), true);
});

Deno.test("sarvam request and response", () => {
  const job = { recipeId: "r", stepId: "s", language: "hi-IN", voiceId: "default", text: "Heat.", hash: "h", path: "p" };
  assertEquals(sarvamBody(job, "bulbul:v3"), {
    target_language_code: "hi-IN", text: "Heat.", pace: 1, speech_sample_rate: 22050, model: "bulbul:v3", output_audio_codec: "mp3",
  });
  assertEquals((sarvamBody({ ...job, voiceId: "anushka" }, "bulbul:v3") as { speaker: string }).speaker, "anushka");
  assertEquals(decodeAudios([btoa("ab"), btoa("c")]), new TextEncoder().encode("abc"));
  assertEquals(decodeAudios([]), null);
  assertEquals(decodeAudios("nope"), null);
});
