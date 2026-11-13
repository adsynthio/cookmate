import assert from "node:assert/strict";
import { test } from "node:test";

import { recapFrom, recapLines } from "./recap.ts";

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 15, 12);
const meal = (slug: string, daysAgo: number) => ({ slug, completedAt: new Date(now - daysAgo * DAY).toISOString() });
const title = (s: string) => ({ dal: "Dal Tadka", rajma: "Rajma", poha: "Kanda Poha" })[s] ?? null;

test("the week's dishes, the new ones, and weeks in a row", () => {
  const r = recapFrom([meal("dal", 1), meal("dal", 3), meal("rajma", 2), meal("poha", 8), meal("poha", 9), meal("poha", 10), meal("dal", 30)], now, title);
  assert.equal(r.meals, 3);
  assert.deepEqual(r.dishes.map((d) => [d.title, d.times, d.new]), [["Dal Tadka", 2, false], ["Rajma", 1, true]]);
  assert.equal(r.weeksCooking, 2);
});

test("warm lines, and nothing at all for a week without cooking", () => {
  const r = recapFrom([meal("dal", 1), meal("dal", 3), meal("rajma", 2), meal("dal", 30)], now, title, [{ name: "Aarav", dish: "Rajma" }]);
  const t = recapLines(r, "en")!;
  assert.equal(t.headline, "3 home-cooked meals this week");
  assert.deepEqual(t.lines, ["Most cooked: Dal Tadka (2 times)", "Something new: Rajma", "Aarav loved the Rajma"]);
  assert.equal(recapLines(recapFrom([meal("dal", 20)], now, title), "en"), null);
  assert.equal(recapLines({ ...r, meals: 6 }, "hi")!.headline, "घर के खाने का बढ़िया हफ़्ता");
});

test("dish names in the reader's language, the loved line too", () => {
  const titles = (s: string) => (s === "rajma" ? { hi: "राजमा", "hi-Latn": "Rajma" } : null);
  const r = recapFrom([meal("rajma", 1), meal("rajma", 2)], now, title, [{ name: "Aarav", dish: "Rajma", titles: { hi: "राजमा" } }], titles);
  const hi = (d: { title: string; titles?: { hi?: string } | null }) => d.titles?.hi ?? d.title;
  assert.deepEqual(recapLines(r, "hi", hi)!.lines, ["सबसे ज़्यादा बना: राजमा (2 बार)", "कुछ नया बना: राजमा", "Aarav को राजमा बहुत पसंद आया"]);
});
