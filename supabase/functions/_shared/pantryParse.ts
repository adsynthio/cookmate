// GENERATED from apps/mobile/src/domain/pantryParse.ts by scripts/sync-shared.py. Do not edit; edit the source and re-run.
// Rule-based pantry parser (KIT-031): "do kilo aloo, ek dozen ande, thoda atta" -> structured items.
// Handles Hindi (Devanagari), Hinglish and English numbers, fractions and units, and maps names to the catalog.
// The parse-inventory Edge Function runs this first and only calls the model for what it can't place.
// Pure TypeScript with no imports so the same file runs in the app, in node tests and in Deno
// (supabase/functions/_shared/pantryParse.ts is a generated copy; edit this file).

export type LocationKind = "fridge" | "freezer" | "pantry" | "staples" | "ready_made" | "counter";
export type ItemState = "raw" | "opened" | "cooked" | "homemade" | "leftover";

/** Minimal catalog entry the parser needs. */
export type CatalogEntry = {
  name: string; // canonical English name
  hi?: string; // Devanagari
  latn?: string; // Hinglish
  aliases?: string[];
  location?: LocationKind;
  unit?: string;
  staple?: boolean;
};

export type ParsedItem = {
  /** What the user said, cleaned up (shown on the confirm sheet). */
  said: string;
  /** Canonical catalog name, when matched. */
  ingredientKey: string | null;
  quantity: number | null;
  unit: string | null;
  locationKind: LocationKind | null;
  state: ItemState | null;
  /** How sure the parser is about this item, 0-1. Below 0.8 the confirm sheet highlights it. */
  confidence: number;
};

const NUMBER_WORDS: Record<string, number> = {
  // Hinglish
  ek: 1, ik: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, paach: 5, chhe: 6, che: 6, chah: 6,
  saat: 7, sat: 7, aath: 8, ath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, baarah: 12, pandrah: 15, bees: 20,
  pachaas: 50, pachas: 50, sau: 100,
  aadha: 0.5, adha: 0.5, aadhi: 0.5, adhi: 0.5, dedh: 1.5, derh: 1.5, dhai: 2.5, dhaai: 2.5, adhai: 2.5, dhaee: 2.5,
  // Devanagari
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
  "बारह": 12, "बीस": 20, "पचास": 50, "सौ": 100, "आधा": 0.5, "आधी": 0.5, "डेढ़": 1.5, "डेढ": 1.5, "ढाई": 2.5,
  // English
  one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
  twenty: 20, fifty: 50, hundred: 100, half: 0.5,
};

/** "sawa do" = 2.25, "paune do" = 1.75 */
const MODIFIERS: Record<string, number> = { sawa: 0.25, "सवा": 0.25, paune: -0.25, pone: -0.25, "पौने": -0.25 };

type Unit = { unit: string; factor: number };
const UNITS: Record<string, Unit> = {
  kg: { unit: "kg", factor: 1 }, kgs: { unit: "kg", factor: 1 }, kilo: { unit: "kg", factor: 1 }, kilos: { unit: "kg", factor: 1 },
  kilogram: { unit: "kg", factor: 1 }, kilograms: { unit: "kg", factor: 1 }, "किलो": { unit: "kg", factor: 1 },
  g: { unit: "g", factor: 1 }, gm: { unit: "g", factor: 1 }, gms: { unit: "g", factor: 1 }, gram: { unit: "g", factor: 1 },
  grams: { unit: "g", factor: 1 }, "ग्राम": { unit: "g", factor: 1 },
  l: { unit: "l", factor: 1 }, ltr: { unit: "l", factor: 1 }, litre: { unit: "l", factor: 1 }, liter: { unit: "l", factor: 1 },
  litres: { unit: "l", factor: 1 }, liters: { unit: "l", factor: 1 }, "लीटर": { unit: "l", factor: 1 },
  ml: { unit: "ml", factor: 1 }, "मिली": { unit: "ml", factor: 1 },
  dozen: { unit: "piece", factor: 12 }, darjan: { unit: "piece", factor: 12 }, "दर्जन": { unit: "piece", factor: 12 },
  piece: { unit: "piece", factor: 1 }, pieces: { unit: "piece", factor: 1 }, pc: { unit: "piece", factor: 1 },
  pcs: { unit: "piece", factor: 1 }, nag: { unit: "piece", factor: 1 },
  packet: { unit: "packet", factor: 1 }, packets: { unit: "packet", factor: 1 }, pack: { unit: "packet", factor: 1 },
  "पैकेट": { unit: "packet", factor: 1 },
  bunch: { unit: "bunch", factor: 1 }, gaddi: { unit: "bunch", factor: 1 }, gaddiyan: { unit: "bunch", factor: 1 },
  "गड्डी": { unit: "bunch", factor: 1 },
  katori: { unit: "katori", factor: 1 }, "कटोरी": { unit: "katori", factor: 1 },
  cup: { unit: "cup", factor: 1 }, cups: { unit: "cup", factor: 1 },
  bottle: { unit: "bottle", factor: 1 }, bottles: { unit: "bottle", factor: 1 }, botal: { unit: "bottle", factor: 1 },
  dabba: { unit: "box", factor: 1 }, dibba: { unit: "box", factor: 1 }, box: { unit: "box", factor: 1 },
};

