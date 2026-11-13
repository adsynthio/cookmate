// KIT-084 (VOICE-12): hands-free cooking that keeps working with no network. The phone's own recogniser listens
// (on the device when it can, so nothing leaves the phone and no connection is needed) and the fast-path matcher
// turns what it hears into next / back / repeat / slower / pause / timers / whistles. Listening pauses while the
// phone is speaking, so it never hears itself.
import { useCallback, useEffect, useRef, useState } from "react";

import { SpeechModule, useSpeechEvent } from "./speech";
import { HINT_PHRASES, match, type FastPathMatch } from "@/domain/fastPath";

export type HandsFreeState = "off" | "listening" | "unavailable" | "denied";

function available(): boolean {
  try {
    return SpeechModule?.isRecognitionAvailable() ?? false;
  } catch {
    return false;
  }
}

function onDevice(): boolean {
  try {
    return SpeechModule?.supportsOnDeviceRecognition() ?? false;
  } catch {
    return false;
  }
}

export function useHandsFree(opts: {
  lang: string;
  /** False while the phone is reading aloud. */
  paused: boolean;
  onCommand: (m: FastPathMatch) => void;
  onUnknown: (heard: string) => void;
}) {
  const [state, setState] = useState<HandsFreeState>("off");
  const handlers = useRef(opts);
  handlers.current = opts;
  const running = useRef(false);

  const begin = useCallback(() => {
    if (running.current) return;
    running.current = true;
    try {
      SpeechModule!.start({
        lang: handlers.current.lang,
        interimResults: false,
        continuous: true,
        requiresOnDeviceRecognition: onDevice(),
        contextualStrings: HINT_PHRASES,
        addsPunctuation: false,
      });
    } catch {
      running.current = false;
      setState("unavailable");
    }
  }, []);

  const end = useCallback(() => {
    if (!running.current) return;
    running.current = false;
    try {
      SpeechModule!.abort();
    } catch {
      // Already stopped.
    }
  }, []);

  useSpeechEvent("result", (e) => {
    if (!e.isFinal) return;
    const heard = e.results[0]?.transcript?.trim() ?? "";
    if (!heard) return;
    const m = match(heard);
    if (m) handlers.current.onCommand(m);
    else handlers.current.onUnknown(heard);
  });
  // Recognisers stop on silence even when asked to keep going: start again while hands-free is on.
  useSpeechEvent("end", () => {
    running.current = false;
    if (state === "listening" && !handlers.current.paused) begin();
  });
  useSpeechEvent("error", (e) => {
    running.current = false;
    if (e.error === "not-allowed") setState("denied");
    else if (e.error === "service-not-allowed" || e.error === "language-not-supported") setState("unavailable");
  });

  useEffect(() => {
    if (state !== "listening") return;
    if (opts.paused) end();
    else begin();
  }, [state, opts.paused, begin, end]);

  useEffect(() => () => end(), [end]);

  const toggle = useCallback(async () => {
    if (state === "listening") {
      end();
      setState("off");
      return;
    }
    if (!available()) {
      setState("unavailable");
      return;
    }
    try {
      const p = await SpeechModule!.requestPermissionsAsync();
      if (!p.granted) {
        setState("denied");
        return;
      }
    } catch {
      setState("unavailable");
      return;
    }
    setState("listening");
  }, [state, end]);

  return { state, toggle };
}
