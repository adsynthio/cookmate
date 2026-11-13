// Kitchen tools (equipment) the household cooks with. Picks leave out what can't be cooked without them, and the
// cook screen turns "medium heat" into the setting for the stove actually in use. The keys match the database's
// kitchen_equipment.equipment_type. No React, no network.
import type { IconName } from "../design-system/icons";

export type ToolKey =
  | "gas_stove"
  | "induction"
  | "pressure_cooker"
  | "kadai"
  | "tawa"
  | "mixer_grinder"
  | "air_fryer"
  | "otg"
  | "microwave"
  | "blender";

/** How an induction shows its power: numbered levels (1 to 8, or 1 to 10) or watts. */
export type InductionPower = { style: "levels"; max: 8 | 10 } | { style: "watts" };

export type Tool = { type: ToolKey; details?: { power?: InductionPower } };

export const TOOL_GROUPS: { key: "stove" | "pots" | "machines"; tools: { key: ToolKey; icon: IconName }[] }[] = [
  { key: "stove", tools: [{ key: "gas_stove", icon: "flame" }, { key: "induction", icon: "bulb" }] },
  { key: "pots", tools: [{ key: "pressure_cooker", icon: "timer" }, { key: "kadai", icon: "skillet" }, { key: "tawa", icon: "skillet" }] },
  {
    key: "machines",
    tools: [
      { key: "mixer_grinder", icon: "spoon" },
      { key: "air_fryer", icon: "drop" },
      { key: "otg", icon: "box" },
      { key: "microwave", icon: "box" },
      { key: "blender", icon: "spoon" },
    ],
  },
];

export const ALL_TOOLS: ToolKey[] = TOOL_GROUPS.flatMap((g) => g.tools.map((t) => t.key));

/** What almost every Indian home kitchen has; ticked to begin with so most people just press Next. */
export const DEFAULT_TOOLS: ToolKey[] = ["gas_stove", "pressure_cooker", "kadai", "tawa", "mixer_grinder"];

/** Most Indian inductions have 8 numbered power levels. */
export const DEFAULT_POWER: InductionPower = { style: "levels", max: 8 };

export function toggleTool(tools: Tool[], key: ToolKey): Tool[] {
  if (tools.some((t) => t.type === key)) return tools.filter((t) => t.type !== key);
  return [...tools, key === "induction" ? { type: key, details: { power: DEFAULT_POWER } } : { type: key }];
}

export function setPower(tools: Tool[], power: InductionPower): Tool[] {
  return tools.map((t) => (t.type === "induction" ? { ...t, details: { ...t.details, power } } : t));
}

export const has = (tools: Tool[] | null | undefined, key: ToolKey) => !!tools?.some((t) => t.type === key);

/** For picks: null means "not told", so nothing is left out. */
export function equipmentList(tools: Tool[] | null | undefined): string[] | null {
  return tools && tools.length ? tools.map((t) => t.type) : null;
}

export const isToolKey = (k: string): k is ToolKey => (ALL_TOOLS as string[]).includes(k);
