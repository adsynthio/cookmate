// Fast-path cooking commands on the phone (KIT-084, VOICE-12): next, back, repeat, slower, pause, resume, done,
// timers and whistles, matched without any server so hands-free cooking keeps working with no network. A port of
// services/voice-agent/cookmate_voice/fast_path.py; both are tested against the same phrases, so keep them in step.

export type Command = "next" | "back" | "repeat" | "slower" | "pause" | "resume" | "done" | "timer_set" | "timer_check" | "whistle";
export type FastPathMatch = { command: Command; minutes?: number; label?: string | null };

// Number words people actually say for timers ("das minute", "पाँच मिनट", "fifteen minutes").
const NUMBERS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6, saat: 7, aath: 8, nau: 9, das: 10, dus: 10,
  barah: 12, baarah: 12, pandrah: 15, pandra: 15, bees: 20, pachchis: 25, pachees: 25, tees: 30, paintalis: 45, chalis: 40,
  aadha: 0.5, dedh: 1.5, dhai: 2.5,
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पाँच": 5, "पांच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
  "बारह": 12, "पंद्रह": 15, "पन्द्रह": 15, "बीस": 20, "पच्चीस": 25, "तीस": 30, "चालीस": 40, "पैंतालीस": 45, "आधा": 0.5, "डेढ़": 1.5, "ढाई": 2.5,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20,
  thirty: 30, forty: 40, half: 0.5,
};

const MINUTE_WORDS = "(?:minute|minutes|min|mins|minat|mint|मिनट)";
const HOUR_WORDS = "(?:hour|hours|ghanta|ghante|घंटा|घंटे)";
const TIMER_WORDS = "(?:timer|टाइमर|alarm)";
// Polite filler allowed around a command, so "acha, agla" is next but "agla step mein kitna namak" is a question.
const FILLER = "(?:please|plz|ji|jee|zara|jara|bhai|ab|acha|accha|ok|okay|theek hai|haan|जी|ज़रा|अब|अच्छा|हाँ|ठीक है)";

// Order matters: more specific patterns first.
const PATTERNS: [Command, string][] = [
  ["whistle", "(?:ek |1 |one |एक )?(?:seeti|siti|seetee|whistle|सीटी)(?: (?:hui|ho gayi|aayi|baji|हुई|हो गई|आई|बजी|came|done))?"],
  ["timer_check", "(?:kitna|kitne|how much|कितना|कितने) (?:time|samay|der|समय|टाइम|देर) (?:bacha|baaki|baki|left|बचा|बाकी)(?: hai| है)?"],
  ["slower", "(?:thoda |thora |थोड़ा )?(?:dheere|dhire|dheeray|slowly|slower|slow|धीरे)(?: (?:bolo|boliye|batao|बोलो|बोलिए|बताओ))?"],
  ["repeat", "(?:phir se|fir se|dobara|repeat|again|once more|फिर से|दोबारा)(?: (?:bolo|boliye|batao|बोलो|बोलिए|बताओ|please))?"],
  ["back", "(?:pichla|pichhla|peeche|previous|go back|back|पिछला|पीछे)(?: (?:wala|step|वाला))?(?: (?:batao|bolo|बताओ|बोलो))?"],
  ["pause", "(?:ruko|ruk jao|ruk|rukiye|wait|pause|hold on|stop|रुको|रुक जाओ|रुकिए)"],
  ["resume", "(?:chalo|chaliye|continue|resume|aage chalo|आगे चलो|चलो|चलिए)"],
  ["done", "(?:sab ho gaya|khana ban gaya|ban gaya|finished|all done|we are done|सब हो गया|बन गया|खाना बन गया)"],
  ["next", "(?:agla|agle|next|aage|ho gaya|hogaya|done|kar liya|हो गया|अगला|आगे|कर लिया)(?: (?:step|batao|bolo|kya hai|wala|बताओ|बोलो|क्या है|वाला))?"],
];
const COMPILED = PATTERNS.map(([cmd, pat]) => [cmd, new RegExp(`^(?:${FILLER} )*${pat}(?: ${FILLER})*$`, "u")] as const);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NUMBER_WORDS = Object.keys(NUMBERS).sort((a, b) => b.length - a.length).map(escape).join("|");
const TIMER_RE = new RegExp(
  `^(?<label>.*?)\\s*(?<num>\\d+(?:\\.\\d+)?|${NUMBER_WORDS})\\s*(?<unit>${MINUTE_WORDS}|${HOUR_WORDS})\\s*(?:ka|ki|ke|का|की|के|for)?\\s*${TIMER_WORDS}` +
    "(?:\\s*(?:laga do|lagao|lagado|set karo|set|start|chalu karo|लगा दो|लगाओ|शुरू करो))?$",
  "u",
);

// Word edges that understand Devanagari (JavaScript's \b only knows ASCII).
const W = "[\\p{L}\\p{M}\\p{N}_]";
const word = (alts: string) => new RegExp(`(?<!${W})(?:${alts})(?!${W})`, "gu");

export function normalise(text: string): string {
  return text.normalize("NFC").toLowerCase().trim().replace(/[।,.!?"'“”‘’]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function parseNumber(token: string): number | null {
  const n = Number(token);
  if (token !== "" && Number.isFinite(n)) return n;
  return NUMBERS[token] ?? null;
}

function cleanLabel(raw: string): string | null {
  let label = raw.replace(word("ke liye|के लिए|ka|ki|ke|for|का|की|के"), " ");
  label = label.replace(new RegExp(`^\\s*(?:please )?(?:set|start|put|laga do|lagao)(?: an?| the)?(?!${W})`, "u"), " ");
  label = label.replace(new RegExp(`^\\s*(?:an?|the)(?!${W})`, "u"), " ");
  label = label.trim().replace(new RegExp(`^(?:${FILLER} )+`, "u"), "");
  label = label.replace(/\s+/gu, " ").trim();
  return label || null;
}

/** The command for what the cook said, or null when it is anything else (a question, a problem). */
export function match(utterance: string): FastPathMatch | null {
  const text = normalise(utterance);
  if (!text) return null;

  const timer = TIMER_RE.exec(text);
  if (timer?.groups) {
    const n = parseNumber(timer.groups.num!);
    if (n !== null && n > 0) {
      const minutes = new RegExp(`^${HOUR_WORDS}$`, "u").test(timer.groups.unit!) ? n * 60 : n;
      return { command: "timer_set", minutes, label: cleanLabel(timer.groups.label!) };
    }
  }
  for (const [command, re] of COMPILED) if (re.test(text)) return { command };
  return null;
}

/** Words the on-device recogniser should listen for, so short commands are heard right. */
export const HINT_PHRASES = ["agla", "next", "ho gaya", "pichla", "phir se", "repeat", "dheere", "ruko", "chalo", "seeti", "timer", "minute", "अगला", "पिछला", "फिर से", "रुको", "सीटी", "टाइमर"];
