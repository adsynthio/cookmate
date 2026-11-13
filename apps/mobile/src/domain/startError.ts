// Why "Get started" failed, in words the cook can act on. Only a real network failure says "check your internet";
// a sign-in setting on the server (anonymous sign-ins off) or too many tries say so instead.
export type StartErrorKind = "offline" | "closed" | "busy" | "other";

export function startErrorKind(err: unknown): StartErrorKind {
  const e = (err ?? {}) as { code?: string; status?: number; name?: string; message?: string };
  const msg = `${e.name ?? ""} ${e.message ?? ""}`.toLowerCase();
  if (e.code === "anonymous_provider_disabled" || e.code === "signup_disabled" || /sign-?ins? (are )?disabled|signups not allowed/.test(msg)) return "closed";
  if (e.status === 429 || e.code === "over_request_rate_limit" || /rate limit|too many/.test(msg)) return "busy";
  if (/network request failed|failed to fetch|fetch failed|networkerror|timed? ?out|offline|authretryablefetcherror/.test(msg)) return "offline";
  return "other";
}
