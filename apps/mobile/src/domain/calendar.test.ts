// Festivals and fasts (KIT-144): which events run today, and whose rules picks follow.
import assert from "node:assert/strict";
import { test } from "node:test";

import { calendarPrefs, type CalendarEvent, eventsOn, fastsToOffer, keepFast } from "./calendar.ts";

const navratri: CalendarEvent = {
  event_date: "2027-09-30",
  end_date: "2027-10-09",
  kind: "fast",
  name: "Sharad Navratri",
  regions: [],
  rules: { avoid: ["rice", "onion", "salt"], prefer: ["fasting", "sabudana"] },
};
const diwali: CalendarEvent = { event_date: "2027-10-29", kind: "festival", name: "Diwali", regions: [], rules: { prefer: ["festive"] } };
const chhath: CalendarEvent = {
  event_date: "2027-11-04", end_date: "2027-11-05", kind: "fast", name: "Chhath Puja", regions: ["BR", "UP"],
  rules: { avoid: ["onion"], prefer: ["jaggery"] },
};

test("events run between their start and end, in their regions", () => {
  assert.deepEqual(eventsOn([navratri, diwali], "2027-10-03", null).map((e) => e.name), ["Sharad Navratri"]);
  assert.deepEqual(eventsOn([navratri, diwali], "2027-10-10", "DL"), []);
  assert.deepEqual(eventsOn([chhath], "2027-11-05", "BR").map((e) => e.name), ["Chhath Puja"]);
  assert.deepEqual(eventsOn([chhath], "2027-11-05", "KA"), []);
  assert.deepEqual(eventsOn([chhath], "2027-11-05", null), [], "regional events need a known region");
});

test("a global fast only nudges; its avoid list applies once the household keeps it", () => {
  assert.deepEqual(calendarPrefs([navratri]), { avoid: [], prefer: ["fasting", "sabudana"] });
  assert.deepEqual(fastsToOffer([navratri, diwali]).map((e) => e.name), ["Sharad Navratri"]);

  const kept = { ...keepFast(navratri, "h1"), id: "c1" };
  assert.equal(kept.rules?.keeps, "Sharad Navratri@2027-09-30");
  const today = eventsOn([navratri, kept], "2027-10-01", "DL");
  assert.deepEqual(calendarPrefs(today).avoid.sort(), ["onion", "rice", "salt"]);
  assert.deepEqual(fastsToOffer(today), [], "not offered again once kept");
});

test("festivals without food rules are never offered as fasts", () => {
  const karva: CalendarEvent = { event_date: "2027-10-19", kind: "fast", name: "Karva Chauth", regions: [], rules: { prefer: ["festive"] } };
  assert.deepEqual(fastsToOffer([karva, diwali]), []);
});
