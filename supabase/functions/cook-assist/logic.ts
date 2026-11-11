// Pure helpers for cook-assist (no network). Tested with `deno test`.
import { MAX_QUESTION_CHARS } from "../_shared/assist.ts";

export type Body = { session_id?: string; mode?: string; text?: string; language_code?: string; channel?: string };
export type Input = { sessionId: string; mode: "ask" | "changed"; text: string; channel: "touch" | "voice" };

export function parseBody(body: Body): Input | { error: string } {
  if (!body.session_id) return { error: "session_id is required" };
  if (body.mode !== "ask" && body.mode !== "changed") return { error: "mode must be ask or changed" };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_QUESTION_CHARS) : "";
  if (!text) return { error: "text is required" };
  return { sessionId: body.session_id, mode: body.mode, text, channel: body.channel === "voice" ? "voice" : "touch" };
}
