// F1: the message for the house cook.
import assert from "node:assert/strict";
import { test } from "node:test";

import { handoffText } from "./handoff.ts";

const words = { heading: "Aaj ka khaana: Rajma, 4 log", avoid: "Allergy / naapasand", notes: "Ghar ki baatein", ingredients: "Saamaan", steps: "Kaise banaayein", safety: "Dhyaan dein", footer: "Cookmate se" };

test("allergies come first in capitals, then notes, amounts and steps with their safety notes", () => {
  const text = handoffText({
    title: "Rajma", servings: 4, avoid: ["moongphali"], notes: ["Kam mirchi"],
    ingredients: [{ name: "Rajma", amount: "1 katori" }],
    steps: [{ text: "Bhigo dein.", safety: undefined }, { text: "Cooker mein pakaayein.", safety: "Kachcha rajma zehreela hai." }],
    words,
  });
  const lines = text.split("\n");
  assert.equal(lines[0], words.heading);
  assert.ok(text.indexOf("MOONGPHALI") < text.indexOf("Saamaan"), "allergies before anything else");
  assert.ok(text.includes("• Rajma: 1 katori"));
  assert.ok(text.includes("2. Cooker mein pakaayein.\n   ⚠️ Dhyaan dein: Kachcha rajma zehreela hai."));
});

test("no avoid line when the family avoids nothing", () => {
  const text = handoffText({ title: "Dal", servings: 2, avoid: [], notes: [], ingredients: [], steps: [{ text: "x" }], words });
  assert.ok(!text.includes("⚠️ Allergy"));
});
