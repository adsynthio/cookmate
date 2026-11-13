// Your kitchen week (D3): the last seven days at home, said warmly. The live app reads week_recap from the database;
// the preview builds the same shape from its meal log. A week with no cooking says nothing at all: no guilt, no
// streak to lose. No React, no network.
import type { Locale } from "../i18n/locale";

export type WeekRecap = {
  meals: number;
  dishes: { id: string; title: string; titles?: { hi?: string; "hi-Latn"?: string; en?: string } | null; times: number; new: boolean }[];
  /** Things used in cooking within two days of their use-by. */
  saved: number;
  /** Weeks in a row (rolling seven-day blocks) with at least three home-cooked meals. */
  weeksCooking: number;
  loved: { name: string; dish: string }[];
};

const DAY = 86_400_000;

/** The recap from a meal log (preview). `prior` meals older than a week tell which dishes are new. */
export function recapFrom(
  meals: { slug?: string; completedAt: string | Date }[],
  now: number,
  titleOf: (slug: string) => string | null,
  loved: { name: string; dish: string }[] = [],
): WeekRecap {
  const at = (m: { completedAt: string | Date }) => new Date(m.completedAt).getTime();
  const week = meals.filter((m) => now - at(m) < 7 * DAY);
  const before = new Set(meals.filter((m) => now - at(m) >= 7 * DAY && m.slug).map((m) => m.slug!));
  const counts = new Map<string, number>();
  for (const m of week) if (m.slug) counts.set(m.slug, (counts.get(m.slug) ?? 0) + 1);
  const dishes = [...counts.entries()]
    .map(([slug, times]) => ({ id: slug, title: titleOf(slug) ?? slug, times, new: !before.has(slug) }))
    .sort((a, b) => b.times - a.times || a.title.localeCompare(b.title));
  let weeksCooking = 0;
  for (let k = 0; k < 52; k++) {
    const n = meals.filter((m) => now - at(m) >= 7 * DAY * k && now - at(m) < 7 * DAY * (k + 1)).length;
    if (n < 3) break;
    weeksCooking++;
  }
  return { meals: week.length, dishes, saved: 0, weeksCooking, loved };
}

type L = Record<Locale, string>;
const T: Record<string, L> = {
  great: { en: "A lovely week of home cooking", hi: "घर के खाने का बढ़िया हफ़्ता", hinglish: "Ghar ke khane ka badhiya hafta" },
  some: { en: "{n} home-cooked meals this week", hi: "इस हफ़्ते घर पर {n} बार खाना बना", hinglish: "Is hafte ghar par {n} baar khana bana" },
  one: { en: "One home-cooked meal this week", hi: "इस हफ़्ते घर पर एक बार खाना बना", hinglish: "Is hafte ghar par ek baar khana bana" },
  favourite: { en: "Most cooked: {dish} ({n} times)", hi: "सबसे ज़्यादा बना: {dish} ({n} बार)", hinglish: "Sabse zyada bana: {dish} ({n} baar)" },
  newOne: { en: "Something new: {dishes}", hi: "कुछ नया बना: {dishes}", hinglish: "Kuch naya bana: {dishes}" },
  saved: { en: "{n} things used before they went off", hi: "{n} चीज़ें खराब होने से पहले इस्तेमाल हुईं", hinglish: "{n} cheezein kharab hone se pehle use huin" },
  loved: { en: "{name} loved the {dish}", hi: "{name} को {dish} बहुत पसंद आया", hinglish: "{name} ko {dish} bahut pasand aaya" },
  weeks: { en: "{n} weeks in a row of cooking at home", hi: "लगातार {n} हफ़्ते घर का खाना", hinglish: "Lagataar {n} hafte ghar ka khana" },
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/** Headline and up to four warm lines, or null for a week with no cooking (the card stays away). */
export function recapLines(r: WeekRecap, locale: Locale, title: (d: WeekRecap["dishes"][number]) => string = (d) => d.title): { headline: string; lines: string[] } | null {
  if (r.meals === 0) return null;
  const L = (k: string, v: Record<string, string | number> = {}) => fill(T[k]![locale], v);
  const headline = r.meals >= 5 ? L("great") : r.meals === 1 ? L("one") : L("some", { n: r.meals });
  const lines: string[] = [];
  const top = r.dishes[0];
  if (top && top.times >= 2) lines.push(L("favourite", { dish: title(top), n: top.times }));
  const fresh = r.dishes.filter((d) => d.new).map(title);
  if (fresh.length) lines.push(L("newOne", { dishes: fresh.slice(0, 2).join(", ") }));
  if (r.saved > 0) lines.push(L("saved", { n: r.saved }));
  if (r.loved[0]) lines.push(L("loved", { name: r.loved[0].name, dish: r.loved[0].dish }));
  if (r.weeksCooking >= 2) lines.push(L("weeks", { n: r.weeksCooking }));
  return { headline, lines: lines.slice(0, 4) };
}
