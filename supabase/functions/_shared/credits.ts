// AI credits (T1). Before a model call that costs real money, ask the database whether this kitchen has credits left
// (public.ai_credits_left, read as the signed-in cook). The spending itself happens in the database, when the call is
// logged in ai_requests. Free tasks (the safety review, help while cooking, understanding typed text) never ask.
// Server-only, written by hand.
//
// If the answer can't be read the call goes ahead, as with the quota: a database hiccup must never break the app.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";

export type Credits = {
  allowed: boolean;
  balance: number | null;
  dailyLeft: number | null;
  dailyAllowance: number | null;
  unlimited: boolean;
  /** When today's free credits come back (midnight India time), ISO 8601. */
  refillsAt: string | null;
};

const OPEN: Credits = { allowed: true, balance: null, dailyLeft: null, dailyAllowance: null, unlimited: false, refillsAt: null };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** Pure: ai_credits_left's answer -> Credits. Anything unreadable counts as allowed. */
export function readCredits(raw: unknown): Credits {
  if (!raw || typeof raw !== "object") return OPEN;
  const r = raw as Record<string, unknown>;
  return {
    allowed: r.allowed !== false,
    balance: num(r.balance),
    dailyLeft: num(r.daily_left),
    dailyAllowance: num(r.daily_allowance),
    unlimited: r.unlimited === true,
    refillsAt: typeof r.refills_at === "string" ? r.refills_at : null,
  };
}

/** This kitchen's credits, asked as the signed-in cook (RLS). */
export async function creditsFor(sb: SupabaseClient, householdId: string): Promise<Credits> {
  try {
    const { data, error } = await sb.rpc("ai_credits_left", { p_household_id: householdId });
    if (error) throw error;
    return readCredits(data);
  } catch (err) {
    console.error("credits check failed", err instanceof Error ? err.message : err);
    return OPEN;
  }
}

/** 402: the app says the AI is paused and when the free daily credits come back. */
export function outOfCredits(c: Credits, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "out_of_credits", daily_allowance: c.dailyAllowance, refills_at: c.refillsAt }), {
    status: 402,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
