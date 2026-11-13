// "Medium heat" in the stove's own words. Recipes say low / medium / high and name the technique (tadka, simmer,
// pressure cook...); this turns that into a gas flame or an induction setting, by level (1-8 or 1-10) or by watts,
// with the oil temperature for frying and a short note where induction behaves differently. The numbers are for a
// typical 2000 W Indian induction; the cook can always go a level up or down. No React, no network.
import type { Locale } from "../i18n/locale";
import type { InductionPower } from "./tools";

export type Stove = "gas" | "induction";
type Heat = "low" | "medium" | "high";
/** Power as a share of full (2000 W): what each heat means on induction. */
type Level = "low" | "medLow" | "medium" | "medHigh" | "high";

const SHARE: Record<Level, number> = { low: 0.4, medLow: 0.5, medium: 0.6, medHigh: 0.8, high: 0.9 };
const FULL_WATTS = 2000;

type Plan = { level: Level; then?: Level; tempC?: string; note?: NoteKey };
type NoteKey = "tadkaFast" | "fryTest" | "simmerCycles" | "cookerBase" | "tawaFlat" | "kadaiFlat";

/**
 * What the step needs. The recipe's own heat sets the level when it gives one; the technique fills in the rest (the
 * level when the recipe is silent, oil temperature, "then lower after the whistle", induction notes).
 * Null: nothing on the stove (soak, batter).
 */
export function planFor(step: { heat?: Heat | null; technique?: string | null }): Plan | null {
  const base = techniquePlan(step.technique);
  if (base === null) return null;
  if (!step.heat) return base ?? null;
  const level: Level = step.heat === "low" ? "low" : step.heat === "high" ? "high" : "medium";
  return base ? { ...base, level } : { level };
}

/** The technique's usual plan; null for steps off the stove; undefined when the technique says nothing. */
function techniquePlan(technique: string | null | undefined): Plan | null | undefined {
  switch (technique) {
    case "tadka":
      return { level: "medHigh", note: "tadkaFast" };
    case "deep_fry":
      return { level: "medHigh", tempC: "170–180", note: "fryTest" };
    case "shallow_fry":
      return { level: "medium", tempC: "160–170" };
    case "pressure_cook":
      return { level: "high", then: "medLow", note: "cookerBase" };
    case "simmer":
      return { level: "low", note: "simmerCycles" };
    case "tawa_cook":
      return { level: "medHigh", note: "tawaFlat" };
    case "saute_onion":
    case "bhuna":
      return { level: "medium", note: "kadaiFlat" };
    case "soak":
    case "batter":
    case "marinate":
      return null;
  }
  return undefined;
}

