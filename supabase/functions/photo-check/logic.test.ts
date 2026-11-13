import { assertEquals } from "jsr:@std/assert@1";

import { cleanNote, cleanVerdict, cutCheckNeeded, readPhotoBody } from "./logic.ts";

Deno.test("the body needs a household, a session and a base64 photo of a plain image type", () => {
  assertEquals(readPhotoBody({ household_id: "h", session_id: "s", image: "aGVsbG8=" }).ok, true);
  assertEquals(readPhotoBody({ household_id: "h", image: "aGVsbG8=" }).ok, false);
  assertEquals(readPhotoBody({ household_id: "h", session_id: "s", image: "<svg>" }).ok, false);
  assertEquals(readPhotoBody({ household_id: "h", session_id: "s", image: "aGVsbG8=", media_type: "image/svg+xml" }).ok, false);
});

Deno.test("never a promise that food is safe", () => {
  assertEquals(cleanNote("The onions are golden at the edges. It's safe to eat now."), "The onions are golden at the edges.");
  assertEquals(cleanNote("Looks fully cooked."), "");
  assertEquals(cleanVerdict("done"), "cant_tell");
  assertEquals(cleanVerdict("carry_on"), "carry_on");
});

Deno.test("meat, fish and egg steps always get the cut-and-check line", () => {
  assertEquals(cutCheckNeeded("Add the chicken and cook on high.", ["chicken", "onion"]), true);
  assertEquals(cutCheckNeeded("Brown the onions.", ["chicken", "onion"]), false);
  assertEquals(cutCheckNeeded("Add the paneer.", ["paneer"]), false);
});
