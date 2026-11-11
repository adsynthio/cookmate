import { assert, assertEquals } from "jsr:@std/assert@1";

import { languageOr, mintToken, roomName, tokenClaims } from "./logic.ts";

const input = {
  apiKey: "APItestkey",
  apiSecret: "test-secret-not-a-real-one",
  identity: "member-1",
  name: "Sunita",
  room: "cook-room-1",
  agentName: "cookmate-voice-cook",
  metadata: { household_id: "hh-1", member_id: "member-1", cooking_session_id: "s-1", voice_session_id: null, language_code: "hi-IN", user_jwt: "user.jwt.here" },
  now: 1_800_000_000_000,
};

const decode = (part: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));

Deno.test("the token is for one participant in one room and expires", () => {
  const c = tokenClaims(input);
  assertEquals(c.iss, "APItestkey");
  assertEquals(c.sub, "member-1");
  assertEquals(c.video.room, "cook-room-1");
  assertEquals(c.video.roomJoin, true);
  assertEquals(c.exp - 1_800_000_000, 600);
  // No room-admin or recording rights.
  assertEquals(Object.keys(c.video).sort(), ["canPublish", "canPublishData", "canSubscribe", "room", "roomJoin"]);
});

Deno.test("the cooking agent is dispatched by name with the caller's identity and JWT", () => {
  const agents = tokenClaims(input).roomConfig.agents;
  assertEquals(agents.length, 1);
  assertEquals(agents[0]!.agentName, "cookmate-voice-cook");
  const meta = JSON.parse(agents[0]!.metadata);
  assertEquals(meta.household_id, "hh-1");
  assertEquals(meta.member_id, "member-1");
  assertEquals(meta.cooking_session_id, "s-1");
  assertEquals(meta.user_jwt, "user.jwt.here");
});

Deno.test("the JWT verifies with the API secret and not with another", async () => {
  const jwt = await mintToken(input);
  const [h, p, s] = jwt.split(".");
  assertEquals(decode(h!), { alg: "HS256", typ: "JWT" });
  assertEquals(decode(p!).video.room, "cook-room-1");
  const sig = Uint8Array.from(atob(s!.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const verify = async (secret: string) => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(`${h}.${p}`));
  };
  assert(await verify("test-secret-not-a-real-one"));
  assert(!(await verify("another-secret")));
});

Deno.test("rooms are unguessable and languages are limited to the app's three", () => {
  assert(roomName() !== roomName());
  assert(/^cook-[0-9a-f-]{36}$/.test(roomName()));
  assertEquals(languageOr("hi-Latn-IN", "en-IN"), "hi-Latn-IN");
  assertEquals(languageOr("fr-FR", "en-IN"), "en-IN");
  assertEquals(languageOr(undefined, "hi-IN"), "hi-IN");
});