type L = Record<Locale, string>;
const GAS: Record<Level, L> = {
  low: { en: "Low flame", hi: "धीमी आँच", hinglish: "Dheemi aanch" },
  medLow: { en: "Low to medium flame", hi: "हल्की-मध्यम आँच", hinglish: "Halki-madhyam aanch" },
  medium: { en: "Medium flame", hi: "मध्यम आँच", hinglish: "Madhyam aanch" },
  medHigh: { en: "Medium-high flame", hi: "तेज़-मध्यम आँच", hinglish: "Tez-madhyam aanch" },
  high: { en: "High flame", hi: "तेज़ आँच", hinglish: "Tez aanch" },
};
const T = {
  level: { en: "Level {n} of {max}", hi: "{max} में से लेवल {n}", hinglish: "{max} mein se level {n}" },
  watts: { en: "About {w} W", hi: "लगभग {w} वॉट", hinglish: "Lagbhag {w} watt" },
  approx: { en: " (about {w} W)", hi: " (लगभग {w} वॉट)", hinglish: " (lagbhag {w} watt)" },
  then: { en: "{a} until the first whistle, then {b}", hi: "पहली सीटी तक {a}, फिर {b}", hinglish: "Pehli seeti tak {a}, phir {b}" },
  temp: { en: " · oil at {t}°C", hi: " · तेल {t}°C", hinglish: " · tel {t}°C" },
  thenShort: { en: "level {n}", hi: "लेवल {n}", hinglish: "level {n}" },
  thenWatts: { en: "{w} W", hi: "{w} वॉट", hinglish: "{w} watt" },
} as const;
const NOTES: Record<NoteKey, Record<Stove | "both", L | null>> = {
  tadkaFast: {
    gas: null,
    induction: { en: "Induction heats oil fast: have the seeds ready and add them within 30 seconds.", hi: "इंडक्शन पर तेल जल्दी गरम होता है: जीरा-राई तैयार रखें और 30 सेकंड में डालें।", hinglish: "Induction par tel jaldi garam hota hai: jeera-rai taiyaar rakhein aur 30 second mein daalein." },
    both: null,
  },
  fryTest: {
    both: { en: "Ready when a drop of batter rises at once with small bubbles.", hi: "घोल की एक बूँद तुरंत छोटे बुलबुलों के साथ ऊपर आए, तब तेल तैयार है।", hinglish: "Ghol ki ek boond turant chhote bulbulon ke saath upar aaye, tab tel taiyaar hai." },
    gas: null,
    induction: null,
  },
  simmerCycles: {
    gas: null,
    induction: { en: "On low, many inductions click on and off; that's normal. If it still boils hard, go one level lower.", hi: "धीमी पावर पर कई इंडक्शन बंद-चालू होते हैं, यह सामान्य है। फिर भी तेज़ उबले तो एक लेवल कम करें।", hinglish: "Dheemi power par kai induction band-chaalu hote hain, yeh normal hai. Phir bhi tez ubale to ek level kam karein." },
    both: null,
  },
  cookerBase: {
    gas: null,
    induction: { en: "Use an induction-base cooker (a magnet sticks to its bottom).", hi: "इंडक्शन-बेस कुकर लें (उसके तले पर चुंबक चिपकता है)।", hinglish: "Induction-base cooker lein (uske tale par magnet chipakta hai)." },
    both: null,
  },
  tawaFlat: {
    gas: null,
    induction: { en: "Use a flat induction tawa; a curved iron tawa won't heat evenly.", hi: "समतल इंडक्शन तवा लें; घुमावदार लोहे का तवा बराबर गरम नहीं होगा।", hinglish: "Samtal induction tawa lein; ghumavdaar lohe ka tawa barabar garam nahi hoga." },
    both: null,
  },
  kadaiFlat: {
    gas: null,
    induction: { en: "A round-bottom kadai won't heat on induction; use a flat-bottom one.", hi: "गोल तले की कड़ाही इंडक्शन पर गरम नहीं होगी; समतल तले वाली लें।", hinglish: "Gol tale ki kadhai induction par garam nahi hogi; samtal tale wali lein." },
    both: null,
  },
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const round50 = (w: number) => Math.round(w / 50) * 50;

function inductionWords(level: Level, power: InductionPower, locale: Locale, short = false): string {
  const w = round50(SHARE[level] * FULL_WATTS);
  if (power.style === "watts") return fill((short ? T.thenWatts : T.watts)[locale], { w });
  const n = Math.max(1, Math.min(power.max, Math.round(SHARE[level] * power.max)));
  return short ? fill(T.thenShort[locale], { n }) : fill(T.level[locale], { n, max: power.max }) + fill(T.approx[locale], { w });
}

/** The setting line (and a note) for this step on this stove, or null when the step doesn't use the stove. */
export function stoveSetting(
  step: { heat?: Heat | null; technique?: string | null },
  stove: Stove,
  power: InductionPower,
  locale: Locale,
  /** Notes about pans are said once per cook, not at every step. */
  seenNotes: ReadonlySet<string> = new Set(),
): { line: string; note: string | null; noteKey: string | null } | null {
  const plan = planFor(step);
  if (!plan) return null;
  const words = (lv: Level, short = false) => (stove === "gas" ? GAS[lv][locale].toLowerCase() : inductionWords(lv, power, locale, short));
  let line: string;
  if (plan.then) {
    const a = stove === "gas" ? GAS[plan.level][locale] : inductionWords(plan.level, power, locale);
    line = fill(T.then[locale], { a, b: words(plan.then, stove === "induction") });
  } else {
    line = stove === "gas" ? GAS[plan.level][locale] : inductionWords(plan.level, power, locale);
  }
  if (plan.tempC) line += fill(T.temp[locale], { t: plan.tempC });
  // The "clicks on and off" note is about low power only.
  const noteSet = plan.note && !(plan.note === "simmerCycles" && plan.level !== "low") ? NOTES[plan.note] : null;
  const noteL = noteSet ? (noteSet[stove] ?? noteSet.both) : null;
  const once = plan.note === "kadaiFlat" || plan.note === "tawaFlat" || plan.note === "cookerBase";
  const show = noteL && !(once && seenNotes.has(plan.note!));
  return { line, note: show ? noteL[locale] : null, noteKey: show ? plan.note! : null };
}
