import { assertEquals } from "jsr:@std/assert@1";

import { cleanNotes, fallbackAnswer } from "../_shared/assist.ts";
import { parseBody } from "./logic.ts";

Deno.test("requests need a session, a mode and some text", () => {
  assertEquals(parseBody({}), { error: "session_id is required" });
  assertEquals(parseBody({ session_id: "s", mode: "sing" }), { error: "mode must be ask or changed" });
  assertEquals(parseBody({ session_id: "s", mode: "ask", text: "   " }), { error: "text is required" });
  assertEquals(parseBody({ session_id: "s", mode: "changed", text: " used oil ", channel: "voice" }), { sessionId: "s", mode: "changed", text: "used oil", channel: "voice" });
  const long = parseBody({ session_id: "s", mode: "ask", text: "x".repeat(900) });
  assertEquals("error" in long ? 0 : long.text.length, 300);
});

Deno.test("the shared fallbacks behave the same in the function", () => {
  assertEquals(fallbackAnswer({ text: "Simmer.", cue: "Thick and glossy." }, "kab tak?", "hinglish").answer, "Aise pehchaanein: Thick and glossy.");
  assertEquals(cleanNotes([{ step: 1, note: "past" }, { step: 3, note: "Lower the heat." }], 2, 4), [{ step: 3, note: "Lower the heat." }]);
});
