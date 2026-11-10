/// <reference types="node" />
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { allConfident, buildIndex, type CatalogEntry, parsePantryText, splitItems } from "./pantryParse.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8")) as CatalogEntry[];
const index = buildIndex(catalog);
const parse = (text: string) =>
  parsePantryText(text, index).map((i) => [i.ingredientKey ?? `?${i.said}`, i.quantity, i.unit]);

test("the PRD example: do kilo aloo, pyaaz, besan, dahi hai", () => {
  assert.deepEqual(parse("do kilo aloo, pyaaz, besan, dahi hai"), [
    ["potato", 2, "kg"],
    ["onion", null, null],
    ["gram flour", null, null],
    ["curd", null, null],
  ]);
});

test("Hinglish numbers, dozen and aur", () => {
  assert.deepEqual(parse("2 kilo aloo aur ek dozen ande"), [
    ["potato", 2, "kg"],
    ["egg", 12, "piece"],
  ]);
  assert.deepEqual(parse("dedh kilo tamatar, aadha kilo pyaz"), [
    ["tomato", 1.5, "kg"],
    ["onion", 0.5, "kg"],
  ]);
  assert.deepEqual(parse("sawa do kilo atta"), [["whole wheat flour", 2.25, "kg"]]);
  assert.deepEqual(parse("paav kilo paneer"), [["paneer", 0.25, "kg"]]);
});

test("Devanagari", () => {
  assert.deepEqual(parse("दो किलो आलू और एक दर्जन अंडे"), [
    ["potato", 2, "kg"],
    ["egg", 12, "piece"],
  ]);
});

test("English with glued units", () => {
  assert.deepEqual(parse("I bought 500g paneer, 1l milk and a dozen eggs"), [
    ["paneer", 500, "g"],
    ["milk", 1, "l"],
    ["egg", 12, "piece"],
  ]);
});

test("bunches, packets and pieces", () => {
  assert.deepEqual(parse("do gaddi palak, ek packet poha, 6 nimbu"), [
    ["spinach", 2, "bunch"],
    ["poha", 1, "packet"],
    ["lemon", 6, "piece"],
  ]);
});

test("homemade components go to ready-made", () => {
  const [item] = parsePantryText("ghar ki hari chutney", index);
  assert.equal(item?.state, "homemade");
  assert.equal(item?.locationKind, "ready_made");
  assert.equal(item?.ingredientKey, null, "hari chutney is not a catalog ingredient");
});

test("unknown items are kept with low confidence for the model or the user", () => {
  const items = parsePantryText("ek dabba gulab jamun", index);
  assert.equal(items[0]?.said, "gulab jamun");
  assert.equal(items[0]?.quantity, 1);
  assert.equal(allConfident(items), false);
  assert.equal(allConfident(parsePantryText("2 kilo aloo, ek dozen ande", index)), true);
});

test("a bare pav is bread, not a quarter", () => {
  assert.deepEqual(parse("6 pav"), [["pav", 6, "piece"]]);
});

test("splitting keeps multi-word items together", () => {
  assert.deepEqual(splitItems("hari mirch, kasuri methi aur sarson ka tel"), ["hari mirch", "kasuri methi", "sarson ka tel"]);
});
