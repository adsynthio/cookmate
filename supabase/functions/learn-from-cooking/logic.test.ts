import { assertEquals } from "jsr:@std/assert@1";

import { acceptLearned, changesOf } from "./logic.ts";

const members = [{ id: "m1", name: "Sunita" }, { id: "m2", name: "Aarav" }];

Deno.test("changes come from the session's modifications, newest last", () => {
  assertEquals(changesOf([{ change: " kam mirch " }, { change: "" }, { nope: 1 }, { change: "added peas" }]), ["kam mirch", "added peas"]);
  assertEquals(changesOf(null), []);
});

Deno.test("only known ingredients and family members, plain statements", () => {
  const c = acceptLearned([
    { kind: "amount", ingredient: "green chilli", amount: "less", member: null, statement: "Dal Tadka with less green chilli" },
    { kind: "avoid", ingredient: "onion", amount: null, member: "aarav", statement: "Aarav avoids onion" },
    { kind: "avoid", ingredient: "unicorn", amount: null, member: null, statement: "No unicorn" },
    { kind: "like", ingredient: "paneer", amount: null, member: "Riya", statement: "Riya loves paneer" },
    { kind: "note", ingredient: null, amount: null, member: null, statement: "Healthy with less oil" },
    { kind: "note", ingredient: null, amount: null, member: null, statement: "Added peas to the dal" },
  ], members);
  assertEquals(c.map((x) => [x.about, x.ingredient_key ?? null, x.member_id ?? null, x.polarity]), [
    ["amount", "green chilli", null, 0],
    ["preference", "onion", "m2", -1],
    ["change:added peas to the dal", null, null, 0],
  ]);
});
