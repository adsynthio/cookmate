// Pure helpers for learn-from-cooking (no network). Tested with `deno test`.
// What the cook changed mid-recipe ("kam mirchi daali", "Aarav ke liye pyaaz nahi") read into suggestions for next
// time. The model's reading is checked here: known ingredients and family members only, short plain statements, no
// health claims, at most four. The app shows them on the finish sheet; nothing is saved until the cook keeps it.
import catalogJson from "../_shared/catalog.json" with { type: "json" };

const CATALOG = new Set((catalogJson as { name: string }[]).map((c) => c.name));
export const MAX_CHANGES = 6;
export const MAX_CANDIDATES = 4;

export type ModelItem = {
  kind: "amount" | "avoid" | "like" | "note" | "trick";
  ingredient: string | null;
  /** M5: for a trick, what the ingredient stood in for ("eno" instead of "baking soda"). */
  instead_of?: string | null;
  amount: "more" | "less" | null;
  member: string | null;
  statement: string;
};

export type Candidate = {
  key: string;
  statement: string;
  category: "taste" | "ingredient" | "other";
  polarity: -1 | 0 | 1;
  about: string;
  ingredient_key?: string;
  amount?: "more" | "less";
  member_id?: string;
};

const BANNED = /\b(healthy|health|cure|weight|calorie|diabet|immunity|detox)/i;

/** The changes logged on a session, newest last, trimmed. */
export function changesOf(modifications: unknown): string[] {
  if (!Array.isArray(modifications)) return [];
  return modifications
    .map((m) => (m && typeof m === "object" && typeof (m as { change?: unknown }).change === "string" ? (m as { change: string }).change.trim() : ""))
    .filter(Boolean)
    .slice(-MAX_CHANGES);
}

export function acceptLearned(items: ModelItem[] | null | undefined, members: { id: string; name: string }[]): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const i of items ?? []) {
    const statement = (i.statement ?? "").trim().replace(/\s+/g, " ");
    if (!statement || statement.length > 120 || BANNED.test(statement)) continue;
    const ingredient = i.ingredient?.trim().toLowerCase() ?? null;
    if (ingredient && !CATALOG.has(ingredient)) continue;
    const member = i.member ? members.find((m) => m.name.toLowerCase() === i.member!.trim().toLowerCase()) : undefined;
    if (i.member && !member) continue; // a name that isn't in this family
    let c: Candidate | null = null;
    if (i.kind === "amount" && ingredient && (i.amount === "more" || i.amount === "less")) {
      c = { key: `amount:${ingredient}`, statement, category: "ingredient", polarity: 0, about: "amount", ingredient_key: ingredient, amount: i.amount };
    } else if ((i.kind === "avoid" || i.kind === "like") && ingredient) {
      c = { key: `${i.kind}:${member?.id ?? "all"}:${ingredient}`, statement, category: "ingredient", polarity: i.kind === "avoid" ? -1 : 1, about: "preference", ingredient_key: ingredient };
    } else if (i.kind === "trick" && ingredient && i.instead_of) {
      // M5, the cook's own trick: "Eno instead of soda, came out great". Offered first next time.
      const from = i.instead_of.trim().toLowerCase();
      if (!CATALOG.has(from) || from === ingredient) continue;
      c = { key: `trick:${from}`, statement, category: "ingredient", polarity: 1, about: `trick:${from}`, ingredient_key: ingredient };
    } else if (i.kind === "note") {
      c = { key: `note:${statement.toLowerCase()}`, statement, category: "other", polarity: 0, about: `change:${statement.toLowerCase().slice(0, 40)}` };
    }
    if (!c) continue;
    if (member) c.member_id = member.id;
    out.set(c.key, c);
  }
  return [...out.values()].slice(0, MAX_CANDIDATES);
}
