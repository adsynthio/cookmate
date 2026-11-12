import { assertEquals } from "jsr:@std/assert@1";

import { cleanReply, contextFor, fallbackReply, parseBody } from "./logic.ts";

Deno.test("question and household are required; history is trimmed to the last turns", () => {
  assertEquals("error" in parseBody({ question: "hi" }), true);
  assertEquals("error" in parseBody({ household_id: "h", question: "  " }), true);
  const ok = parseBody({ household_id: "h", question: " What can I make? ", history: [...Array(9)].map((_, i) => ({ role: i % 2 ? "assistant" : "user", text: `t${i}` })).concat([{ role: "system", text: "x" } as never]) });
  if ("error" in ok) throw new Error("expected input");
  assertEquals(ok.question, "What can I make?");
  assertEquals(ok.history.length, 6);
  assertEquals(ok.history.at(-1)?.text, "t8");
});

Deno.test("context is compact and stable", () => {
  const c = contextFor({
    today: "2026-11-12",
    items: [
      { quantity: 1000, unit: "g", state: "raw", staple_level: null, expiry_date: "2026-11-20", custom_name: null, ingredients: { canonical_name: "onion" } },
      { quantity: 2, unit: "katori", state: "leftover", staple_level: null, expiry_date: null, custom_name: "leftover kadhi", ingredients: null },
      { quantity: null, unit: null, state: "raw", staple_level: "low", expiry_date: null, custom_name: null, ingredients: { canonical_name: "atta" } },
    ],
    members: [{ display_name: "Sunita", age_group: null, diet: "veg" }],
    memories: ["Aarav prefers mild food"],
    cooked: [{ title: "Dal Tadka", daysAgo: 1 }],
    recipes: [{ slug: "rajma", title: "Rajma", course: "main", diet: "veg", prep_time_min: 10, cook_time_min: 50 }],
  });
  assertEquals(c.kitchen.map((k) => k.name), ["atta", "leftover kadhi", "onion"]);
  assertEquals(c.kitchen[1], { name: "leftover kadhi", amount: "2 katori", state: "leftover" });
  assertEquals(c.kitchen[2], { name: "onion", amount: "1000 g", use_by: "2026-11-20" });
  assertEquals(c.recipes[0]?.minutes, 60);
  assertEquals(c.family[0]?.age_group, "adult");
});

Deno.test("replies keep only known recipes and short items, and refuse health claims", () => {
  const known = new Set(["rajma", "dal-tadka"]);
  const r = cleanReply({ answer: " Make rajma tonight. ", recipes: ["rajma", "pizza", "rajma"], add_to_list: ["kidney beans", ""], follow_ups: ["How long to soak?"] }, known);
  assertEquals(r, { answer: "Make rajma tonight.", recipes: ["rajma"], add_to_list: ["kidney beans"], follow_ups: ["How long to soak?"] });
  assertEquals(cleanReply({ answer: "", recipes: [], add_to_list: [], follow_ups: [] }, known), null);
  assertEquals(cleanReply({ answer: "This dal cures diabetes.", recipes: [], add_to_list: [], follow_ups: [] }, known), null);
  assertEquals(fallbackReply("hi").recipes, []);
});
