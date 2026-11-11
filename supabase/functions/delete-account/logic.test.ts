import { assertEquals } from "jsr:@std/assert@1";

import { confirmed } from "./logic.ts";

Deno.test("deleting needs the typed word, in any of the three languages", () => {
  assertEquals(confirmed("DELETE"), true);
  assertEquals(confirmed(" delete "), true);
  assertEquals(confirmed("हटाएँ"), true);
  assertEquals(confirmed("hatao"), true);
  assertEquals(confirmed("yes"), false);
  assertEquals(confirmed(undefined), false);
  assertEquals(confirmed(true), false);
});
