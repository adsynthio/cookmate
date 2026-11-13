// What the kitchen can do at once. A gas stove has a number of burners; an induction cooks one pan at a time; and
// some machines can't run together (one socket, or the switch trips when the induction and the air fryer are both on).
// The cook screen uses this to say "your air fryer is still on, do this step on gas" before the switch trips.
// Saved in each tool's details. No React, no network.
import type { Tool, ToolKey } from "./tools";

const has = (tools: Tool[] | null | undefined, key: ToolKey) => !!tools?.some((t) => t.type === key);

/** Machines that pull a lot of power; these are the ones that may not run together. */
export const ELECTRIC: ToolKey[] = ["induction", "air_fryer", "otg", "microwave"];

/** Most Indian gas stoves have two burners; asked, not assumed, once the cook says. */
export const DEFAULT_BURNERS = 2;

export function burners(tools: Tool[] | null | undefined): number {
  return tools?.find((t) => t.type === "gas_stove")?.details?.burners ?? DEFAULT_BURNERS;
}

export function setBurners(tools: Tool[], n: number): Tool[] {
  return tools.map((t) => (t.type === "gas_stove" ? { ...t, details: { ...t.details, burners: n } } : t));
}

/** Every pair of power-hungry machines the household has, to ask whether they can run together. */
export function electricPairs(tools: Tool[]): [ToolKey, ToolKey][] {
  const owned = ELECTRIC.filter((k) => has(tools, k));
  const pairs: [ToolKey, ToolKey][] = [];
  owned.forEach((a, i) => owned.slice(i + 1).forEach((b) => pairs.push([a, b])));
  return pairs;
}

/** True when the cook said these two can't run at the same time. */
export function clash(tools: Tool[] | null | undefined, a: ToolKey, b: ToolKey): boolean {
  const notWith = (x: ToolKey, y: ToolKey) => !!tools?.find((t) => t.type === x)?.details?.notWith?.includes(y);
  return notWith(a, b) || notWith(b, a);
}

/** Records (on both tools) whether a and b can run together. */
export function setClash(tools: Tool[], a: ToolKey, b: ToolKey, on: boolean): Tool[] {
  const update = (t: Tool, other: ToolKey): Tool => {
    const rest = (t.details?.notWith ?? []).filter((k) => k !== other);
    const notWith = on ? [...rest, other] : rest;
    const { notWith: _drop, ...details } = t.details ?? {};
    return { ...t, details: notWith.length ? { ...details, notWith } : details };
  };
  return tools.map((t) => (t.type === a ? update(t, b) : t.type === b ? update(t, a) : t));
}

/** What a cooking step runs on. */
export type Device = "gas" | "induction" | "air_fryer";
/** Something already running for another step (from its timer). */
export type Busy = { device: Device; stepNo: number; secondsLeft: number };

export type Check = {
  /** busy: that device is taken (induction cooks one pan; every burner is in use). clash: it can't run with what's on. */
  kind: "busy" | "clash";
  /** What is in the way: the one that frees up soonest. */
  with: Busy;
  /** The other stove, free and safe to use now, or null: then wait for the timer. */
  alt: Device | null;
};

const toolOf = (d: Device): ToolKey => (d === "gas" ? "gas_stove" : d);

function blocked(need: Device, busy: Busy[], tools: Tool[] | null | undefined): { kind: Check["kind"]; with: Busy } | null {
  const soonest = (list: Busy[]) => [...list].sort((a, b) => a.secondsLeft - b.secondsLeft)[0]!;
  const same = busy.filter((b) => b.device === need);
  // Induction and the air fryer hold one thing at a time; gas has its burners.
  const full = need === "gas" ? same.length >= burners(tools) : same.length > 0;
  if (full) return { kind: "busy", with: soonest(same) };
  const clashing = busy.filter((b) => b.device !== need && clash(tools, toolOf(need), toolOf(b.device)));
  if (clashing.length) return { kind: "clash", with: soonest(clashing) };
  return null;
}

/** Can this step start on `need` while `busy` is running? Null when it can. */
export function kitchenCheck(need: Device, busy: Busy[], tools: Tool[] | null | undefined): Check | null {
  const b = blocked(need, busy, tools);
  if (!b) return null;
  const other: Device | null = need === "gas" ? "induction" : need === "induction" ? "gas" : null;
  const alt = other && has(tools, toolOf(other)) && !blocked(other, busy, tools) ? other : null;
  return { ...b, alt };
}
