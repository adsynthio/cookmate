/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { daysLeft, useSoon } from "./pantry.ts";

const today = new Date(2026, 10, 16); // 16 Nov 2026

test("daysLeft counts whole days", () => {
  assert.equal(daysLeft("2026-11-16", today), 0);
  assert.equal(daysLeft("2026-11-19", today), 3);
  assert.equal(daysLeft("2026-11-15", today), -1);
});

test("useSoon keeps items expiring within the window, most urgent first", () => {
  const items = [
    { name: "paneer", quantity: 200, expiryDate: "2026-11-18", confidence: 0.9 },
    { name: "palak", quantity: 1, expiryDate: "2026-11-17", confidence: 0.9 },
    { name: "dahi", quantity: 400, expiryDate: "2026-11-17", confidence: 0.9 },
    { name: "rice", quantity: 5, expiryDate: "2027-05-01", confidence: 0.9 },
    { name: "old milk", quantity: 1, expiryDate: "2026-11-14", confidence: 0.9 },
  ];
  assert.deepEqual(
    useSoon(items, 3, today).map((i) => i.name),
    ["dahi", "palak", "paneer"],
  );
});

test("useSoon ignores staples and low-confidence items", () => {
  const items = [
    { name: "atta", quantity: null, expiryDate: "2026-11-17", confidence: 0.9, stapleLevel: "low" },
    { name: "maybe tomatoes", quantity: 3, expiryDate: "2026-11-17", confidence: 0.3 },
  ];
  assert.equal(useSoon(items, 3, today).length, 0);
});
