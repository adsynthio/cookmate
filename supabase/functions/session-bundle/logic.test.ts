import { assertEquals } from "jsr:@std/assert@1";

import { cachePath, stepVariants, variantHash } from "../tts-cache/logic.ts";
import { audioLanguage, type AudioRow, pickAudio, type StepWithNo, wantsCues, wordsFor } from "./logic.ts";

const step = (n: number, cue: string | null = "It smells nutty"): StepWithNo => ({
  id: `s${n}`,
  recipe_id: "r1",
  step_no: n,
  instruction: `Step ${n} text`,
  sensory_cue: cue,
  safety_note: n === 2 ? "Keep the lid ajar" : null,
});

async function row(s: StepWithNo, words: string, language = "hi-IN", voice = "default"): Promise<AudioRow> {
  const hash = await variantHash(words);
  return { step_id: s.id, language_code: language, voice_id: voice, variant_hash: hash, storage_path: cachePath(language, voice, s.id, hash) };
}

Deno.test("cues follow the voice agent: beginners and detail-lovers hear them, brief never", () => {
  assertEquals(wantsCues(null), true);
  assertEquals(wantsCues({ verbosity: "normal", skill_level: "beginner" }), true);
  assertEquals(wantsCues({ verbosity: "normal", skill_level: "expert" }), false);
  assertEquals(wantsCues({ verbosity: "detailed", skill_level: "expert" }), true);
  assertEquals(wantsCues({ verbosity: "brief", skill_level: "beginner" }), false);
});

Deno.test("Hinglish is spoken by the Hindi voice", () => {
  assertEquals(audioLanguage("hi-Latn-IN"), "hi-IN");
  assertEquals(audioLanguage("hi-IN"), "hi-IN");
  assertEquals(audioLanguage("en-IN"), "en-IN");
  assertEquals(audioLanguage("en"), "en-IN");
});

Deno.test("the words picked are one of the recorded variants, with the safety note either way", () => {
  const s = step(2);
  assertEquals(wordsFor(s, true), stepVariants(s)[0]);
  assertEquals(wordsFor(s, false), "Step 2 text. Keep the lid ajar.");
  assertEquals(wordsFor(step(3, null), true), "Step 3 text.");
});

Deno.test("each step gets the recording for this cook's words, language and voice, in step order", async () => {
  const steps = [step(2), step(1), step(3, null)];
  const cached = [
    await row(steps[0]!, wordsFor(steps[0]!, false)!),
    await row(steps[0]!, wordsFor(steps[0]!, true)!),
    await row(steps[1]!, wordsFor(steps[1]!, false)!),
    await row(steps[2]!, wordsFor(steps[2]!, false)!, "en-IN"),
  ];
  const expert = { verbosity: "normal", skill_level: "expert", tts_voice_id: null };
  const got = await pickAudio(steps, cached, { languageCode: "hi-Latn-IN", profile: expert });
  assertEquals(got.map((g) => g.step_no), [1, 2]);
  assertEquals(got[1]!.path, cached[0]!.storage_path);

  const beginner = { verbosity: "normal", skill_level: "beginner", tts_voice_id: null };
  const forBeginner = await pickAudio(steps, cached, { languageCode: "hi-IN", profile: beginner });
  assertEquals(forBeginner.map((g) => g.path), [cached[1]!.storage_path]);

  const otherVoice = await pickAudio(steps, cached, { languageCode: "hi-IN", profile: { ...expert, tts_voice_id: "meera" } });
  assertEquals(otherVoice, []);
});
