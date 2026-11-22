// Every app string exists in Hindi and Hinglish too, with the same {placeholders} as the English (Kannada has its own
// test). A missing string falls back to English, which in a Hindi or Hinglish app reads like a bug.
import assert from "node:assert/strict";
import { test } from "node:test";

import en from "./en.json" with { type: "json" };
import hi from "./hi.json" with { type: "json" };
import hinglish from "./hinglish.json" with { type: "json" };

const holes = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

for (const [name, lang] of [["Hindi", hi], ["Hinglish", hinglish]] as const) {
  test(`every app string has a ${name} translation`, () => {
    const l = lang as Record<string, string>;
    assert.deepEqual(Object.keys(en).filter((k) => !(k in l)), []);
  });
  test(`${name} keeps every placeholder and uses only real keys`, () => {
    const e = en as Record<string, string>;
    for (const [k, v] of Object.entries(lang as Record<string, string>)) {
      assert.ok(k in e, `unknown key ${k}`);
      assert.deepEqual(holes(v), holes(e[k]!), k);
    }
  });
}
