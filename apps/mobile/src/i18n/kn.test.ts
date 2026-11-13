// F7: Kannada strings keep every {placeholder} the English has, and only translate keys that exist.
import assert from "node:assert/strict";
import { test } from "node:test";

import en from "./en.json" with { type: "json" };
import kn from "./kn.json" with { type: "json" };

const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("Kannada keeps every placeholder and uses only real keys", () => {
  const e = en as Record<string, string>;
  for (const [k, v] of Object.entries(kn as Record<string, string>)) {
    assert.ok(k in e, `unknown key ${k}`);
    assert.deepEqual(holes(v), holes(e[k]!), k);
  }
});

test("the safety words are in Kannada", () => {
  const k = kn as Record<string, string>;
  for (const key of ["safety.aiLabel", "safety.contains", "photo.disclaimer", "photo.cutCheck", "allergen.peanut", "allergen.milk"]) {
    assert.ok(/[ಀ-೿]/.test(k[key] ?? ""), key);
  }
});

test("every app string has a Kannada translation", () => {
  const missing = Object.keys(en).filter((k) => !(k in (kn as Record<string, string>)));
  assert.deepEqual(missing, []);
});
