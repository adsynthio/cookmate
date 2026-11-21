// Email sign-in with a 6-digit code (Supabase email OTP): the pieces that are plain logic, so they can be tested.
// A code, not a magic link: on an iPhone a link opens Safari, whose storage is separate from the installed app, so the
// cook would end up signed in somewhere else. A code typed into the app works the same in every build.

export const CODE_LENGTH = 6;

/** The email as Supabase should get it (trimmed, lower case), or null when it can't be an address. */
export function cleanEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/** Only digits, at most six: what the code boxes hold, whatever was pasted or autofilled ("123 456", "Code: 123456"). */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export type EmailCodeProblem = "invalid" | "not_allowed" | "rate_limited" | "taken" | "other";

/**
 * Why sending a code failed, in words the cook can act on. "not_allowed": the project still uses Supabase's built-in
 * email sender, which only mails the project's own team. "taken": another account already uses this email (when
 * adding an email to an account that has none).
 */
export function emailCodeProblem(err: unknown): EmailCodeProblem {
  const e = (err ?? {}) as { code?: string; status?: number; message?: string };
  const msg = (e.message ?? "").toLowerCase();
  if (e.code === "email_address_not_authorized" || /not authorized/.test(msg)) return "not_allowed";
  if (e.status === 429 || e.code === "over_email_send_rate_limit" || e.code === "over_request_rate_limit" || /rate limit|too many|only request this after/.test(msg)) return "rate_limited";
  if (e.code === "email_exists" || /already (been )?registered|already exists|email_exists/.test(msg)) return "taken";
  if (e.code === "email_address_invalid" || e.code === "validation_failed" || /invalid.*email|email.*invalid|unable to validate email/.test(msg)) return "invalid";
  return "other";
}

/** A wrong or expired code (try again) rather than a failure to reach the server. */
export function isWrongCode(err: unknown): boolean {
  const e = (err ?? {}) as { code?: string; status?: number; message?: string };
  return e.code === "otp_expired" || e.code === "otp_invalid" || e.status === 403 || /token|otp|expired|invalid/i.test(e.message ?? "");
}

/** Seconds before another code can be sent (Supabase allows one per minute by default). */
export const RESEND_AFTER_S = 60;
