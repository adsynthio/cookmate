// KIT-180: ideas to use up leftovers. A leftover is known by what it is called ("Dal Tadka leftovers" saved after
// cooking, "leftover dal" typed in, "बचा हुआ राजमा"), so the kind of dish is read from the name in English, Hindi or
// Hinglish, and each kind has two or three quick, everyday ways to turn it into a new meal. Rice gets the food-safety
// line first: cooled fast, kept cold, eaten within a day and heated through only once.

export type LeftoverKind = "dal" | "rajma" | "rice" | "khichdi" | "roti" | "sabzi" | "curry" | "kadhi" | "poha" | "other";

export type LeftoverIdea =
  | "dalParatha"
  | "dalTadka"
  | "dalChilla"
  | "rajmaWrap"
  | "rajmaTikki"
  | "lemonRice"
  | "friedRice"
  | "curdRice"
  | "khichdiTikki"
  | "khichdiParatha"
  | "rotiNoodles"
  | "rotiChuri"
  | "stuffedParatha"
  | "toastie"
  | "curryWrap"
  | "curryPulao"
  | "kadhiChawal"
  | "kadhiPakora"
  | "pohaCutlet"
  | "anyWrap";

/** Most specific first: "rajma chawal" is rajma, "dal khichdi" is khichdi, "paneer sabzi" is a curry. */
const WORDS: [LeftoverKind, RegExp][] = [
  ["khichdi", /khichd|खिचड़ी|खिचडी/i],
  ["rajma", /rajma|chole|chhole|chana masala|राजमा|छोले/i],
  ["kadhi", /kadhi|kadi\b|कढ़ी|कढी/i],
  ["poha", /poha|chilla|cheela|पोहा|चीला|चिल्ला/i],
  ["curry", /chicken|mutton|fish|egg|anda|paneer|kofta|curry|चिकन|मटन|मछली|अंडा|अंडे|पनीर|कोफ्ता/i],
  ["dal", /\bdal|daal|sambar|दाल|सांभर/i],
  ["roti", /roti|chapati|chapat|phulka|paratha|रोटी|चपाती|पराठा|फुलका/i],
  ["rice", /rice|chawal|pulao|biryani|चावल|पुलाव|बिरयानी|भात/i],
  ["sabzi", /sabzi|sabji|aloo|bhaji|bhindi|gobhi|matar|baingan|सब्ज़ी|सब्जी|आलू|भिंडी|गोभी|मटर|बैंगन/i],
];

export function leftoverKind(name: string | null | undefined): LeftoverKind {
  const n = (name ?? "").trim();
  for (const [kind, re] of WORDS) if (re.test(n)) return kind;
  return "other";
}

export const LEFTOVER_IDEAS: Record<LeftoverKind, LeftoverIdea[]> = {
  dal: ["dalParatha", "dalChilla", "dalTadka"],
  rajma: ["rajmaWrap", "rajmaTikki"],
  rice: ["lemonRice", "curdRice", "friedRice"],
  khichdi: ["khichdiTikki", "khichdiParatha"],
  roti: ["rotiNoodles", "rotiChuri"],
  sabzi: ["stuffedParatha", "toastie"],
  curry: ["curryWrap", "curryPulao"],
  kadhi: ["kadhiChawal", "kadhiPakora"],
  poha: ["pohaCutlet", "anyWrap"],
  other: ["anyWrap"],
};

/** Kinds whose leftovers need the rice safety line (Bacillus cereus spores survive cooking). */
export function needsRiceCare(kind: LeftoverKind): boolean {
  return kind === "rice" || kind === "khichdi";
}

/** Ideas for a pantry item, or none when it is not cooked food. */
export function ideasFor(item: { name: string; state: string }): { kind: LeftoverKind; ideas: LeftoverIdea[] } | null {
  if (item.state !== "leftover" && item.state !== "cooked") return null;
  const kind = leftoverKind(item.name);
  return { kind, ideas: LEFTOVER_IDEAS[kind] };
}
