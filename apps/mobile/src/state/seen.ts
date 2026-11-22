// What Home showed lately (domain/seen.ts), kept on this phone so the next picks change.
import "expo-sqlite/localStorage/install";

import { addSeen, emptySeen, lately, type Seen } from "@/domain/seen";

const KEY = "cookmate.seen";

function load(): Seen {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    const parsed = v ? (JSON.parse(v) as Partial<Seen>) : null;
    return parsed && typeof parsed === "object" ? { recipes: parsed.recipes ?? {}, ideas: parsed.ideas ?? {} } : emptySeen();
  } catch {
    return emptySeen();
  }
}

/** Recipe ids and idea names Home showed lately, for suggest-meals. */
export function seenLately(): { recipes: string[]; ideas: string[] } {
  return lately(load());
}

/** Remember a batch Home has shown. */
export function rememberShown(shown: { recipeIds: string[]; ideas: string[] }) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(addSeen(load(), shown)));
  } catch {}
}
