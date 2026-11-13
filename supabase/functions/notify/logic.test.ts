import { assertEquals } from "jsr:@std/assert@1";

import { expoMessages, pickMessage, readTickets } from "./logic.ts";

Deno.test("the push names tonight's dish and its reason, in the member's language", () => {
  assertEquals(pickMessage("Palak paneer", "Uses your spinach before it goes off", "en"), {
    title: "Tonight: Palak paneer",
    body: "Uses your spinach before it goes off",
  });
  assertEquals(pickMessage("Palak paneer", null, "hi").title, "आज रात: Palak paneer");
  assertEquals(pickMessage(null, null, "hinglish").body, "Dinner chunne ke liye Cookmate kholiye");
});

Deno.test("only Expo push tokens are sent to, once each", () => {
  const msgs = expoMessages(["ExponentPushToken[a]", "ExponentPushToken[a]", "nonsense", "ExpoPushToken[b]"], { title: "t", body: "b" }, { batch: "x" });
  assertEquals(msgs.map((m) => m.to), ["ExponentPushToken[a]", "ExpoPushToken[b]"]);
  assertEquals(msgs[0]!.channelId, "daily-pick");
});

Deno.test("dead tokens are found from Expo's tickets", () => {
  const r = readTickets(["t1", "t2"], [{ status: "error", details: { error: "DeviceNotRegistered" } }, { status: "ok", id: "x" }]);
  assertEquals(r, { delivered: true, dead: ["t1"] });
  assertEquals(readTickets(["t1"], [{ status: "error", details: { error: "MessageRateExceeded" } }]), { delivered: false, dead: [] });
});

import { clock, dinnerMessage, pickByTime, timeBuckets } from "./logic.ts";

Deno.test("time buckets follow how long is left before dinner", () => {
  assertEquals(timeBuckets(60), [20, 30, 60]);
  assertEquals(timeBuckets(45), [20, 30, 45]);
  assertEquals(timeBuckets(30), [20, 30]);
  assertEquals(timeBuckets(20), [20]);
  assertEquals(timeBuckets(90), [20, 30, 60]);
});

Deno.test("one dish per time, best-ranked first, never repeated", () => {
  const ranked = [{ t: "Rajma", m: 55 }, { t: "Poha", m: 20 }, { t: "Bhurji", m: 15 }, { t: "Biryani", m: 90 }, { t: "Mystery", m: null }];
  const got = pickByTime(ranked, (p) => p.m, 60).map((x) => [x.bucket, x.pick.t]);
  assertEquals(got, [[20, "Poha"], [30, "Bhurji"], [60, "Rajma"]]);
  assertEquals(pickByTime(ranked, (p) => p.m, 20).map((x) => x.pick.t), ["Poha"]);
});

Deno.test("the dinner nudge lists the options by time, in the member's language", () => {
  assertEquals(clock("20:00"), "8");
  assertEquals(clock("20:30"), "8:30");
  const msg = dinnerMessage([{ bucket: 20, dish: "Poha" }, { bucket: 60, dish: "Rajma" }], "20:00", "en");
  assertEquals(msg, { title: "Dinner at 8: what to cook", body: "20 min: Poha · 1 hr: Rajma" });
  assertEquals(dinnerMessage([{ bucket: 60, dish: "Rajma" }], "21:30", "hi").title, "रात का खाना 9:30 बजे: क्या बनाएँ?");
  assertEquals(dinnerMessage([], "20:00", "hinglish").body, "Dinner chunne ke liye Cookmate kholiye");
});
