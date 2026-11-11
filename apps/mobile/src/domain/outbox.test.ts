import assert from "node:assert/strict";
import { test } from "node:test";

import { enqueue, flush, isNetworkError, MAX_TRIES, pendingFor, type Op } from "./outbox.ts";

let n = 0;
const op = (call: Op["call"], args: unknown[], sessionId: string | null = "s1"): Op => ({ id: `op${++n}`, call, sessionId, args, at: n });
const step = (delta: number, sessionId = "s1") => op("cooking.advanceStep", [sessionId, delta, "touch"], sessionId);

test("network failures are told apart from server replies", () => {
  assert.equal(isNetworkError(new TypeError("Network request failed")), true);
  assert.equal(isNetworkError(new TypeError("Failed to fetch")), true);
  assert.equal(isNetworkError({ name: "FunctionsFetchError", message: "Failed to send a request to the Edge Function" }), true);
  assert.equal(isNetworkError({ message: "TypeError: Network request failed", code: "" }), true);
  assert.equal(isNetworkError({ message: "finish cooking first", code: "22023" }), false);
  assert.equal(isNetworkError({ name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", status: 500 }), false);
  assert.equal(isNetworkError(new Error("session not found")), false);
  assert.equal(isNetworkError(null), false);
});

test("step moves fold together; anything between them keeps its place", () => {
  let q: Op[] = [];
  q = enqueue(q, step(1));
  q = enqueue(q, step(1));
  q = enqueue(q, step(1));
  assert.equal(q.length, 1);
  assert.deepEqual(q[0]!.args, ["s1", 3, "touch"]);
  q = enqueue(q, op("cooking.reportChange", [{ sessionId: "s1", change: "less salt" }]));
  q = enqueue(q, step(-1));
  assert.equal(q.length, 3);
  q = enqueue(q, step(1));
  assert.equal(q.length, 2, "a move and its undo cancel out");
  q = enqueue(q, step(1, "s2"));
  q = enqueue(q, step(1));
  assert.equal(q.length, 4, "different sessions don't fold");
  assert.equal(pendingFor(q, "s2").length, 1);
});

test("flush replays in order and stops at the first network failure", async () => {
  const q = [step(2), op("cooking.finish", ["s1"]), op("cooking.submitFeedback", [{ sessionId: "s1", rating: "loved" }])];
  const seen: string[] = [];
  const r = await flush(q, async (o) => {
    seen.push(o.call);
    if (o.call === "cooking.finish") throw new TypeError("Network request failed");
  });
  assert.deepEqual(seen, ["cooking.advanceStep", "cooking.finish"]);
  assert.equal(r.done, 1);
  assert.equal(r.offline, true);
  assert.deepEqual(r.left.map((o) => o.call), ["cooking.finish", "cooking.submitFeedback"]);

  const again = await flush(r.left, async () => {});
  assert.deepEqual(again, { left: [], done: 2, dropped: [], offline: false });
});

test("a write the server keeps refusing is dropped after a few tries, and the rest go through", async () => {
  const bad = op("cooking.abandonSession", ["gone"]);
  const good = step(1);
  const tries = new Map<string, number>();
  let q: Op[] = [bad, good];
  const run = async (o: Op) => {
    if (o.id === bad.id) throw Object.assign(new Error("session not found"), { code: "P0002" });
  };
  for (let i = 1; i < MAX_TRIES; i++) {
    const r = await flush(q, run, tries);
    assert.equal(r.left.length, 2, `kept on try ${i}`);
    q = r.left;
  }
  const last = await flush(q, run, tries);
  assert.deepEqual(last.dropped.map((o) => o.id), [bad.id]);
  assert.equal(last.left.length, 0);
  assert.equal(last.done, 1);
});
