// Pure helpers for voice-token (no network). Tested with `deno test`.
// A LiveKit access token is a JWT signed with the API secret (HS256). It is minted here with Web Crypto, so the
// function has no SDK dependency and the secret never leaves the server.

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encode = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

export type DispatchMetadata = {
  household_id: string;
  member_id: string;
  cooking_session_id: string | null;
  voice_session_id: string | null;
  language_code: string;
  /** The user's own Supabase JWT: the agent calls RPCs as the user, never with the service role (VOICE-07). */
  user_jwt: string;
};

export type TokenInput = {
  apiKey: string;
  apiSecret: string;
  /** Participant identity: the member id. */
  identity: string;
  name: string;
  room: string;
  agentName: string;
  metadata: DispatchMetadata;
  /** Seconds the token can be used to join. The call itself can run longer. */
  ttlSec?: number;
  now?: number;
};

/** Claims for one participant in one room, with the cooking agent dispatched to that room by name. */
export function tokenClaims(input: TokenInput) {
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  return {
    iss: input.apiKey,
    sub: input.identity,
    name: input.name,
    nbf: now - 10,
    exp: now + (input.ttlSec ?? 600),
    video: { room: input.room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
    roomConfig: { agents: [{ agentName: input.agentName, metadata: JSON.stringify(input.metadata) }] },
  };
}

export async function mintToken(input: TokenInput): Promise<string> {
  const head = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(tokenClaims(input))}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(input.apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(head)));
  return `${head}.${b64url(sig)}`;
}

/** One room per connection; the name says nothing about the household beyond a random id. */
export function roomName(): string {
  return `cook-${crypto.randomUUID()}`;
}

const LANGUAGES = ["hi-IN", "hi-Latn-IN", "en-IN"];
export function languageOr(code: unknown, fallback: string): string {
  return typeof code === "string" && LANGUAGES.includes(code) ? code : fallback;
}
