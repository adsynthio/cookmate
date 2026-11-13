// Sprint 13 S9: masala base prep. A Sunday batch (onion-tomato masala, ginger-garlic paste, boiled chana or rajma)
// sits in the kitchen; on a weekday the recipe says which steps it replaces and how much time it saves. The recipe's
// steps stay as they are (so a cook can always do them the long way); the cook screen shows a "use your ready base"
// card on those steps. No React, no network.

export type BaseId = "masala" | "gg_paste" | "boiled_pulse";

type Item = { ingredientKey: string | null; name: string; state: string; confidence: number; stapleLevel?: string | null };
type Step = { text: string; technique?: string | null; minutes?: number | null; seconds?: number | null };
type Dish = { ingredients: { ingredient: string; optional?: boolean }[]; steps: Step[] };

const MASALA = /onion[\s-]*tomato|masala base|pyaz[\s-]*tamatar|प्याज़?[\s-]*टमाटर/i;
const PULSES = ["chickpeas", "kidney beans", "black chickpeas"];
const BOILED = /boiled|ubl|उबल|cooked/i;
const GG = /ginger[\s-]*garlic|adrak[\s-]*lehsun|अदरक[\s-]*लहसुन/i;
const PULSE_NAMES: [RegExp, string][] = [
  [/kala chana|black chickpea|काला चना/i, "black chickpeas"],
  [/chana|chole|chickpea|छोले|चना/i, "chickpeas"],
  [/rajma|kidney|राजमा/i, "kidney beans"],
];

/** What's ready in the kitchen: bases by id, and which pulses are already boiled. */
export function readyBases(items: Item[]): { bases: Set<BaseId>; pulses: Set<string> } {
  const ok = items.filter((i) => i.confidence >= 0.5 && i.stapleLevel !== "out");
  const bases = new Set<BaseId>();
  const pulses = new Set<string>();
  for (const i of ok) {
    if (i.state !== "raw" && MASALA.test(i.name)) bases.add("masala");
    if (i.ingredientKey === "ginger garlic paste" || (i.state !== "raw" && GG.test(i.name))) bases.add("gg_paste");
    // Boiled pulses: the catalog item marked cooked, or a batch saved by name ("Leftover Boiled Chana").
    const pulse = i.ingredientKey && PULSES.includes(i.ingredientKey) ? i.ingredientKey : PULSE_NAMES.find(([re]) => re.test(i.name))?.[1];
    // A leftover dish of chole is not plain boiled chana: by name, it must say it was boiled.
    const boiled = BOILED.test(i.name) || (!!i.ingredientKey && (i.state === "cooked" || i.state === "homemade"));
    if (pulse && boiled) {
      pulses.add(pulse);
      bases.add("boiled_pulse");
    }
  }
  return { bases, pulses };
}

export type Shortcut = { base: BaseId; steps: number[]; savesMin: number; pulse?: string };

const mins = (s: Step) => (s.seconds ? s.seconds / 60 : (s.minutes ?? 0));

/**
 * Which steps a ready base replaces in this dish, and the time it saves:
 *   * masala: the onion and tomato frying steps of a dish that uses both (the base is warmed through instead);
 *   * boiled pulse: soaking and pressure-cooking the chana or rajma the kitchen already has boiled;
 *   * ginger-garlic paste: grating ginger and garlic separately.
 */
export function shortcuts(dish: Dish, ready: { bases: Set<BaseId>; pulses: Set<string> }): Shortcut[] {
  const uses = new Set(dish.ingredients.filter((i) => !i.optional).map((i) => i.ingredient));
  const out: Shortcut[] = [];
  const at = (pred: (s: Step) => boolean) => dish.steps.flatMap((s, i) => (pred(s) ? [i + 1] : []));

  if (ready.bases.has("masala") && uses.has("onion") && uses.has("tomato")) {
    const steps = at((s) => ["saute_onion", "bhuna"].includes(s.technique ?? "") && /onion|tomato|pyaz|tamatar|प्याज|टमाटर/i.test(s.text));
    const total = steps.reduce((a, n) => a + mins(dish.steps[n - 1]!), 0);
    if (steps.length && total > 4) out.push({ base: "masala", steps, savesMin: Math.round(total - 4) });
  }
  const pulse = PULSES.find((p) => uses.has(p) && ready.pulses.has(p));
  if (pulse) {
    const steps = at((s) => s.technique === "soak" || (s.technique === "pressure_cook" && /soak|chana|chole|chickpea|rajma|bean/i.test(s.text)));
    const total = steps.reduce((a, n) => a + mins(dish.steps[n - 1]!), 0);
    if (steps.length) out.push({ base: "boiled_pulse", steps, savesMin: Math.round(total), pulse });
  }
  if (ready.bases.has("gg_paste") && uses.has("ginger") && uses.has("garlic") && !uses.has("ginger garlic paste")) {
    const steps = at((s) => /ginger|garlic|adrak|lehsun|अदरक|लहसुन/i.test(s.text)).slice(0, 1);
    if (steps.length) out.push({ base: "gg_paste", steps, savesMin: 3 });
  }
  return out;
}

/** Total minutes saved (an overnight soak counts in full). */
export function minutesSaved(cuts: Shortcut[]): number {
  return cuts.reduce((a, c) => a + c.savesMin, 0);
}
