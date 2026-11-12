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
