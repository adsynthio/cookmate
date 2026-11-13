import { assertEquals } from "jsr:@std/assert@1";

import { switchedOff } from "./killSwitch.ts";

Deno.test("a task is off when its own switch or the all switch is on", () => {
  assertEquals(switchedOff([], "invent"), false);
  assertEquals(switchedOff([{ key: "ai_off_invent", enabled: false }], "invent"), false);
  assertEquals(switchedOff([{ key: "ai_off_invent", enabled: true }], "invent"), true);
  assertEquals(switchedOff([{ key: "ai_off_invent", enabled: true }], "named_dish"), false);
  assertEquals(switchedOff([{ key: "ai_off_all", enabled: true }], "adapt"), true);
});
