import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanInviteCode, shareable, showInviteCode, timeAgo } from "./community.ts";

test("time ago in each language", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  assert.equal(timeAgo("2026-11-12T11:59:30Z", now, "en"), "just now");
  assert.equal(timeAgo("2026-11-12T11:15:00Z", now, "en"), "45 min ago");
  assert.equal(timeAgo("2026-11-12T09:00:00Z", now, "hi"), "3 घंटे पहले");
  assert.equal(timeAgo("2026-11-11T09:00:00Z", now, "en"), "1 day ago");
  assert.equal(timeAgo("2026-11-09T09:00:00Z", now, "hinglish"), "3 din pehle");
});

test("invite codes: typed any way, shown in two halves, confusable letters refused", () => {
  assert.equal(cleanInviteCode(" abcd-efgh "), "ABCDEFGH");
  assert.equal(cleanInviteCode("ABCD EFG2"), "ABCDEFG2");
  assert.equal(cleanInviteCode("ABCDEFG0"), null);
  assert.equal(cleanInviteCode("ABC"), null);
  assert.equal(showInviteCode("ABCDEFGH"), "ABCD-EFGH");
});

test("a shared dish carries a trimmed note and up to six distinct changes", () => {
  assert.deepEqual(shareable("  ", [" More garlic ", "more garlic", "", "Less oil"]), { note: undefined, changes: ["More garlic", "Less oil"] });
  assert.equal(shareable("x", Array.from({ length: 9 }, (_, i) => `c${i}`)).changes.length, 6);
});
