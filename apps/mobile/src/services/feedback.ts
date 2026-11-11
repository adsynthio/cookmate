// Small physical feedback for Cook mode: a tick under the thumb and a spoken line. Every call is safe on devices
// (and the web build) where haptics or speech aren't available.
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";

import { speechRate, type Pace } from "@/domain/voiceStyle";
import { getLocale } from "@/i18n";

export function tick() {
  try {
    void Haptics.selectionAsync().catch(() => {});
  } catch {
    // No haptics here.
  }
}

export function buzz() {
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch {
    // No haptics here.
  }
}

/** Voice for the app's own strings in the current language (Hinglish is read by the Hindi voice). */
export function uiVoice(): string {
  return getLocale() === "en" ? "en-IN" : "hi-IN";
}

let rate = speechRate("normal");

/** KIT-068: the cook's chosen pace, used for everything the app reads aloud. */
export function setSpeechPace(pace: Pace) {
  rate = speechRate(pace);
}

export function say(text: string, options: { language?: string; onEnd?: () => void } = {}) {
  const { language = uiVoice(), onEnd } = options;
  try {
    Speech.stop();
    Speech.speak(text, { language, rate, onDone: onEnd, onStopped: onEnd, onError: onEnd });
  } catch {
    onEnd?.();
  }
}

export function hush() {
  try {
    Speech.stop();
  } catch {
    // Nothing was speaking.
  }
}
