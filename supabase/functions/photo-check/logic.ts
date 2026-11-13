// Pure helpers for photo-check (F5). Tested with `deno test`.
// A photo of the pan is judged ONLY against the step's own cues ("onions golden at the edges", "oil separating"): carry
// on, a little more, or can't tell. It never says food is safe to eat, and the step's safety note always comes back
// word for word. On a step with meat, fish or egg it always adds the cut-and-check line.

export const MAX_IMAGE_CHARS = 3_000_000;

export type Verdict = "carry_on" | "a_little_more" | "cant_tell";

export function readPhotoBody(raw: unknown):
  | { ok: true; body: { householdId: string; sessionId: string; image: string; mediaType: "image/jpeg" | "image/png" | "image/webp" } }
  | { ok: false; status: number; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, status: 400, error: "invalid body" };
  const b = raw as Record<string, unknown>;
  const householdId = typeof b.household_id === "string" ? b.household_id : "";
  const sessionId = typeof b.session_id === "string" ? b.session_id : "";
  const image = typeof b.image === "string" ? b.image : "";
  const mediaType = b.media_type ?? "image/jpeg";
  if (!householdId || !sessionId) return { ok: false, status: 400, error: "household_id and session_id are required" };
  if (!image || !/^[A-Za-z0-9+/=\s]+$/.test(image.slice(0, 200))) return { ok: false, status: 400, error: "image must be base64" };
  if (image.length > MAX_IMAGE_CHARS) return { ok: false, status: 413, error: "the photo is too large" };
  if (mediaType !== "image/jpeg" && mediaType !== "image/png" && mediaType !== "image/webp") return { ok: false, status: 400, error: "jpeg, png or webp only" };
  return { ok: true, body: { householdId, sessionId, image, mediaType } };
}

// Anything that sounds like a promise that food is safe is dropped from the model's note.
const SAFE_CLAIM = /\b(safe to eat|fully cooked|cooked through|done and safe|ready to eat|no risk|it'?s safe|is safe)\b/i;

/** The model's note, cleaned: one or two plain sentences, never a safety promise. */
export function cleanNote(note: unknown): string {
  if (typeof note !== "string") return "";
  const text = note.replace(/\s+/g, " ").trim().slice(0, 240);
  const kept = text.split(/(?<=[.!?।])\s+/).filter((s) => s && !SAFE_CLAIM.test(s));
  return kept.join(" ");
}

export function cleanVerdict(v: unknown): Verdict {
  return v === "carry_on" || v === "a_little_more" ? v : "cant_tell";
}

const RISKY = /\b(chicken|mutton|meat|keema|fish|prawn|egg|anda|machhli|murgh)\b/i;

/** The line every meat, fish or egg step gets, whatever the photo looks like. */
export function cutCheckNeeded(stepText: string, ingredients: string[]): boolean {
  return RISKY.test(stepText) && ingredients.some((i) => RISKY.test(i));
}
