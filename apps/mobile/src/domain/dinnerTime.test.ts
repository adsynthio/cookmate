import assert from "node:assert/strict";
import { test } from "node:test";

import { clock, minutesToDinner, nudgeTime, pickByTime, timeBuckets } from "./dinnerTime.ts";

test("clock and nudge time", () => {
  assert.equal(clock("20:00"), "8");
  assert.equal(clock("21:30"), "9:30");
  assert.equal(nudgeTime("20:00", 60), "19:00");
  assert.equal(nudgeTime("20:30", 45), "19:45");
});

test("the dinner card shows from a little before the nudge until dinner", () => {
  // 13:30 UTC is 19:00 in India.
  assert.equal(minutesToDinner("20:00", 60, new Date("2027-02-03T13:30:00Z")), 60);
  assert.equal(minutesToDinner("20:00", 60, new Date("2027-02-03T13:20:00Z")), 70);
  assert.equal(minutesToDinner("20:00", 60, new Date("2027-02-03T13:00:00Z")), null);
  assert.equal(minutesToDinner("20:00", 60, new Date("2027-02-03T14:31:00Z")), null);
});

test("one dish for each time that fits before dinner", () => {
  assert.deepEqual(timeBuckets(60), [20, 30, 60]);
  assert.deepEqual(timeBuckets(25), [20, 25]);
  const ranked = [{ t: "Rajma", m: 55 }, { t: "Poha", m: 20 }, { t: "Bhurji", m: 15 }];
  assert.deepEqual(pickByTime(ranked, (p) => p.m, 60).map((x) => [x.bucket, x.pick.t]), [[20, "Poha"], [30, "Bhurji"], [60, "Rajma"]]);
  assert.deepEqual(pickByTime(ranked, (p) => p.m, 40).map((x) => x.pick.t), ["Poha", "Bhurji"]);
});
