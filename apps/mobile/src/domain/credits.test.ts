import assert from "node:assert/strict";
import { test } from "node:test";

import { creditsLeft, creditsOf, indiaDay, nextIndiaMidnight, readCredits, showCredits, spendCredits, TRIAL } from "./credits.ts";

// 21 Nov 2026, 22:00 in India (16:30 UTC).
const night = new Date("2026-11-21T16:30:00Z");
// Half an hour later it is 22 Nov in India.
const nextDay = new Date("2026-11-21T19:00:00Z");

test("credits read as whole numbers from 10 up and one decimal below, never rounded up", () => {
  assert.equal(showCredits(54.99), "54");
  assert.equal(showCredits(10), "10");
  assert.equal(showCredits(4.3999999), "4.4");
  assert.equal(showCredits(0.25), "0.2");
  assert.equal(showCredits(0), "0");
  assert.equal(showCredits(-3), "0");
  assert.equal(showCredits(Number.NaN), "0");
});

test("the free credits follow the day in India", () => {
  assert.equal(indiaDay(night), "2026-11-21");
  assert.equal(indiaDay(nextDay), "2026-11-22");
  assert.equal(nextIndiaMidnight(night), "2026-11-21T18:30:00.000Z");
});

test("a new kitchen has 50 credits and 5 free ones today", () => {
  const c = creditsOf(TRIAL, night);
  assert.deepEqual([c.allowed, c.balance, c.dailyLeft, creditsLeft(c)], [true, 50, 5, 55]);
});

test("today's free credits go first, then the trial, never below zero", () => {
  let l = spendCredits(TRIAL, 3.5, night);
  assert.deepEqual([l.balance, creditsOf(l, night).dailyLeft], [50, 1.5]);
  l = spendCredits(l, 9, night);
  assert.deepEqual([l.balance, creditsOf(l, night).dailyLeft], [42.5, 0]);
  l = spendCredits({ ...l, balance: 1 }, 9, night);
  assert.equal(l.balance, 0);
  assert.equal(creditsOf(l, night).allowed, false);
});

test("the next day brings 5 free credits again, and they don't pile up", () => {
  const spent = spendCredits({ ...TRIAL, balance: 0 }, 5, night);
  assert.equal(creditsOf(spent, night).allowed, false);
  const tomorrow = creditsOf(spent, nextDay);
  assert.deepEqual([tomorrow.allowed, tomorrow.dailyLeft], [true, 5]);
  assert.equal(creditsOf(TRIAL, new Date("2026-12-31T12:00:00Z")).dailyLeft, 5);
});

test("an unlimited kitchen is never paused and keeps its balance", () => {
  const l = spendCredits({ ...TRIAL, balance: 0, unlimited: true }, 20, night);
  assert.equal(l.balance, 0);
  assert.equal(creditsOf(l, night).allowed, true);
});

test("the database's answer is read as it is, and an unreadable one never pauses the AI", () => {
  assert.deepEqual(
    readCredits({ allowed: false, balance: 0, daily_left: "0.00", daily_allowance: 5, unlimited: false, refills_at: "2026-11-21T18:30:00+00:00" }),
    { allowed: false, balance: 0, dailyLeft: 0, dailyAllowance: 5, unlimited: false, refillsAt: "2026-11-21T18:30:00+00:00" },
  );
  assert.equal(readCredits(null).allowed, true);
  assert.equal(readCredits({ allowed: "no" }).allowed, true);
});
