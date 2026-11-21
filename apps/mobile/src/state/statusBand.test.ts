// Installed iPhone web app: when the band behind the white status bar shows.
import assert from "node:assert/strict";
import { test } from "node:test";

import { statusBandOn, useStatusBand } from "./statusBand.ts";

test("dark mode never needs the band: every screen is dark under the white clock", () => {
  assert.equal(statusBandOn("dark", "/kitchen", false), false);
  assert.equal(statusBandOn("dark", "/", true), false);
});

test("light mode: Home's hero runs under the status bar; the band fades in once it scrolls away or elsewhere", () => {
  assert.equal(statusBandOn("light", "/", true), false);
  assert.equal(statusBandOn("light", "/", false), true);
  assert.equal(statusBandOn("light", "/kitchen", true), true, "the hero only counts on Home");
  assert.equal(statusBandOn("light", "/recipe/dal-tadka", true), true);
});

test("the sign-up and log-in screens run their coloured top under the status bar too", () => {
  for (const path of ["/onboarding", "/onboarding/email", "/onboarding/code", "/account/email", "/account/code"]) {
    assert.equal(statusBandOn("light", path, true), false, path);
    assert.equal(statusBandOn("light", path, false), true, path);
  }
  assert.equal(statusBandOn("light", "/onboarding/family", true), true, "the setup steps keep the band");
});

test("the store only changes when the answer does", () => {
  const before = useStatusBand.getState();
  before.setHeroUnder(before.heroUnder);
  assert.equal(useStatusBand.getState(), before);
  before.setHeroUnder(!before.heroUnder);
  assert.notEqual(useStatusBand.getState().heroUnder, before.heroUnder);
});
