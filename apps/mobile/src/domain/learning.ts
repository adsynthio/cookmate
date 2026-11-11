// Learning from feedback (KIT-100, KIT-103): what a finished dish's feedback suggests remembering. These are only
// candidates: nothing is saved until the cook confirms it on the finish sheet. Each is about this dish, not the
// cook's taste in general, so one salty dal doesn't change every recipe. No React, no network.
import type { Locale } from "../i18n/locale";

type L = Record<Locale, string>;

export type MemoryCandidate = {
  /** The feedback tag it came from. */
  key: string;
  statement: string;
  category: "taste" | "routine";
  polarity: -1 | 1;
  /** Subject key: a newer memory about the same subject and dish replaces the older one. */
  about: string;
};

const RULES: Record<string, { text: L; category: MemoryCandidate["category"]; polarity: -1 | 1; about: string }> = {
  too_spicy: {
    text: { en: "Less chilli in {dish} next time", hi: "अगली बार {dish} में मिर्च कम", hinglish: "Agli baar {dish} mein mirch kam" },
    category: "taste", polarity: -1, about: "spice",
  },
  not_spicy_enough: {
    text: { en: "More chilli in {dish} next time", hi: "अगली बार {dish} में मिर्च ज़्यादा", hinglish: "Agli baar {dish} mein mirch zyada" },
    category: "taste", polarity: 1, about: "spice",
  },
  too_salty: {
    text: { en: "Less salt in {dish} next time", hi: "अगली बार {dish} में नमक कम", hinglish: "Agli baar {dish} mein namak kam" },
    category: "taste", polarity: -1, about: "salt",
  },
  too_oily: {
    text: { en: "Less oil in {dish} next time", hi: "अगली बार {dish} में तेल कम", hinglish: "Agli baar {dish} mein tel kam" },
    category: "taste", polarity: -1, about: "oil",
  },
  more_garlic: {
    text: { en: "Extra garlic in {dish} next time", hi: "अगली बार {dish} में लहसुन ज़्यादा", hinglish: "Agli baar {dish} mein lehsun zyada" },
    category: "taste", polarity: 1, about: "garlic",
  },
  took_too_long: {
    text: { en: "{dish} takes too long for a busy day", hi: "{dish} व्यस्त दिन के लिए बहुत समय लेती है", hinglish: "{dish} busy din ke liye bahut time leti hai" },
    category: "routine", polarity: -1, about: "time",
  },
  make_again: {
    text: { en: "{dish} is a favourite: make it again", hi: "{dish} पसंदीदा है: फिर बनाएँ", hinglish: "{dish} favourite hai: phir banayein" },
    category: "taste", polarity: 1, about: "favourite",
  },
};

/** Candidates in the order the tags were chosen; "make again" last. Opposite tags about one subject keep the last. */
export function feedbackCandidates(tags: string[], makeAgain: boolean, dish: string, locale: Locale): MemoryCandidate[] {
  const bySubject = new Map<string, MemoryCandidate>();
  for (const key of [...tags, ...(makeAgain ? ["make_again"] : [])]) {
    const rule = RULES[key];
    if (!rule) continue;
    bySubject.delete(rule.about);
    bySubject.set(rule.about, { key, statement: rule.text[locale].replace("{dish}", dish), category: rule.category, polarity: rule.polarity, about: rule.about });
  }
  return [...bySubject.values()];
}

// ---- Typed notes (KIT-103, rules only) ----------------------------------------------------------------------------
// "Agli baar lahsun zyada", "Riya ko karela pasand nahi", "less salt": what a short note means, worked out with
// word lists and the catalog. Anything it can't read stays a plain note in the cook's own words.

export type ParsedNote =
  | { kind: "amount"; ingredientKey: string; amount: "more" | "less"; memberId?: string }
  | { kind: "preference"; ingredientKey: string; polarity: -1 | 1; memberId?: string }
  | { kind: "plain"; memberId?: string };

const AVOID = [
  "pasand nahi", "pasand nahin", "pasand nhi", "nahi khata", "nahi khati", "nahi khate", "nahin khata", "nahin khati", "nahin khate",
  "nahi chahiye", "mat dalo", "mat daalo", "doesnt like", "doesn't like", "does not like", "dont like", "don't like", "do not like",
  "hate", "hates", "avoid", "avoids", "allergic", "allergy", "never",
  "पसंद नहीं", "नहीं खाता", "नहीं खाती", "नहीं खाते", "नहीं चाहिए", "मत डालो", "एलर्जी",
];
const LESS = ["kam", "less", "halka", "halki", "कम", "हल्का", "हल्की"];
const MORE = ["zyada", "zyaada", "jyada", "jyaada", "extra", "more", "ज़्यादा", "ज्यादा", "अधिक"];
const LIKE = ["pasand", "love", "loves", "like", "likes", "favourite", "favorite", "पसंद", "पसन्द"];

