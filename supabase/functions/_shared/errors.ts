// Server errors are logged here, in full, and the app gets a plain message (security review, finding 24): database and
// storage messages name tables, columns and constraints, which callers have no need to see. Written by hand.
export function serverError(err: { message?: string; code?: string } | unknown, json: (body: unknown, status?: number) => Response): Response {
  const e = err as { message?: string; code?: string } | null;
  console.error("server error", e?.code ?? "", e?.message ?? String(err));
  return json({ error: "something went wrong" }, 500);
}