/** "paav kilo" / "pao kilo" = a quarter kilo. A bare "pav" is bread, so only treat it as a quarter before a unit. */
const QUARTER = new Set(["paav", "pav", "pao", "pau", "पाव"]);

const LOCATION_WORDS: Record<string, LocationKind> = {
  fridge: "fridge", "फ्रिज": "fridge", freezer: "freezer", "फ्रीजर": "freezer", pantry: "pantry",
};

/** Words that carry no item meaning ("hai", "liya", "aur", "some"...). */
const FILLER = new Set([
  "hai", "hain", "he", "h", "bhi", "aur", "or", "and", "liya", "liye", "laya", "laaye", "laye", "lae", "le", "aaya", "aaye",
  "rakha", "rakhe", "rakhi", "mein", "me", "main", "ka", "ki", "ke", "se", "ko", "wala", "wali", "wale", "abhi", "bas",
  "kuch", "thoda", "thodi", "thode", "zyada", "jyada", "kam", "sa", "si",
  "i", "have", "got", "bought", "some", "of", "in", "the", "we", "there", "is", "are", "added", "add", "also", "my",
  "है", "हैं", "भी", "और", "लिया", "लाया", "में", "का", "की", "के", "थोड़ा", "थोड़ी", "कुछ",
]);

const HOMEMADE = new Set(["ghar", "homemade", "home-made", "घर"]);

