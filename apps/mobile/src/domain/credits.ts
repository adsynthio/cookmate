// T1: AI credits as the app shows them, and the preview's own copy of the rules. The live rules are in the database
// (supabase/migrations/20270524000000_ai_credits.sql, docs/AI_CREDITS.md): 1 credit = ₹1 of real AI cost, 50 on a
// new kitchen, 5 free a day (midnight India time, used first, they don't pile up), paid AI pauses at zero.
// Pure TypeScript, tested with node.

export type AiCredits = {
  /** False when the kitchen's paid AI is paused. */
  allowed: boolean;
  /** The trial and top-ups left. */
  balance: number;
  /** Today's free credits left. */
  dailyLeft: number;
  dailyAllowance: number;
  /** The owner's and testers' kitchens: never paused. */
  unlimited: boolean;
  /** When today's free credits come back (ISO 8601). */
  refillsAt: string | null;
};

/** Roughly what each paid feature costs in credits (Sonnet 5.5, Nov 2026). */
export const CREDIT_COSTS = { scan: 1.8, dish: 1.7, ask: 0.3 } as const;

/** Everything the kitchen can spend right now. */
export const creditsLeft = (c: Pick<AiCredits, "balance" | "dailyLeft">) => Math.max(0, c.balance) + Math.max(0, c.dailyLeft);

/** A number of credits as it reads: whole credits from 10 up, one decimal below, never rounded up. */
export function showCredits(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const cents = Math.round(n * 100);
  return n >= 10 ? String(Math.floor(cents / 100)) : String(Math.floor(cents / 10) / 10);
}

const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback;

/** ai_credits_left's answer -> AiCredits. Anything unreadable counts as a fresh trial, never as paused. */
export function readCredits(raw: unknown): AiCredits {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    allowed: r.allowed !== false,
    balance: num(r.balance, 50),
    dailyLeft: num(r.daily_left, 5),
    dailyAllowance: num(r.daily_allowance, 5),
    unlimited: r.unlimited === true,
    refillsAt: typeof r.refills_at === "string" ? r.refills_at : null,
  };
}

/** The calendar day in India, where the free credits start again at midnight. */
export function indiaDay(now: Date): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** The next midnight in India, when today's free credits come back. */
export function nextIndiaMidnight(now: Date): string {
  return new Date(Date.parse(`${indiaDay(now)}T00:00:00+05:30`) + 86_400_000).toISOString();
}

/** The preview keeps its own ledger with the database's rules. */
export type CreditLedger = { balance: number; dailyAllowance: number; dailyUsed: number; dailyOn: string | null; unlimited: boolean };
export const TRIAL: CreditLedger = { balance: 50, dailyAllowance: 5, dailyUsed: 0, dailyOn: null, unlimited: false };

export function creditsOf(l: CreditLedger, now: Date): AiCredits {
  const dailyLeft = Math.max(0, l.dailyAllowance - (l.dailyOn === indiaDay(now) ? l.dailyUsed : 0));
  return {
    allowed: l.unlimited || dailyLeft > 0 || l.balance > 0,
    balance: l.balance,
    dailyLeft,
    dailyAllowance: l.dailyAllowance,
    unlimited: l.unlimited,
    refillsAt: nextIndiaMidnight(now),
  };
}

/** One call's cost: today's free credits first, then the rest, never below zero. Unlimited kitchens only count it. */
export function spendCredits(l: CreditLedger, cost: number, now: Date): CreditLedger {
  const today = indiaDay(now);
  const used = l.dailyOn === today ? l.dailyUsed : 0;
  if (cost <= 0) return l;
  if (l.unlimited) return { ...l, dailyOn: today, dailyUsed: used + cost };
  const fromDaily = Math.min(cost, Math.max(0, l.dailyAllowance - used));
  return { ...l, dailyOn: today, dailyUsed: used + fromDaily, balance: Math.max(0, l.balance - (cost - fromDaily)) };
}
