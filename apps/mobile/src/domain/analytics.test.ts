import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { EVENTS, sanitize } from "./analytics.ts";

/** V1 rows of the event catalog, with their property names ("chips[]" → chips, "tool_name?" → tool_name). */
function catalog(): Map<string, string[]> {
  const csv = readFileSync(new URL("../../../../docs/architecture/12_analytics_events.csv", import.meta.url), "utf8").replace(/^﻿/, "");
  const rows = new Map<string, string[]>();
  for (const line of csv.split("\n").slice(1)) {
    const m = /^([a-z_]+),[^,]*,("([^"]*)"|[^,]*),[^,]*,(yes|no),(V[\d.]+)\s*$/.exec(line.trim());
    if (!m || m[5] !== "V1") continue;
    const raw = m[3] ?? m[2]!;
    const props = raw.split(",").map((p) => p.trim().replace(/\s*\(.*\)$/, "").replace(/\[\]$|\?$/g, "")).filter(Boolean);
    rows.set(m[1]!, props);
  }
  return rows;
}

test("the app's catalog is exactly the V1 rows of 12_analytics_events.csv", () => {
  const csv = catalog();
  assert.ok(csv.size >= 30, `parsed ${csv.size} events`);
  assert.deepEqual(Object.keys(EVENTS).sort(), [...csv.keys()].sort());
  for (const [event, props] of csv) assert.deepEqual([...EVENTS[event as keyof typeof EVENTS]], props, event);
});

test("no catalog property could carry personal text", () => {
  const reviewed = new Set(["tool_name"]); // the voice agent's tool, e.g. set_timer: not a person
  for (const props of Object.values(EVENTS)) {
    for (const p of props.filter((x) => !reviewed.has(x))) assert.doesNotMatch(p, /(^|_)(name|phone|email|text|transcript|utterance|comment|address)(_|$)/, p);
  }
});

test("only listed properties shaped like ids, codes or numbers are kept", () => {
  assert.equal(sanitize("made_up_event", { a: 1 }), null);
  assert.deepEqual(
    sanitize("cook_started", { session_id: "6f1c2b9e-1d2a-4c55-9a8e-0c3f1b2d4e5f", mode: "voice", servings: 3, recipe_id: "jeera-aloo", extra: "x" }),
    { session_id: "6f1c2b9e-1d2a-4c55-9a8e-0c3f1b2d4e5f", mode: "voice", servings: 3, recipe_id: "jeera-aloo" },
  );
  assert.deepEqual(sanitize("pick_dismissed", { reason: "Sunita does not like karela" }), {}, "free text is dropped");
  assert.deepEqual(sanitize("pick_dismissed", { reason: "someone@example.com" }), {}, "emails are dropped");
  assert.deepEqual(sanitize("craving_submitted", { chips: ["comforting", "under 20 min"], length_chars: 18 }), { chips: ["comforting"], length_chars: 18 });
  assert.deepEqual(sanitize("feedback_submitted", { rating: "loved", tags_count: Number.NaN }), { rating: "loved" });
});
