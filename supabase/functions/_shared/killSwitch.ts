// Off switches for AI recipe tasks (Sprint 14 G5): rows in feature_flags, where enabled = true means OFF, so a task
// can be stopped at once without an app update. The function then answers 503 and the app hides the option, as it
// does when no model is configured. If the flags can't be read the task runs: the safety gate still checks every
// recipe. Server-only, written by hand.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";

export type AiTaskSwitch = "invent" | "named_dish" | "adapt" | "family_recipe";

/** Pure: is this task switched off, given the flag rows read? */
export function switchedOff(rows: { key: string; enabled: boolean }[], task: AiTaskSwitch): boolean {
  return rows.some((r) => r.enabled && (r.key === "ai_off_all" || r.key === `ai_off_${task}`));
}

export async function aiSwitchedOff(sb: SupabaseClient, task: AiTaskSwitch): Promise<boolean> {
  try {
    const { data, error } = await sb.from("feature_flags").select("key, enabled").in("key", ["ai_off_all", `ai_off_${task}`]);
    if (error) throw error;
    return switchedOff((data ?? []) as { key: string; enabled: boolean }[], task);
  } catch (err) {
    console.error("kill switch read failed", err instanceof Error ? err.message : err);
    return false;
  }
}