export function normalise(s: string): string {
  return s.toLowerCase().replace(/[.!?"“”'’()]/g, " ").replace(/\s+/g, " ").trim();
}

export type CatalogIndex = Map<string, CatalogEntry>;

/** Every spoken form (name, Hinglish, Hindi, aliases, simple plurals) -> catalog entry. */
export function buildIndex(catalog: CatalogEntry[]): CatalogIndex {
  const index: CatalogIndex = new Map();
  const add = (key: string | undefined, entry: CatalogEntry) => {
    if (!key) return;
    const k = normalise(key);
    if (k && !index.has(k)) index.set(k, entry);
  };
  for (const e of catalog) add(e.name, e);
  for (const e of catalog) {
    add(e.latn, e);
    add(e.hi, e);
    for (const a of e.aliases ?? []) add(a, e);
  }
  for (const e of catalog) {
    // Hindi plurals: अंडा -> अंडे, केला -> केले; Hinglish anda -> ande is covered by aliases.
    if (e.hi?.endsWith("ा")) add(`${e.hi.slice(0, -1)}े`, e);
    if (!e.name.endsWith("s")) add(`${e.name}s`, e);
    if (/(o|ch|sh)$/.test(e.name)) add(`${e.name}es`, e);
  }
  return index;
}

/** Splits "do kilo aloo, ek dozen ande aur thoda atta" into one segment per item. */
export function splitItems(text: string): string[] {
  return text
    .split(/[,;\n।|]+|\s+(?:aur|and|or|और|तथा|plus)\s+|\s*&\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNumber(token: string): number | null {
  if (/^\d+(\.\d+)?$/.test(token)) return Number(token);
  if (/^\d+\/\d+$/.test(token)) {
    const [a, b] = token.split("/").map(Number);
    return b ? (a as number) / (b as number) : null;
  }
  if (/^[०-९]+$/.test(token)) return Number([...token].map((c) => c.charCodeAt(0) - 0x0966).join(""));
  return NUMBER_WORDS[token] ?? null;
}

/** Finds the longest run of tokens that names a catalog entry. */
function findIngredient(tokens: string[], index: CatalogIndex): { entry: CatalogEntry; start: number; end: number } | null {
  for (let len = Math.min(tokens.length, 5); len >= 1; len--) {
    for (let start = 0; start + len <= tokens.length; start++) {
      const entry = index.get(tokens.slice(start, start + len).join(" "));
      if (entry) return { entry, start, end: start + len };
    }
  }
  return null;
}

/** Parses one item segment. Returns null for segments with nothing in them ("bas", "hai"). */
export function parseSegment(segment: string, index: CatalogIndex): ParsedItem | null {
  let tokens = normalise(segment).split(" ").filter(Boolean);
  let quantity: number | null = null;
  let unit: string | null = null;
  let locationKind: LocationKind | null = null;
  let state: ItemState | null = null;
  let vague = false;
  const rest: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as string;
    const next = tokens[i + 1];
    if (t in MODIFIERS && next !== undefined && parseNumber(next) !== null) {
      quantity = (parseNumber(next) as number) + (MODIFIERS[t] as number);
      i++;
      continue;
    }
    if (QUARTER.has(t) && next !== undefined && UNITS[next]?.unit === "kg") {
      quantity = 0.25;
      unit = "kg";
      i++;
      continue;
    }
    const n = parseNumber(t);
    // "a"/"an" only count as one before a unit or a known item ("a dozen eggs"), never inside a name.
    if (n !== null && quantity === null && !((t === "a" || t === "an") && next === undefined)) {
      quantity = n;
      continue;
    }
    // "2kg", "500g", "1.5l"
    const glued = /^(\d+(?:\.\d+)?)([a-zऀ-ॿ]+)$/.exec(t);
    if (glued && UNITS[glued[2] as string] && quantity === null) {
      const u = UNITS[glued[2] as string] as Unit;
      quantity = Number(glued[1]) * u.factor;
      unit = u.unit;
      continue;
    }
    if (UNITS[t] && unit === null) {
      const u = UNITS[t] as Unit;
      unit = u.unit;
      quantity = (quantity ?? 1) * u.factor;
      continue;
    }
    if (LOCATION_WORDS[t]) {
      locationKind = LOCATION_WORDS[t] as LocationKind;
      continue;
    }
    if (HOMEMADE.has(t)) {
      state = "homemade";
      locationKind ??= "ready_made";
      continue;
    }
    if (t === "bacha" || t === "bachi" || t === "leftover" || t === "बचा") {
      state = "leftover";
      continue;
    }
    if (t === "thoda" || t === "thodi" || t === "kuch" || t === "some") vague = true;
    if (FILLER.has(t)) continue;
    rest.push(t);
  }

  tokens = rest;
  if (tokens.length === 0) return null;
  const said = tokens.join(" ");
  const hit = findIngredient(tokens, index);
  if (!hit) {
    return { said, ingredientKey: null, quantity, unit, locationKind, state, confidence: 0.4 };
  }
  // Leftover words around the match ("aloo bhujia" vs "aloo") mean we may have matched the wrong thing.
  const extra = tokens.length - (hit.end - hit.start);
  let confidence = extra === 0 ? 0.92 : 0.6;
  if (vague && quantity === null) confidence = Math.min(confidence, 0.9);
  if (hit.entry.staple && quantity === null) confidence = Math.max(confidence, extra === 0 ? 0.92 : 0.6);
  return {
    said,
    ingredientKey: hit.entry.name,
    quantity,
    unit: unit ?? (quantity !== null ? (hit.entry.unit ?? null) : null),
    locationKind,
    state,
    confidence,
  };
}

/** Parses a whole utterance into items, in the order they were said. */
export function parsePantryText(text: string, index: CatalogIndex): ParsedItem[] {
  return splitItems(text)
    .map((segment) => parseSegment(segment, index))
    .filter((item): item is ParsedItem => item !== null);
}

/** True when every item was placed confidently, so no model call is needed. */
export function allConfident(items: ParsedItem[], threshold = 0.8): boolean {
  return items.length > 0 && items.every((i) => i.confidence >= threshold);
}