function has(text: string, words: string[]): boolean {
  return words.some((w) => new RegExp(`(^|[^\\p{L}\\p{M}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{M}])`, "u").test(text));
}

/**
 * Read a short note. `find` returns the catalog ingredients named in the text; a note that names exactly one
 * ingredient can be an amount ("more garlic") or a like or dislike. A member's name in the note makes it about them.
 */
export function parseNote(text: string, find: (text: string) => string[], members: { id: string; name: string }[] = []): ParsedNote {
  const clean = text.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  const member = members.find((m) => m.name.trim().length > 1 && has(clean, [m.name.trim().toLowerCase()]));
  const memberId = member?.id;
  const found = find(clean);
  if (found.length !== 1) return { kind: "plain", memberId };
  const ingredientKey = found[0]!;
  if (has(clean, AVOID)) return { kind: "preference", ingredientKey, polarity: -1, memberId };
  if (has(clean, LESS)) return { kind: "amount", ingredientKey, amount: "less", memberId };
  if (has(clean, MORE)) return { kind: "amount", ingredientKey, amount: "more", memberId };
  if (has(clean, LIKE)) return { kind: "preference", ingredientKey, polarity: 1, memberId };
  return { kind: "plain", memberId };
}

/** The sentence saved for a like or dislike chosen on the You screen. No gendered verbs (decision D8). */
export function preferenceStatement(name: string, ingredient: string, polarity: -1 | 1, locale: Locale): string {
  const text: Record<"avoid" | "love", L> = {
    avoid: { en: "{name} avoids {item}", hi: "{name} को {item} पसंद नहीं", hinglish: "{name} ko {item} pasand nahi" },
    love: { en: "{name} loves {item}", hi: "{name} को {item} बहुत पसंद है", hinglish: "{name} ko {item} bahut pasand hai" },
  };
  return text[polarity < 0 ? "avoid" : "love"][locale].replace("{name}", name).replace("{item}", ingredient);
}

// ---- Remembered amounts (KIT-104) ---------------------------------------------------------------------------------
// "More garlic" changes the next recipe: one step up or down, never a rewrite. A note about this dish wins over a
// general one, and the newest wins among equals.

export const MORE_FACTOR = 1.25;
export const LESS_FACTOR = 0.75;

/** What a feedback subject ("too salty" -> salt) means in catalog ingredients. */
const SUBJECT_INGREDIENTS: Record<string, string[]> = {
  garlic: ["garlic"],
  salt: ["salt", "black salt", "rock salt"],
  oil: ["ghee", "butter", "mustard oil", "groundnut oil", "refined oil", "coconut oil", "sesame oil"],
  spice: ["green chilli", "red chilli powder", "dry red chilli"],
};

export type AmountMemory = {
  statement: string;
  about: string | null;
  polarity: number;
  amount: "more" | "less" | null;
  ingredientKey: string | null;
  recipeId: string | null;
};

export type AmountChange = { factor: number; amount: "more" | "less"; statement: string };

/**
 * Ingredient key -> change for this dish. `memories` come newest first (as the You screen lists them); `dishIds` are
 * the ids this dish goes by (its own, its slug, the recipe it was adapted from).
 */
export function amountChanges(memories: AmountMemory[], dishIds: string[]): Map<string, AmountChange> {
  const general = new Map<string, AmountChange>();
  const forDish = new Map<string, AmountChange>();
  for (const m of memories) {
    const here = m.recipeId !== null && dishIds.includes(m.recipeId);
    if (m.recipeId !== null && !here) continue;
    let keys: string[] = [];
    let amount: "more" | "less" | null = null;
    if (m.about === "amount" && m.ingredientKey && m.amount) {
      keys = [m.ingredientKey];
      amount = m.amount;
    } else if (here && m.about && SUBJECT_INGREDIENTS[m.about] && m.polarity !== 0) {
      keys = SUBJECT_INGREDIENTS[m.about]!;
      amount = m.polarity > 0 ? "more" : "less";
    }
    if (!amount) continue;
    const target = here ? forDish : general;
    for (const key of keys) {
      if (!target.has(key)) target.set(key, { factor: amount === "more" ? MORE_FACTOR : LESS_FACTOR, amount, statement: m.statement });
    }
  }
  return new Map([...general, ...forDish]);
}
