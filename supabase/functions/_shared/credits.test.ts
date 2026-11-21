import { assertEquals } from "jsr:@std/assert@1";

import { outOfCredits, readCredits } from "./credits.ts";

Deno.test("credits: the database's answer is read as it is", () => {
  assertEquals(
    readCredits({ allowed: false, balance: 0, daily_left: 0, daily_allowance: 5, unlimited: false, refills_at: "2026-11-21T18:30:00+00:00" }),
    { allowed: false, balance: 0, dailyLeft: 0, dailyAllowance: 5, unlimited: false, refillsAt: "2026-11-21T18:30:00+00:00" },
  );
  assertEquals(readCredits({ allowed: true, balance: "42.68", daily_left: "1.48", daily_allowance: "5.00", unlimited: true }).balance, 42.68);
});

Deno.test("credits: an answer that can't be read never pauses the AI", () => {
  for (const raw of [null, undefined, "", 3, {}, { allowed: "no" }]) assertEquals(readCredits(raw).allowed, true);
});

Deno.test("credits: out of credits is a 402 that says when the free credits come back", async () => {
  const res = outOfCredits(readCredits({ allowed: false, daily_allowance: 5, refills_at: "2026-11-21T18:30:00+00:00" }), { "X-Test": "1" });
  assertEquals(res.status, 402);
  assertEquals(res.headers.get("X-Test"), "1");
  assertEquals(await res.json(), { error: "out_of_credits", daily_allowance: 5, refills_at: "2026-11-21T18:30:00+00:00" });
});
