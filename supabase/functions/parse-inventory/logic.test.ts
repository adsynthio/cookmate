import { assert, assertEquals } from "jsr:@std/assert@1.0.13";

import { buildIndex, parsePantryText } from "../_shared/pantryParse.ts";
import { type CatalogRow, catalogHints, toCatalog, toResponseItem, wasMentioned } from "./logic.ts";

const rows: CatalogRow[] = [
  { id: "p1", canonical_name: "potato", names: { hi: "आलू", "hi-Latn": "aloo" }, aliases: ["alu", "batata"], default_location_kind: "pantry", default_unit: "g", is_staple: false },
  { id: "e1", canonical_name: "egg", names: { hi: "अंडा", "hi-Latn": "anda" }, aliases: ["ande"], default_location_kind: "fridge", default_unit: "piece", is_staple: false },
];
const catalog = toCatalog(rows);

Deno.test("catalog hints are sorted and stable for the prompt cache", () => {
  assertEquals(catalogHints(catalog), "egg | anda | अंडा | ande\npotato | aloo | आलू | alu, batata");
  assertEquals(catalogHints([...catalog].reverse()), catalogHints(catalog));
});

Deno.test("rules output maps to the API contract with ingredient ids", () => {
  const items = parsePantryText("do kilo aloo aur ek dozen ande", buildIndex(catalog));
  const ids = new Map(rows.map((r) => [r.canonical_name, r.id]));
  assertEquals(items.map((i) => toResponseItem(i, ids)), [
    { name: "aloo", ingredient_id: "p1", ingredient_key: "potato", quantity: 2, unit: "kg", location_kind: null, state: null, confidence: 0.92 },
    { name: "ande", ingredient_id: "e1", ingredient_key: "egg", quantity: 12, unit: "piece", location_kind: null, state: null, confidence: 0.92 },
  ]);
});

Deno.test("guardrail drops items the user never mentioned", () => {
  const potato = catalog.find((e) => e.name === "potato");
  assert(wasMentioned("do kilo aloo", "aloo", potato));
  assert(wasMentioned("दो किलो आलू", "potato", potato), "a Devanagari mention counts via the catalog names");
  assert(!wasMentioned("do kilo aloo", "onion", undefined));
});
