// AI usage limits per household (security review, finding 23). Every model and speech call is logged in ai_requests
// (aiLog.ts); before an Edge Function makes more, it counts this household's calls in the last hour and day and
// refuses past the limit with 429. Generous for a real family (a busy evening is a few dozen calls), but it stops a
// script from running up the Anthropic bill through one household. Server-only, written by hand.
//
// If the count can't be read (no service key in a local run, a database hiccup) the call goes ahead: a missing
// limit must never break cooking for a real user.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

export const LIMITS = { hour: 60, day: 300 } as const;

export type Verdict = { ok: true } | { ok: false; window: "hour" | "day"; retryAfterSec: number };

/** Pure: the decision from the two counts. */
export function verdict(hourCount: number, dayCount: number): Verdict {
  if (dayCount >= LIMITS.day) return { ok: false, window: "day", retryAfterSec: 3600 };
  if (hourCount >= LIMITS.hour) return { ok: false, window: "hour", retryAfterSec: 600 };
  return { ok: true };
}

/** Counts this household's AI calls and decides. Fails open (see above). */
export async function checkQuota(householdId: string, now: Date = new Date()): Promise<Verdict> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key || !householdId) return { ok: true };
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const since = (ms: number) => new Date(now.getTime() - ms).toISOString();
    const count = async (ms: number) => {
      const { count, error } = await admin
        .from("ai_requests")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .gte("created_at", since(ms));
      if (error) throw error;
      return count ?? 0;
    };
    const [hour, day] = await Promise.all([count(3_600_000), count(86_400_000)]);
    return verdict(hour, day);
  } catch (err) {
    console.error("quota check failed", err instanceof Error ? err.message : err);
    return { ok: true };
  }
}

/** The 429 response the app shows as "Too many requests, try again in a bit". */
export function quotaResponse(v: Extract<Verdict, { ok: false }>, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "too_many_requests", window: v.window }), {
    status: 429,
    headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(v.retryAfterSec) },
  });
}
