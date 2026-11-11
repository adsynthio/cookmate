// KIT-076/084: the step recordings this cook would hear, downloaded to the phone when cooking starts so steps can be
// read aloud in the cook's voice with no network. Plays a recording when there is one for the step; otherwise the
// caller falls back to the phone's own speech (expo-speech works offline too).
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { getBundle, putBundle } from "./bundles";

const native = Platform.OS !== "web";
let player: AudioPlayer | null = null;

function dirFor(sessionId: string): Directory {
  return new Directory(Paths.cache, "step-audio", sessionId);
}

/** Downloads each recording once. Failures are skipped: that step is read by the phone's voice instead. */
export async function downloadStepAudio(sessionId: string, audio: { stepNo: number; url: string }[]): Promise<number> {
  const kept: Record<number, string> = { ...(getBundle(sessionId)?.audio ?? {}) };
  let saved = 0;
  if (native) {
    const dir = dirFor(sessionId);
    try {
      if (!dir.exists) dir.create({ intermediates: true });
    } catch {
      return 0;
    }
    for (const a of audio) {
      const file = new File(dir, `${a.stepNo}.mp3`);
      try {
        if (!file.exists) await File.downloadFileAsync(a.url, file);
        kept[a.stepNo] = file.uri;
        saved++;
      } catch {
        // Keep going; this step falls back to the phone's voice.
      }
    }
  } else {
    // The web build has no file store; the browser's own cache keeps what it played.
    for (const a of audio) kept[a.stepNo] = a.url;
    saved = audio.length;
  }
  putBundle(sessionId, { audio: kept });
  return saved;
}

export function removeStepAudio(sessionId: string) {
  if (!native) return;
  try {
    const dir = dirFor(sessionId);
    if (dir.exists) dir.delete();
  } catch {
    // Already gone; the cache directory is cleared by the OS anyway.
  }
}

export function stopStepAudio() {
  try {
    player?.remove();
  } catch {
    // Already released.
  }
  player = null;
}

/** Plays this step's recording. False when there is none (or it can't play), so the caller speaks it instead. */
export function playStepAudio(sessionId: string, stepNo: number, opts: { rate?: number; onEnd?: () => void } = {}): boolean {
  const source = getBundle(sessionId)?.audio[stepNo];
  if (!source) return false;
  stopStepAudio();
  try {
    const p = createAudioPlayer(source);
    player = p;
    if (opts.rate && opts.rate !== 1) p.setPlaybackRate(opts.rate);
    const sub = p.addListener("playbackStatusUpdate", (s) => {
      if (s.didJustFinish) {
        sub.remove();
        if (player === p) stopStepAudio();
        opts.onEnd?.();
      }
    });
    p.play();
    return true;
  } catch {
    stopStepAudio();
    return false;
  }
}
