import { assertEquals } from "jsr:@std/assert@1";

import { checkQuota, LIMITS, quotaResponse, verdict } from "./quota.ts";

Deno.test("under both limits: allowed", () => {
  assertEquals(verdict(0, 0), { ok: true });
  assertEquals(verdict(LIMITS.hour - 1, LIMITS.day - 1), { ok: true });
});

Deno.test("past the hour or the day: refused, the day first", () => {
  assertEquals(verdict(LIMITS.hour, 10), { ok: false, window: "hour", retryAfterSec: 600 });
  assertEquals(verdict(LIMITS.hour, LIMITS.day), { ok: false, window: "day", retryAfterSec: 3600 });
});

Deno.test("no service key or no env access (local run, CI): fails open", async () => {
  assertEquals(await checkQuota("00000000-0000-0000-0000-000000000001"), { ok: true });
});

Deno.test("429 with Retry-After", async () => {
  const r = quotaResponse({ ok: false, window: "hour", retryAfterSec: 600 }, { "Access-Control-Allow-Origin": "*" });
  assertEquals(r.status, 429);
  assertEquals(r.headers.get("Retry-After"), "600");
  assertEquals(await r.json(), { error: "too_many_requests", window: "hour" });
});
