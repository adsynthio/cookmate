import assert from "node:assert/strict";
import { test } from "node:test";

import { burners, clash, electricPairs, kitchenCheck, setBurners, setClash } from "./kitchenLimits.ts";
import { toggleTool, type Tool } from "./tools.ts";

const kitchen: Tool[] = [{ type: "gas_stove" }, { type: "induction" }, { type: "air_fryer" }, { type: "kadai" }];

test("pairs of power-hungry machines, and one-at-a-time saved on both", () => {
  assert.deepEqual(electricPairs(kitchen), [["induction", "air_fryer"]]);
  const one = setClash(kitchen, "induction", "air_fryer", true);
  assert.equal(clash(one, "air_fryer", "induction"), true);
  assert.equal(clash(setClash(one, "air_fryer", "induction", false), "induction", "air_fryer"), false);
  // Removing the air fryer forgets the rule on the induction.
  const gone = toggleTool(one, "air_fryer");
  assert.equal(gone.find((t) => t.type === "induction")!.details?.notWith, undefined);
});

test("burners default to two and can be set", () => {
  assert.equal(burners(kitchen), 2);
  assert.equal(burners(setBurners(kitchen, 4)), 4);
});

test("induction waits while the air fryer runs when they can't run together, and gas is offered", () => {
  const busy = [{ device: "air_fryer" as const, stepNo: 2, secondsLeft: 300 }];
  assert.equal(kitchenCheck("induction", busy, kitchen), null);
  const one = setClash(kitchen, "induction", "air_fryer", true);
  assert.deepEqual(kitchenCheck("induction", busy, one), { kind: "clash", with: busy[0], alt: "gas" });
  // No gas at home: just wait.
  const noGas = toggleTool(one, "gas_stove");
  assert.equal(kitchenCheck("induction", busy, noGas)!.alt, null);
});

test("an induction cooks one pan; gas runs out of burners", () => {
  const simmer = { device: "induction" as const, stepNo: 3, secondsLeft: 600 };
  assert.deepEqual(kitchenCheck("induction", [simmer], kitchen), { kind: "busy", with: simmer, alt: "gas" });
  const gas1 = setBurners(kitchen, 1);
  const onGas = { device: "gas" as const, stepNo: 3, secondsLeft: 600 };
  assert.deepEqual(kitchenCheck("gas", [onGas], gas1), { kind: "busy", with: onGas, alt: "induction" });
  assert.equal(kitchenCheck("gas", [onGas], kitchen), null);
});
