// U2: the one way the app says a cooking time ("35 min", "2 hr 30 min", "Soak overnight + 35 min") in every language.
import { durationParts, overnightSoak } from "@/domain/duration";

import { t } from "./index";

export function minutesText(minutes: number): string {
  const p = durationParts(minutes);
  if (p.kind === "min") return t("time.min", { n: p.n });
  if (p.kind === "hr") return t("time.hr", { n: p.n });
  return t("time.hrMin", { h: p.h, m: p.m });
}

/** A recipe's time; an overnight soak is said apart ("Soak overnight + 35 min"). */
export function recipeTimeText(doc: Parameters<typeof overnightSoak>[0]): string {
  const soak = overnightSoak(doc);
  if (soak) return t("time.soakPlus", { rest: minutesText(soak.activeMin) });
  return minutesText((doc.prep_time_min ?? 0) + (doc.cook_time_min ?? 0));
}
