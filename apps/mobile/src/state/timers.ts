// KIT-071: several labelled timers that keep time with the app closed. A timer is an end time, not a countdown, so
// it survives backgrounding; it is mirrored to a scheduled local notification (which the OS fires even if the app is
// killed) and saved on the device so a restart shows the same clocks.
import "expo-sqlite/localStorage/install";

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { create } from "zustand";

import type { Timer } from "@/domain/cooking";
import { t } from "@/i18n";
import { track } from "@/services/analytics";

export type RunningTimer = Timer & {
  sessionId: string;
  notificationId: string | null;
  /** Set once the in-app alarm has sounded, so it rings once. */
  rang?: boolean;
  /** What to check when it rings ("The onion is soft and golden."): said aloud and shown in the notification. */
  cue?: string;
};

const KEY = "cookmate.timers";
const CHANNEL = "cooking-timers";
/** A finished timer stays on screen until dismissed, but not for ever. */
const KEEP_DONE_MS = 60 * 60 * 1000;
const native = Platform.OS !== "web";

function load(): RunningTimer[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RunningTimer[]) : [];
    return list.filter((x) => x.endsAt > Date.now() - KEEP_DONE_MS);
  } catch {
    return [];
  }
}

function save(timers: RunningTimer[]) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(timers));
  } catch {
    // Storage full or unavailable: timers still run for this launch.
  }
}

if (native) {
  // Ring and show the banner even while the app is open on another screen.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Permission and the Android channel. Resolves false when notifications are off; asked again next time. */
async function prepare(): Promise<boolean> {
  if (!native) return false;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: t("cook.timer.channel"),
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 500, 250, 500, 250, 500],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

type TimerState = {
  timers: RunningTimer[];
  /** True after a timer was started without notification permission: it only rings while the app is open. */
  silent: boolean;
  start: (input: { sessionId: string; stepNo: number; label: string; durationSec: number; cue?: string }) => Promise<RunningTimer>;
  /** More time on a timer, running or already rung ("1 more minute"); negative takes time off. */
  extend: (id: string, sec: number) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  markRang: (id: string) => void;
  clearSession: (sessionId: string) => Promise<void>;
  /** Every timer, e.g. when the account is deleted. */
  clearAll: () => Promise<void>;
};

let seq = 0;

export const useTimers = create<TimerState>((set, get) => {
  const commit = (timers: RunningTimer[], extra?: Partial<TimerState>) => {
    save(timers);
    set({ timers, ...extra });
  };
  const unschedule = async (x: RunningTimer) => {
    if (!x.notificationId) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(x.notificationId);
    } catch {
      // Already fired or never scheduled.
    }
  };
  const schedule = async (x: { sessionId: string; label: string; cue?: string; endsAt: number }): Promise<string | null> => {
    if (!(await prepare())) return null;
    try {
      return await Notifications.scheduleNotificationAsync({
        content: { title: t("cook.timer.doneTitle", { label: x.label }), body: x.cue ?? t("cook.timer.doneBody"), sound: "default", data: { sessionId: x.sessionId } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, Math.round((x.endsAt - Date.now()) / 1000)),
          channelId: CHANNEL,
        },
      });
    } catch {
      return null;
    }
  };
  return {
    timers: load(),
    silent: false,
    start: async ({ sessionId, stepNo, label, durationSec, cue }) => {
      const endsAt = Date.now() + durationSec * 1000;
      track("timer_set", { session_id: sessionId, duration_sec: durationSec, channel: "touch" });
      const notificationId = await schedule({ sessionId, label, cue, endsAt });
      const timer: RunningTimer = { id: `${Date.now()}-${seq++}`, label, stepNo, durationSec, endsAt, sessionId, notificationId, ...(cue ? { cue } : {}) };
      commit([...get().timers, timer], { silent: native && notificationId === null });
      return timer;
    },
    extend: async (id, sec) => {
      const x = get().timers.find((y) => y.id === id);
      if (!x) return;
      await unschedule(x);
      // Taking time off never ends a timer in the past: at least a second is left.
      const endsAt = sec >= 0 ? Math.max(x.endsAt, Date.now()) + sec * 1000 : Math.max(x.endsAt + sec * 1000, Date.now() + 1000);
      const notificationId = await schedule({ ...x, endsAt });
      const next: RunningTimer = { ...x, endsAt, durationSec: Math.max(1, x.durationSec + sec), notificationId, rang: false };
      commit(get().timers.map((y) => (y.id === id ? next : y)));
    },
    cancel: async (id) => {
      const x = get().timers.find((y) => y.id === id);
      if (!x) return;
      commit(get().timers.filter((y) => y.id !== id));
      await unschedule(x);
    },
    markRang: (id) => commit(get().timers.map((y) => (y.id === id ? { ...y, rang: true } : y))),
    clearSession: async (sessionId) => {
      const gone = get().timers.filter((y) => y.sessionId === sessionId);
      commit(get().timers.filter((y) => y.sessionId !== sessionId));
      await Promise.all(gone.map(unschedule));
    },
    clearAll: async () => {
      const gone = get().timers;
      commit([]);
      await Promise.all(gone.map(unschedule));
    },
  };
});
