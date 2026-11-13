// Onboarding rules (KIT-020/022/023): language, who eats here, spice, diet, consent.
// Pure functions so they can be unit-tested without React Native.
import type { Locale } from "../i18n/locale";

export type AgeGroup = "child" | "teen" | "adult" | "elder";
export type Diet = "veg" | "eggetarian" | "nonveg" | "jain" | "vegan";
export type Spice = 1 | 2 | 3 | 4 | 5;
export type ConsentPurpose = "voice_processing" | "memory" | "analytics";

export type DraftMember = { key: string; displayName: string; ageGroup: AgeGroup; isSelf: boolean };

export const MAX_MEMBERS = 6;
export const MAX_NAME_LENGTH = 40;

/** Version of the privacy notice shown on the consent screen. Bump it whenever that copy changes. */
export const POLICY_VERSION = "2026-11-draft-1";

/** Purposes asked during onboarding. Transcript retention stays off unless chosen later in settings. */
export const ONBOARDING_PURPOSES: ConsentPurpose[] = ["voice_processing", "memory", "analytics"];

/** BCP-47 code stored on the profile and voice profile for each UI language. */
export const LANGUAGE_CODES: Record<Locale, string> = {
  hi: "hi-IN",
  hinglish: "hi-Latn-IN",
  en: "en-IN",
};

/** F7: the code saved for an app language; Kannada is kn-IN. */
export function languageCodeFor(l: Locale | "kn"): string {
  return l === "kn" ? "kn-IN" : LANGUAGE_CODES[l];
}

/** The app language a saved code means (Kannada included). */
export function appLocaleFromLanguageCode(code: string | null | undefined): Locale | "kn" | null {
  if (code?.startsWith("kn")) return "kn";
  return localeFromLanguageCode(code);
}

export function localeFromLanguageCode(code: string | null | undefined): Locale | null {
  if (!code) return null;
  if (code.startsWith("hi-Latn")) return "hinglish";
  if (code.startsWith("hi")) return "hi";
  if (code.startsWith("en")) return "en";
  return null;
}

export type MemberProblem = "none" | "too_many" | "name_missing" | "name_too_long" | "self_missing";

/** Returns the first problem with the member list, or "none". */
export function checkMembers(members: DraftMember[]): MemberProblem {
  if (members.length === 0 || !members.some((m) => m.isSelf)) return "self_missing";
  if (members.length > MAX_MEMBERS) return "too_many";
  for (const m of members) {
    const name = m.displayName.trim();
    if (!name) return "name_missing";
    if (name.length > MAX_NAME_LENGTH) return "name_too_long";
  }
  return "none";
}

/** Children get a gentler start: never above 2 until feedback says otherwise. */
export function spiceFor(ageGroup: AgeGroup, householdSpice: Spice): Spice {
  return ageGroup === "child" ? (Math.min(householdSpice, 2) as Spice) : householdSpice;
}

/** Regional cuisines offered on the taste step (taste_profiles.preferred_cuisines). */
export const CUISINES = [
  "north_indian",
  "south_indian",
  "punjabi",
  "gujarati",
  "maharashtrian",
  "bengali",
  "rajasthani",
  "kerala",
  "hyderabadi",
  "indo_chinese",
  "street_food",
] as const;
export type Cuisine = (typeof CUISINES)[number];

/** "Quick weeknights" means dishes that take 30 minutes or less on weekdays; "take my time" sets no limit. */
export type Pace = "quick" | "relaxed";
export const QUICK_MINUTES = 30;

export type NewMemberInput = {
  displayName: string;
  ageGroup: AgeGroup;
  diet: Diet;
  spice: Spice;
  isSelf: boolean;
  preferredCuisines?: Cuisine[];
  maxTimeMin?: number | null;
};

/** Turns the onboarding draft into the create_household payload. Cuisines and pace are the household's. */
export function buildMembers(
  members: DraftMember[],
  spice: Spice,
  diet: Diet,
  taste: { cuisines?: Cuisine[]; pace?: Pace | null } = {},
): NewMemberInput[] {
  return members.map((m) => ({
    displayName: m.displayName.trim(),
    ageGroup: m.ageGroup,
    diet,
    spice: spiceFor(m.ageGroup, spice),
    isSelf: m.isSelf,
    preferredCuisines: taste.cuisines ?? [],
    maxTimeMin: taste.pace === "quick" ? QUICK_MINUTES : null,
  }));
}

export type AvoidKind = "dislike" | "allergy";
export type DraftAvoid = { ingredientKey: string; kind: AvoidKind };

/** Default household name, e.g. "Sunita's kitchen"; editable later on the You tab. */
export function householdName(members: DraftMember[], template: string): string {
  const self = members.find((m) => m.isSelf)?.displayName.trim();
  return self ? template.replace("{name}", self) : template.replace("{name}", "").trim();
}

export type ConsentChoice = { purpose: ConsentPurpose; granted: boolean };

/** Every purpose asked gets an explicit row, granted or not, so the record shows what was offered (DPDP). */
export function consentRows(choices: Partial<Record<ConsentPurpose, boolean>>): ConsentChoice[] {
  return ONBOARDING_PURPOSES.map((purpose) => ({ purpose, granted: choices[purpose] === true }));
}

/** The memory saved for a dislike or allergy from onboarding (household-wide, polarity -1, so it is avoided). */
export function avoidStatement(item: string, kind: AvoidKind, locale: Locale): string {
  const text: Record<AvoidKind, Record<Locale, string>> = {
    dislike: { en: "We don't like {item}: leave it out", hi: "हमें {item} पसंद नहीं: इसे न डालें", hinglish: "Humein {item} pasand nahi: ise na daalein" },
    allergy: { en: "Allergic to {item}: never use it", hi: "{item} से एलर्जी है: कभी न डालें", hinglish: "{item} se allergy hai: kabhi na daalein" },
  };
  return text[kind][locale].replace("{item}", item);
}
