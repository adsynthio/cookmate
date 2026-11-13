import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_POWER, equipmentList, has, setPower, toggleTool, type Tool } from "./tools.ts";

test("tools: toggling, induction power and what picks see", () => {
  let tools: Tool[] = [{ type: "gas_stove" }];
  tools = toggleTool(tools, "induction");
  assert.deepEqual(tools.find((t) => t.type === "induction")?.details?.power, DEFAULT_POWER);
  tools = setPower(tools, { style: "watts" });
  assert.deepEqual(tools.find((t) => t.type === "induction")?.details?.power, { style: "watts" });
  tools = toggleTool(tools, "gas_stove");
  assert.ok(!has(tools, "gas_stove") && has(tools, "induction"));
  assert.deepEqual(equipmentList(tools), ["induction"]);
  // Not told yet: picks leave nothing out.
  assert.equal(equipmentList([]), null);
  assert.equal(equipmentList(null), null);
});
