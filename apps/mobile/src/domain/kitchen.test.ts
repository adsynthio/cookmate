/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";

import { displayName, expiryInfo, formatQuantity, needsCheck, parseQuantity, readBackText, roughDuration, shelfLife } from "./kitchen.ts";

const curd = { name: "curd", hi: "दही", latn: "dahi", location: "fridge" as const, life: { fridge: 4 } };

test("names follow the chosen language", () => {
  assert.equal(displayName(curd, "x", "en"), "Curd");
  assert.equal(displayName(curd, "x", "hi"), "दही");
  assert.equal(displayName(curd, "x", "hinglish"), "Dahi");
  assert.equal(displayName(undefined, "hari chutney", "hi"), "Hari chutney");
});

test("quantities read naturally", () => {
  assert.equal(formatQuantity(2, "kg"), "2 kg");
  assert.equal(formatQuantity(12, "piece"), "12");
  assert.equal(formatQuantity(0.333, "kg"), "0.33 kg");
  assert.equal(formatQuantity(null, "kg"), "");
});

test("expiry markers", () => {
  const today = new Date(2026, 10, 24);
  assert.deepEqual(expiryInfo("2026-11-24", true, today), { kind: "today", days: 0, estimated: true });
  assert.equal(expiryInfo("2026-11-26", false, today)?.kind, "soon");
  assert.equal(expiryInfo("2026-12-10", true, today)?.kind, "later");
  assert.equal(expiryInfo("2026-11-20", true, today)?.kind, "expired");
  assert.equal(expiryInfo(null, true, today), null);
});

test("shelf life lists the usual place first, then longest-lasting", () => {
  const paneer = { location: "fridge" as const, life: { freezer: 60, fridge: 3 } };
  assert.deepEqual(shelfLife(paneer), [{ kind: "fridge", days: 3 }, { kind: "freezer", days: 60 }]);
  assert.deepEqual(roughDuration(5), { unit: "day", n: 5 });
  assert.deepEqual(roughDuration(21), { unit: "week", n: 3 });
  assert.deepEqual(roughDuration(180), { unit: "month", n: 6 });
  assert.deepEqual(roughDuration(1825), { unit: "year", n: 5 });
});

test("items the parser is unsure about are marked for checking", () => {
  assert.equal(needsCheck({ confidence: 0.95 }), false);
  assert.equal(needsCheck({ confidence: 0.6 }), true);
});

test("the read-back is one short sentence", () => {
  assert.equal(
    readBackText([
      { name: "aloo", quantity: 2, unit: "kg" },
      { name: "ande", quantity: 12, unit: "piece" },
      { name: "atta", quantity: null, unit: null },
    ]),
    "2 kg aloo, 12 ande, atta.",
  );
  assert.equal(readBackText([]), "");
});

test("typed quantities", () => {
  assert.equal(parseQuantity("1.5"), 1.5);
  assert.equal(parseQuantity(" 1,5 "), 1.5);
  assert.equal(parseQuantity(""), null);
  assert.equal(parseQuantity("abc"), undefined);
  assert.equal(parseQuantity("0"), undefined);
});

test("F7: Kannada names when the app is in Kannada, English otherwise", async () => {
  const { displayName: name, setKannadaNames } = await import("./kitchen.ts");
  const potato = { name: "potato", hi: "आलू", latn: "aloo", kn: "ಆಲೂಗಡ್ಡೆ" };
  setKannadaNames(true);
  assert.equal(name(potato, "potato", "en"), "ಆಲೂಗಡ್ಡೆ");
  assert.equal(name({ name: "salt", hi: "नमक", latn: "namak" }, "salt", "en"), "Salt", "no Kannada name yet: English");
  setKannadaNames(false);
  assert.equal(name(potato, "potato", "en"), "Potato");
  assert.equal(name(potato, "potato", "hi"), "आलू");
});
