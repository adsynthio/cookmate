// KIT-180: ideas to use up leftovers. A leftover is known by what it is called ("Dal Tadka leftovers" saved after
// cooking, "leftover dal" typed in, "बचा हुआ राजमा"), so the kind of dish is read from the name in English, Hindi or
// Hinglish, and each kind has two or three quick, everyday ways to turn it into a new meal. Rice gets the food-safety
// line first: cooled fast, kept cold, eaten within a day and heated through only once.

import { dishKind, type DishKind } from "./ranking.ts";

export type LeftoverKind = DishKind;

export type LeftoverIdea =
  | "dalParatha"
  | "dalTadka"
  | "dalChilla"
  | "rajmaWrap"
  | "rajmaTikki"
  | "lemonRice"
  | "friedRice"
  | "curdRice"
  | "khichdiTikki"
  | "khichdiParatha"
  | "rotiNoodles"
  | "rotiChuri"
  | "stuffedParatha"
  | "toastie"
  | "curryWrap"
  | "curryPulao"
  | "kadhiChawal"
  | "kadhiPakora"
  | "pohaCutlet"
  | "anyWrap";

export function leftoverKind(name: string | null | undefined): LeftoverKind {
  return dishKind(name);
}

export const LEFTOVER_IDEAS: Record<LeftoverKind, LeftoverIdea[]> = {
  dal: ["dalParatha", "dalChilla", "dalTadka"],
  rajma: ["rajmaWrap", "rajmaTikki"],
  rice: ["lemonRice", "curdRice", "friedRice"],
  khichdi: ["khichdiTikki", "khichdiParatha"],
  roti: ["rotiNoodles", "rotiChuri"],
  sabzi: ["stuffedParatha", "toastie"],
  curry: ["curryWrap", "curryPulao"],
  kadhi: ["kadhiChawal", "kadhiPakora"],
  poha: ["pohaCutlet", "anyWrap"],
  other: ["anyWrap"],
};

/** Kinds whose leftovers need the rice safety line (Bacillus cereus spores survive cooking). */
export function needsRiceCare(kind: LeftoverKind): boolean {
  return kind === "rice" || kind === "khichdi";
}

/** Ideas for a pantry item, or none when it is not cooked food. */
export function ideasFor(item: { name: string; state: string }): { kind: LeftoverKind; ideas: LeftoverIdea[] } | null {
  if (item.state !== "leftover" && item.state !== "cooked") return null;
  const kind = leftoverKind(item.name);
  return { kind, ideas: LEFTOVER_IDEAS[kind] };
}

export type ReadyKey = "kadhiChawal" | "dalChawal" | "rajmaChawal" | "withRice" | "withRoti" | "heatEat";
export type ReadyMeal<T> = { key: ReadyKey; main: T; side: T | null };

/**
 * Dinner that is already cooked: the leftover dish going off soonest, with leftover rice or roti when there is
 * some ("kadhi and rice" is kadhi chawal). Plain rice or roti on their own are not a meal, so they give nothing.
 */
export function readyMeal<T extends { name: string; state: string; daysLeft?: number | null }>(items: readonly T[]): ReadyMeal<T> | null {
  const cooked = items.filter((i) => i.state === "leftover" || i.state === "cooked");
  const soonest = (a: T, b: T) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99);
  const main = cooked.filter((i) => !["rice", "roti", "other"].includes(leftoverKind(i.name))).sort(soonest)[0];
  if (!main) return null;
  const rice = cooked.filter((i) => leftoverKind(i.name) === "rice").sort(soonest)[0] ?? null;
  const roti = cooked.filter((i) => leftoverKind(i.name) === "roti").sort(soonest)[0] ?? null;
  const kind = leftoverKind(main.name);
  if (rice) {
    const key: ReadyKey = kind === "kadhi" ? "kadhiChawal" : kind === "dal" ? "dalChawal" : kind === "rajma" ? "rajmaChawal" : "withRice";
    return { key, main, side: rice };
  }
  if (roti) return { key: "withRoti", main, side: roti };
  return { key: "heatEat", main, side: null };
}
