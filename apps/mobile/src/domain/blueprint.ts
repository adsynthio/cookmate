// Sprint 15 M2, "the cook's mind": any dish is a few parts you already know. A recipe is read as the techniques its
// steps use, in order ("boondi ladoo = make a batter → deep fry → sugar syrup → shape"), so a fancy dish shows as
// "Looks fancy, is easy: 4 parts, you've done 3 of them", and how hard it is comes from the parts, not the name.
// Steps the recipe didn't tag get their technique from the words. Pure TypeScript.
import type { RecipeDoc } from "./recipes.ts";

/** Techniques that count as a part of a dish (catalog slugs, content/catalog/techniques.yaml). */
export const TECHNIQUES = [
  "soak", "marinate", "batter", "knead", "make_chenna", "pressure_cook", "saute_onion", "bhuna", "tadka", "simmer",
  "reduce_milk", "sugar_syrup", "deep_fry", "shallow_fry", "tawa_cook", "dry_roast", "steam", "dum", "dhungar", "shape", "set_chill",
] as const;
export type Technique = (typeof TECHNIQUES)[number];

/** How hard each technique is, 1 (anyone) to 3 (needs a feel for it). */
export const TECHNIQUE_LEVEL: Record<Technique, 1 | 2 | 3> = {
  soak: 1, marinate: 1, batter: 1, knead: 2, make_chenna: 2, pressure_cook: 1, saute_onion: 1, bhuna: 2, tadka: 1, simmer: 1,
  reduce_milk: 2, sugar_syrup: 3, deep_fry: 2, shallow_fry: 1, tawa_cook: 2, dry_roast: 1, steam: 1, dum: 2, dhungar: 2, shape: 1, set_chill: 1,
};

// Words that give away an untagged step's technique, most specific first.
const WORDS: [RegExp, Technique][] = [
  [/\b(one|two|1|2)[- ]string|chashni|sugar syrup|\bsyrup\b/, "sugar_syrup"],
  [/\b(chenna|chhena|split the milk|curdle the milk)/, "make_chenna"],
  [/\breduce .{0,20}milk|milk .{0,30}(thick|reduce)|\brabdi\b/, "reduce_milk"],
  [/\bdeep[- ]fry|\bfry .{0,30}(in batches|in hot oil|until golden and crisp)|into the hot oil/, "deep_fry"],
  [/\bshallow[- ]fry|\bpan[- ]fry/, "shallow_fry"],
  [/\bpressure[- ]cook|\bcooker\b|\bwhistles?\b/, "pressure_cook"],
  [/\bknead|\bdough\b/, "knead"],
  [/\bbatter\b/, "batter"],
  [/\bsoak/, "soak"],
  [/\bmarinat/, "marinate"],
  [/\btadka|\btemper|\bcrackle|\bsplutter/, "tadka"],
  [/\b(oil (separates|leaves)|bhuno|bhuna)\b/, "bhuna"],
  [/\bonions? .{0,30}(golden|brown)|\bbrown the onion/, "saute_onion"],
  [/\b(roll|shape) .{0,30}(balls|ladoo|laddoo|rounds)|\bshape\b/, "shape"],
  [/\b(chill|set in the fridge|refrigerate|let it set)\b/, "set_chill"],
  [/\bsteam\b/, "steam"],
  [/\bdry[- ]roast|\broast .{0,20}(without oil|on a dry)/, "dry_roast"],
  [/\btawa\b|\bgriddle\b/, "tawa_cook"],
  [/\bdum\b|\bseal the lid/, "dum"],
  [/\bsmok(e|ing) .{0,20}charcoal|\bdhungar\b/, "dhungar"],
  [/\bsimmer|\bboil\b/, "simmer"],
];

/** The technique of a step: its tag, or what its words give away; null for plain steps ("serve hot"). */
export function stepTechnique(step: { technique?: string; text: string }): Technique | null {
  if (step.technique && (TECHNIQUES as readonly string[]).includes(step.technique)) return step.technique as Technique;
  const t = step.text.toLowerCase();
  return WORDS.find(([re]) => re.test(t))?.[1] ?? null;
}

export type Part = { technique: Technique; steps: number[] };

/** The dish as its parts, in the order they first come, each with its step numbers (1-based). At most six. */
export function blueprint(doc: Pick<RecipeDoc, "steps">): Part[] {
  const parts: Part[] = [];
  doc.steps.forEach((s, i) => {
    const tech = stepTechnique(s);
    if (!tech) return;
    const part = parts.find((p) => p.technique === tech);
    if (part) part.steps.push(i + 1);
    else parts.push({ technique: tech, steps: [i + 1] });
  });
  return parts.slice(0, 6);
}

/** What this cook has done before: technique → times done and the last dish. Kept on the phone (state/techniques). */
export type DoneBefore = Partial<Record<Technique, { count: number; dish: string; at: number }>>;

/** After a cook: every technique of the dish counts once more. */
export function recordDone(done: DoneBefore, doc: Pick<RecipeDoc, "steps">, dish: string, at: number): DoneBefore {
  const out: DoneBefore = { ...done };
  for (const p of blueprint(doc)) out[p.technique] = { count: (done[p.technique]?.count ?? 0) + 1, dish, at };
  return out;
}

export type EaseSummary = {
  parts: Part[];
  /** Parts this cook has done before, with the dish they last did it in. */
  known: { technique: Technique; dish: string }[];
  /** "easy" when every part is level 1–2 or already done; "a stretch" when a level-3 part is new. */
  feel: "easy" | "stretch";
};

/** "Looks fancy, is easy: 4 parts, you've done 3 of them." */
export function ease(doc: Pick<RecipeDoc, "steps">, done: DoneBefore): EaseSummary {
  const parts = blueprint(doc);
  const known = parts.flatMap((p) => (done[p.technique] ? [{ technique: p.technique, dish: done[p.technique]!.dish }] : []));
  const newHard = parts.some((p) => TECHNIQUE_LEVEL[p.technique] === 3 && !done[p.technique]);
  return { parts, known, feel: newHard ? "stretch" : "easy" };
}
