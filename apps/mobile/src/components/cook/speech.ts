// The phone's speech recogniser, when this build has it. Expo Go (and any build without the native module) has
// none: hands-free cooking then reports "unavailable" instead of crashing the cook screen on open.
import type * as Speech from "expo-speech-recognition";

let mod: typeof Speech | null = null;
try {
  mod = require("expo-speech-recognition") as typeof Speech;
} catch {
  mod = null;
}

export const SpeechModule = mod?.ExpoSpeechRecognitionModule ?? null;

/** Listens to a recogniser event; does nothing when the build has no recogniser (fixed per build, so hook order holds). */
export const useSpeechEvent: typeof Speech.useSpeechRecognitionEvent = mod
  ? mod.useSpeechRecognitionEvent
  : () => {};
