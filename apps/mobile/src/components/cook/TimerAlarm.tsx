// KIT-071: the in-app half of a timer alarm. The OS notification rings when the app is closed; while it is open,
// on any tab, this speaks the timer's name and buzzes once. Mounted in the root layout.
import { useEffect } from "react";

import { t } from "@/i18n";
import { buzz, say } from "@/services/feedback";
import { useTimers } from "@/state/timers";

import { useNow } from "./useNow";

/** A timer that ended this long ago rang while the app was closed: the notification already did the job. */
const STALE_MS = 15_000;

export function TimerAlarm() {
  const timers = useTimers((s) => s.timers);
  const markRang = useTimers((s) => s.markRang);
  const now = useNow(timers.some((x) => !x.rang), 1000);

  useEffect(() => {
    for (const x of timers) {
      if (x.rang || x.endsAt > now) continue;
      markRang(x.id);
      if (now - x.endsAt < STALE_MS) {
        buzz();
        // The step's cue tells the cook what to check now, so they don't have to look at the phone.
        say([t("cook.timer.doneTitle", { label: x.label }), x.cue].filter(Boolean).join(". "));
      }
    }
  }, [now, timers, markRang]);

  return null;
}
