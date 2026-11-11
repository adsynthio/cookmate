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
