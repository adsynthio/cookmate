// Pure helpers for ask-cookmate (no network). Tested with `deno test`.
// "Ask Cookmate anything": a short answer grounded in this household's kitchen, family, memories, recent cooking and
// the recipes Cookmate knows, plus up to three recipes to open, things to add to the list and follow-up questions.

export const MAX_QUESTION_CHARS = 400;
export const MAX_ANSWER_CHARS = 700;
export const MAX_HISTORY = 6;

export type Turn = { role: "user" | "assistant"; text: string };
export type Body = { household_id?: string; question?: string; language_code?: string; history?: unknown };
export type Input = { householdId: string; question: string; languageCode?: string; history: Turn[] };

export function parseBody(body: Body): Input | { error: string } {
  if (!body.household_id || typeof body.household_id !== "string") return { error: "household_id is required" };
  const question = typeof body.question === "string" ? body.question.trim().slice(0, MAX_QUESTION_CHARS) : "";
  if (!question) return { error: "question is required" };
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t): t is Turn => !!t && typeof t === "object" && ((t as Turn).role === "user" || (t as Turn).role === "assistant") && typeof (t as Turn).text === "string")
    .slice(-MAX_HISTORY)
    .map((t) => ({ role: t.role, text: t.text.slice(0, MAX_ANSWER_CHARS) }));
  return { householdId: body.household_id, question, languageCode: body.language_code, history };
}

export type ItemRow = {
  quantity: number | null;
  unit: string | null;
  state: string | null;
  staple_level: string | null;
  expiry_date: string | null;
  custom_name: string | null;
  ingredients: { canonical_name: string } | null;
};
export type MemberRow = { display_name: string; age_group: string | null; diet: string | null };
export type RecipeRow = { slug: string; title: string; course: string; diet: string; prep_time_min: number | null; cook_time_min: number | null };

/** What the model sees about the household, compact and in a stable order (sorted, so the same kitchen gives the same text). */
export function contextFor(a: {
  today: string;
  items: ItemRow[];
  members: MemberRow[];
  memories: string[];
  cooked: { title: string; daysAgo: number }[];
  recipes: RecipeRow[];
}) {
  const kitchen = a.items
    .map((i) => ({
      name: i.custom_name ?? i.ingredients?.canonical_name ?? "",
      ...(i.quantity !== null ? { amount: `${i.quantity}${i.unit ? ` ${i.unit}` : ""}` } : {}),
      ...(i.staple_level ? { level: i.staple_level } : {}),
      ...(i.state && i.state !== "raw" ? { state: i.state } : {}),
      ...(i.expiry_date ? { use_by: i.expiry_date } : {}),
    }))
    .filter((i) => i.name)
    .sort((x, y) => x.name.localeCompare(y.name));
  return {
    today: a.today,
    kitchen,
    family: a.members.map((m) => ({ name: m.display_name, age_group: m.age_group ?? "adult", diet: m.diet ?? "veg" })),
    remembered: a.memories.slice(0, 30),
    recently_cooked: a.cooked.slice(0, 10).map((c) => ({ dish: c.title, days_ago: c.daysAgo })),
    recipes: a.recipes
      .map((r) => ({ slug: r.slug, title: r.title, course: r.course, diet: r.diet, minutes: (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0) }))
      .sort((x, y) => x.slug.localeCompare(y.slug)),
  };
}

export type Reply = { answer: string; recipes: string[]; add_to_list: string[]; follow_ups: string[] };

const BANNED = [/\bcalorie/i, /\bcure[sd]?\b/i, /\bdiabet/i, /\bweight loss\b/i];

/** Keep only what is safe to show: a non-empty answer within length, known recipe slugs, short list items and follow-ups. */
export function cleanReply(r: Reply, knownSlugs: ReadonlySet<string>): Reply | null {
  const answer = (r.answer ?? "").trim();
  if (!answer || answer.length > MAX_ANSWER_CHARS * 1.5) return null;
  if (BANNED.some((re) => re.test(answer))) return null;
  const uniq = (xs: string[], max: number, len: number) => [...new Set((xs ?? []).map((x) => String(x).trim()).filter((x) => x && x.length <= len))].slice(0, max);
  return {
    answer: answer.slice(0, MAX_ANSWER_CHARS),
    recipes: uniq(r.recipes, 3, 80).filter((s) => knownSlugs.has(s)),
    add_to_list: uniq(r.add_to_list, 6, 40),
    follow_ups: uniq(r.follow_ups, 3, 80),
  };
}

const FALLBACK = {
  en: "I couldn't answer that just now. Try again in a moment, or look at tonight's picks on Home.",
  hi: "अभी जवाब नहीं बन पाया। थोड़ी देर में फिर पूछें, या Home पर आज के सुझाव देखें।",
  hinglish: "Abhi jawab nahi ban paaya. Thodi der mein phir poochhein, ya Home par aaj ke sujhav dekhein.",
} as const;

export function fallbackReply(locale: "en" | "hi" | "hinglish"): Reply {
  return { answer: FALLBACK[locale], recipes: [], add_to_list: [], follow_ups: [] };
}
