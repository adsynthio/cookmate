// M5, "the cook's mind": the family's own tricks ("Eno instead of soda, came out great"), learned after cooking and
// kept as memories with about = "trick:<what it replaced>" and the ingredient used. Offered first next time: on the
// recipe screen when that ingredient is missing, and to the "make it from my kitchen" model. Pure TypeScript.

export type Trick = { from: string; use: string };

/** The family's tricks from its memories (newest wins for the same replaced ingredient). */
export function tricksFrom(memories: { about?: string | null; ingredientKey?: string | null; polarity: number }[]): Trick[] {
  const out = new Map<string, Trick>();
  for (const m of memories) {
    const from = m.about?.startsWith("trick:") ? m.about.slice(6).trim() : "";
    if (!from || !m.ingredientKey || m.polarity < 0) continue;
    out.set(from, { from, use: m.ingredientKey });
  }
  return [...out.values()];
}

/** The family's trick for a missing ingredient, when the kitchen has what it uses and nobody avoids it. */
export function trickFor(missing: string, tricks: Trick[], has: (key: string) => boolean, avoid: string[] = []): Trick | null {
  return tricks.find((x) => x.from === missing && has(x.use) && !avoid.includes(x.use)) ?? null;
}
