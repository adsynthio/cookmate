// KIT-071: several labelled timers that keep time with the app closed. A timer is an end time, not a countdown, so
// it survives backgrounding; it is mirrored to a scheduled local notification (which the OS fires even if the app is
// killed) and saved on the device so a restart shows the same clocks.
import "expo-sqlite/localStorage/install";

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { create } from "zustand";

import type { Timer } from "@/domain/cooking";
import { t } from "@/i18n";

export type RunningTimer = Timer & {
  sessionId: string;
  notificationId: string | null;
  /** Set once the in-app alarm has sounded, so it rings once. */
  rang?: boolean;
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
  start: (input: { sessionId: string; stepNo: number; label: string; durationSec: number }) => Promise<RunningTimer>;
  cancel: (id: string) => Promise<void>;
  markRang: (id: string) => void;
  clearSession: (sessionId: string) => Promise<void>;
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
  return {
    timers: load(),
    silent: false,
    start: async ({ sessionId, stepNo, label, durationSec }) => {
      const endsAt = Date.now() + durationSec * 1000;
      let notificationId: string | null = null;
      const allowed = await prepare();
      if (allowed) {
        try {
          notificationId = await Notifications.scheduleNotificationAsync({
            content: { title: t("cook.timer.doneTitle", { label }), body: t("cook.timer.doneBody"), sound: "default", data: { sessionId } },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: Math.max(1, Math.round((endsAt - Date.now()) / 1000)),
              channelId: CHANNEL,
            },
          });
        } catch {
          notificationId = null;
        }
      }
      const timer: RunningTimer = { id: `${Date.now()}-${seq++}`, label, stepNo, durationSec, endsAt, sessionId, notificationId };
      commit([...get().timers, timer], { silent: native && notificationId === null });
      return timer;
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
  };
});
