import { test } from "node:test";
import assert from "node:assert/strict";

import { CHUNK, readChunked, removeChunked, safeKey, secureSessionStorage, writeChunked, type KV } from "./secureChunks.ts";

const memory = () => {
  const m = new Map<string, string>();
  const kv: KV = { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v), del: async (k) => void m.delete(k) };
  return { m, kv };
};

test("a large session round-trips across chunks; shrinking removes stale chunks", async () => {
  const { m, kv } = memory();
  const big = "x".repeat(CHUNK * 2 + 10);
  await writeChunked(kv, "sb-abc-auth-token", big);
  assert.equal(m.get("sb-abc-auth-token.n"), "3");
  assert.equal(await readChunked(kv, "sb-abc-auth-token"), big);
  await writeChunked(kv, "sb-abc-auth-token", "small");
  assert.equal(await readChunked(kv, "sb-abc-auth-token"), "small");
  assert.equal(m.has("sb-abc-auth-token.1"), false);
  await removeChunked(kv, "sb-abc-auth-token");
  assert.equal(m.size, 0);
  assert.equal(await readChunked(kv, "sb-abc-auth-token"), null);
});

test("a half-written value reads as signed out; keys are made safe", async () => {
  const { kv } = memory();
  await kv.set("k.n", "2");
  await kv.set("k.0", "a");
  assert.equal(await readChunked(kv, "k"), null);
  assert.equal(safeKey("sb:a/b token"), "sb_a_b_token");
});

test("an old plain-storage session moves into secure storage once", async () => {
  const { kv } = memory();
  const plain = new Map([["sb-abc-auth-token", "{\"access_token\":\"t\"}"]]);
  const legacy = { getItem: (k: string) => plain.get(k) ?? null, removeItem: (k: string) => void plain.delete(k) };
  const store = secureSessionStorage(kv, legacy);
  assert.equal(await store.getItem("sb-abc-auth-token"), "{\"access_token\":\"t\"}");
  assert.equal(plain.size, 0, "removed from plain storage");
  assert.equal(await readChunked(kv, "sb-abc-auth-token"), "{\"access_token\":\"t\"}");
});
