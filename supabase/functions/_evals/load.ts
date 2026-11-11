// Loads the evaluation cases and the offline data they need (catalog hints, bundled recipes).
import catalogJson from "../_shared/catalog.json" with { type: "json" };
import recipesJson from "../../../apps/mobile/src/data/recipes.json" with { type: "json" };

import { catalogHints } from "../parse-inventory/logic.ts";
import type { RecipeDoc } from "../_shared/recipes.ts";
import type { Problem } from "../_shared/rescue.ts";
import type { ExpectedItem, RescueExpect } from "./graders.ts";

export type ParseCase = { text: string; language: string; expect: ExpectedItem[] };
export type RescueCase = { recipe: string; step: number; problem: Problem; language: string; pantry: string[]; missing?: string; details?: string; expect: RescueExpect };

const here = new URL(".", import.meta.url);
const read = <T>(name: string): T => JSON.parse(Deno.readTextFileSync(new URL(`cases/${name}`, here))) as T;

export const parseCases = () => read<ParseCase[]>("parse_inventory.json");
export const rescueCases = () => read<RescueCase[]>("rescue_fix.json");
export const catalog = catalogJson as unknown as { name: string; hi?: string; latn?: string; aliases?: string[] }[];
export const hints = () => catalogHints(catalog as Parameters<typeof catalogHints>[0]);
export const recipes = new Map((recipesJson as unknown as RecipeDoc[]).map((r) => [r.slug, r]));
