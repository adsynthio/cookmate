import { assertEquals, assertRejects } from "jsr:@std/assert@1";

import { aiRequestRow, timedAiCall } from "./aiLog.ts";

Deno.test("a model call's row: cache writes count as input, cache reads apart, no text kept", () => {
  const row = aiRequestRow({
    householdId: "h1",
    task: "rescue_fix",
    model: "claude-haiku-5-5",
    promptVersion: "rescue_fix@1",
    status: "ok",
    latencyMs: 812.4,
    usage: { input_tokens: 120, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0, output_tokens: 90 },
  });
  assertEquals(row, {
    household_id: "h1",
    task: "rescue_fix",
    model: "claude-haiku-5-5",
    prompt_version: "rescue_fix@1",
    input_tokens: 2120,
    cached_tokens: 0,
    output_tokens: 90,
    latency_ms: 812,
    status: "ok",
    error: null,
  });
});

Deno.test("speech services log units; unknown statuses become errors; long errors are cut", () => {
  const row = aiRequestRow({ householdId: null, task: "tts_cache", model: "bulbul:v3", promptVersion: "speech", status: "weird", latencyMs: 5, units: 140, error: "x".repeat(900) });
  assertEquals([row.household_id, row.input_tokens, row.cached_tokens, row.status, row.error?.length], [null, 140, null, "error", 500]);
});

Deno.test("timedAiCall rethrows the call's error (logging is skipped without a service key)", async () => {
  await assertRejects(
    () => timedAiCall({ householdId: "h", task: "t", model: "m", promptVersion: "p" }, () => Promise.reject(new Error("boom"))),
    Error,
    "boom",
  );
  const r = await timedAiCall({ householdId: "h", task: "t", model: "m", promptVersion: "p" }, () => Promise.resolve({ usage: null, stop_reason: "end_turn", v: 1 }));
  assertEquals(r.v, 1);
});
