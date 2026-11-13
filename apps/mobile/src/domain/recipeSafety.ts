// The recipe safety gate (Sprint 14 G1, docs/AI_RECIPES_PLAN.md). One checker for every recipe a family can see:
// the library (checked over every bundled recipe in tests), AI new creations, named dishes, and later family recipes
// and house-cook handoffs. The AI writes drafts; these rules decide. A recipe with any problem is rewritten once with
// the problems listed, and never shown if it still fails.
//
// What it checks:
// - the family: diet for the whole table, allergies and dislikes (even as an optional extra or a garnish in a step),
//   small children at the table (whole nuts);
// - hazards in Indian kitchens: kidney beans soaked and cooked soft, the pressure cooker opened only once the
//   pressure has dropped, hot oil for frying, raw meat, fish and egg cooked through, raw batter or dough not tasted;
// - unsafe shortcuts said in any step ("raw egg", "half-cooked", "reuse the oil", "leave it out overnight");
// - sense: catalog ingredients, real quantities, salt, oil, chilli, sugar and raising agents within a range per
//   serving, realistic step times;
// - words: no health or medical claims, no links or phone numbers, nothing that reads as instructions to an AI,
//   Hindi in Devanagari and Hinglish in Latin script.
//
// Allergen labels come from the catalog, never from model text (recipeAllergens).
// Pure TypeScript: shared with the Edge Functions by scripts/sync-shared.py.
import { avoids, type CatalogEntry, dietFits } from "./invent.ts";
import type { Diet } from "./ranking.ts";
import type { RecipeDoc, RecipeStepDoc } from "./recipes.ts";

export type SafetyCode =
  | "structure"
  | "unknown_ingredient"
  | "quantity"
  | "diet"
  | "avoid"
  | "children"
  | "kidney_beans"
  | "pressure_cooker"
  | "hot_oil"
  | "cooked_through"
  | "raw_batter"
  | "unsafe_shortcut"
  | "amount"
  | "time"
  | "health_claim"
  | "contact"
  | "injection"
  | "script";

export type SafetyProblem = { code: SafetyCode; message: string; step?: number };

export type SafetyContext = {
  catalog: Map<string, CatalogEntry>;
  /** The table's diet (the strictest among the people eating); omit for library recipes, which carry their own. */
  diet?: Diet;
  /** Allergies and dislikes, as catalog names. */
  avoid?: Iterable<string>;
  /** Small children eat this (age group "child"). */
  children?: boolean;
  /** The household's own components ("hari chutney") that aren't in the catalog but may be used as they are. */
  ownFood?: Iterable<string>;
};

/** Everything the cook reads or hears for a step, lower-cased: text, cue, cues and safety note. */
function stepWords(s: RecipeStepDoc): string {
  return [s.text, s.cue, s.safety, ...Object.values(s.cues ?? {})].filter(Boolean).join(" ").toLowerCase();
}

/** What a step tells the cook to do: text and the positive cues, not the safety note or the "avoid" warning. */
function stepInstruction(s: RecipeStepDoc): string {
  const { avoid: _avoid, ...cues } = s.cues ?? {};
  return [s.text, s.cue, ...Object.values(cues)].filter(Boolean).join(" ").toLowerCase();
}

/** Words the whole recipe says, for rules that may be met in any step. */
function recipeWords(doc: RecipeDoc): string {
  return doc.steps.map(stepWords).join(" ");
}

// --- Hazard patterns --------------------------------------------------------------------------------------------

const KIDNEY_BEANS = new Set(["kidney beans", "rajma"]);
const SOAKED = /\bsoak/;
const COOKED_SOFT = /\b(pressure[- ]cook|whistle|boil (hard|rapidly|vigorously)|completely soft|fully soft|until (every|each) bean)/;
const SLOW_COOK_RAW = /\bslow[- ]cook/;

const COOKER = /\b(pressure[- ]cook|cooker|whistles?)\b/;
const PRESSURE_DROPS = /\b(let the pressure (drop|settle|release|come down)|pressure (has )?(fully |completely )?(dropped|drops|settled|released)|until the pressure (drops|is gone|has dropped)|once the pressure (drops|has dropped|is down))/;

const FRYING = /\b(deep[- ]fry|deep[- ]fried|fry (them |it )?in (batches|hot oil)|into the hot oil|slide .{0,40} into .{0,20}oil|drop .{0,40} into .{0,20}oil)/;
const OIL_CARE = /\b(hot oil|never leave|keep children|water (and|in|into|near) .{0,15}oil|splutter|spatter|dry (them|it|the) |pat dry|careful|gently slide|slide .{0,30} close)/;

const COOKED_THROUGH = /\b(cooked through|no pink|not pink|juices run clear|fully set|set completely|completely set|fully cooked|until done|opaque all the way|flakes easily)\b/;

const RAW_BATTER_TASTE = /\b(taste|lick|eat) (the )?(raw )?(batter|dough)\b/;

// Phrases no recipe may say, in any step.
const SHORTCUTS: [RegExp, string][] = [
  [/\braw egg\b/, "raw egg"],
  [/\b(half[- ]cooked|undercook(ed)?|slightly pink|still pink|pink (in the|inside)|rare\b)/, "undercooked food"],
  [/\brunny (yolk|egg)/, "a runny egg"],
  [/\bskip (the )?(soak|soaking|boil|boiling)\b|\bno need to (soak|boil|cook|reheat)\b/, "skipping soaking or boiling"],
  [/\breuse (the )?(frying )?oil\b|\bsame oil again\b/, "reusing frying oil"],
  [/\b(room temperature|out) overnight\b|\bleave (it )?out overnight\b/, "food left out overnight"],
  [/\breheat (it )?(again|twice|a second time)\b/, "reheating more than once"],
  [/\blukewarm\b.*\b(leftover|reheat)|\b(leftover|reheat)\b.*\blukewarm\b/, "lukewarm leftovers"],
  [/\b(alcohol|wine|beer|rum|vodka|brandy|whisky)\b/, "alcohol"],
];

// --- Amount ranges per serving ----------------------------------------------------------------------------------

/** Upper limits per serving (g or ml). Frying oil is exempt: it is a frying medium, not eaten. */
const MAX_PER_SERVING: Record<string, number> = {
  salt: 4,
  "black salt": 3,
  "rock salt": 4,
  "baking soda": 1.5,
  "baking powder": 3,
  eno: 3,
  "red chilli powder": 3,
  "kashmiri chilli powder": 5,
  "green chilli": 6,
  sugar: 60,
  jaggery: 60,
  "refined oil": 30,
  "mustard oil": 30,
  "groundnut oil": 30,
  ghee: 30,
  butter: 30,
};
const FATS = new Set(["refined oil", "mustard oil", "groundnut oil", "ghee", "butter"]);
/** Sweets carry much more sugar and ghee than a sabzi; they get double. */
const SWEET_COURSES = new Set(["dessert", "sweet"]);

// --- Words ------------------------------------------------------------------------------------------------------

const HEALTH = /\b(cures?|heals?|treats? (diabetes|bp|cancer|cold|fever)|boosts? (your )?immunity|immunity booster|weight[- ]loss|lose weight|burns? fat|detox|diabetic[- ]friendly|good for (diabetes|diabetics|bp|heart patients)|lowers? (blood )?(sugar|cholesterol|pressure|bp)|medicine|medicinal|anti[- ]cancer|guaranteed)\b/;
const CONTACT = /(https?:\/\/|www\.|\b[\w.-]+\.(com|in|org|net)\b|\b\d{10}\b|\+91|@\w+\.)/;
const INJECTION = /\b(ignore (all |any |the )?(previous|prior|above|earlier) (instructions|rules)|system prompt|you are (an?|the) (ai|assistant|model)|as an ai\b|disregard (the )?(rules|instructions)|new instructions)/;
const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN = /[A-Za-z]/;

/**
 * True when text a person typed (a dish name, a family recipe, a note) reads as instructions to an AI rather than
 * food (G3). Such text is refused before any model sees it. English, Hindi and Hinglish.
 */
export function looksLikeInstructions(text: string): boolean {
  const t = text.toLowerCase();
  return INJECTION.test(t) || INJECTION_HI.test(t);
}
const INJECTION_HI = /(नियम (भूल|छोड़|अनदेखा)|निर्देश (भूल|छोड़|अनदेखा)|pichhle (niyam|instructions?) (bhool|chhod|ignore)|niyam (bhool|bhul|chhod) (jao|do)|rules? (bhool|bhul|chhod) (jao|do))/;

// --- The checker ------------------------------------------------------------------------------------------------

/** Problems with a recipe; an empty list means a family can see it. */
export function checkRecipe(doc: RecipeDoc, ctx: SafetyContext): SafetyProblem[] {
  const out: SafetyProblem[] = [];
  const add = (code: SafetyCode, message: string, step?: number) => out.push(step === undefined ? { code, message } : { code, message, step });
  const servings = Math.max(1, doc.base_servings || 1);
  const avoid = [...(ctx.avoid ?? [])];
  const own = new Set([...(ctx.ownFood ?? [])].map((x) => x.trim().toLowerCase()));
  const diet = ctx.diet ?? doc.diet;
  const words = recipeWords(doc);
  const frying = doc.steps.some((s) => s.technique === "deep_fry" || FRYING.test(s.text.toLowerCase()));
  const sweet = SWEET_COURSES.has(doc.course);

  // Structure.
  if (!doc.title?.trim() || doc.title.length > 80) add("structure", "the title is empty or too long");
  if (doc.steps.length < 2 || doc.steps.length > 12) add("structure", "a recipe has 2 to 12 steps");
  if (!doc.ingredients.length) add("structure", "a recipe needs ingredients");
  if (!(doc.base_servings >= 1 && doc.base_servings <= 12)) add("structure", "servings must be 1 to 12");

  // Ingredients: known, real amounts, the family's rules.
  for (const i of doc.ingredients) {
    const name = i.ingredient.trim().toLowerCase();
    if (avoids(avoid, name)) add("avoid", `${name} is something this family never eats (allergy or dislike)`);
    if (own.has(name)) continue;
    const cat = ctx.catalog.get(name);
    if (!cat) {
      add("unknown_ingredient", `unknown ingredient ${name}`);
      continue;
    }
    if (!(i.qty > 0) || !Number.isFinite(i.qty)) add("quantity", `bad quantity for ${name}`);
    if (!dietFits(diet, cat)) add("diet", `${name} doesn't fit a ${diet} diet`);
    const max = MAX_PER_SERVING[name];
    // Oil for frying ("talne ke liye") is the frying medium, mostly left in the kadai, not eaten.
    const fryingOil = FATS.has(name) && (frying || /\b(talne|tal ne|fry|frying|deep)/i.test(i.local ?? ""));
    if (max !== undefined && i.qty > 0 && !fryingOil) {
      const per = i.qty / servings;
      const limit = sweet && (name === "sugar" || name === "jaggery" || FATS.has(name)) ? max * 2 : max;
      if (per > limit) add("amount", `too much ${name}: ${Math.round(per * 10) / 10} per serving, at most ${limit}`);
    }
    const nut = name.replace(/s$/, "");
    const madeSafe = doc.steps.some((s) => s.text.toLowerCase().includes(nut) && /\b(ground|grind|paste|powder|crush|crushed)\b/.test(s.text.toLowerCase()));
    if (ctx.children && cat.category === "nut_seed" && !madeSafe && !/\b(powder|paste|ground|crushed)\b/.test(`${name} ${i.local ?? ""}`)) {
      add("children", `whole ${name} can choke a small child; grind, crush or leave them out`);
    }
  }

  // Steps: shortcuts, garnish of avoided things, times, words.
  doc.steps.forEach((s, idx) => {
    const n = idx + 1;
    const w = stepWords(s);
    if (!s.text?.trim() || s.text.length > 400) add("structure", "a step is empty or too long", n);
    // Safety notes warn against these ("undercooked beans are unsafe"); only instructions count.
    // "No pink inside" and "no runny egg left" are the doneness check, not an instruction to undercook.
    const told = stepInstruction(s).replace(/\b(no|not|without any|never|nothing) (longer )?(pink|runny|raw|undercooked|half[- ]cooked)( (egg|yolk|inside|in the middle))?/g, "");
    for (const [re, what] of SHORTCUTS) if (re.test(told) && !/\b(never|don't|do not|avoid)\b/.test(told)) add("unsafe_shortcut", `unsafe: ${what}`, n);
    const plain = s.text.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ");
    for (const a of avoid) if (avoids([a], plain)) add("avoid", `uses ${a}, which this family never eats`, n);
    if (RAW_BATTER_TASTE.test(w) && !/\b(cooked|after cooking|once cooked)\b/.test(w)) add("raw_batter", "never taste raw batter or dough", n);
    if (s.minutes !== undefined && s.minutes !== null && !(s.minutes > 0 && s.minutes <= (s.technique === "soak" || s.technique === "marinate" || /\bsoak|marinat|overnight|ferment|set\b/.test(w) ? 24 * 60 : 240))) {
      add("time", `step time ${s.minutes} minutes is not realistic`, n);
    }
    if (FRYING.test(s.text.toLowerCase()) || s.technique === "deep_fry") {
      if (!(s.safety && OIL_CARE.test(s.safety.toLowerCase()))) add("hot_oil", "a frying step needs a hot-oil safety note (never leave it, keep children away, no water near the oil)", n);
    }
  });

  // Hazards across the recipe.
  const names = new Set(doc.ingredients.map((i) => i.ingredient.trim().toLowerCase()));
  if ([...names].some((x) => KIDNEY_BEANS.has(x))) {
    if (!SOAKED.test(words)) add("kidney_beans", "kidney beans must be soaked first");
    if (!COOKED_SOFT.test(words)) add("kidney_beans", "kidney beans must be pressure-cooked or boiled hard until completely soft");
    if (doc.steps.some((s) => SLOW_COOK_RAW.test(stepInstruction(s)) && !/\b(never|don't|do not)\b/.test(stepInstruction(s)))) {
      add("kidney_beans", "raw kidney beans must never be slow-cooked");
    }
    if (!doc.steps.some((s) => s.safety && /\b(kidney|rajma)\b/.test(s.safety.toLowerCase()))) add("kidney_beans", "kidney beans need a safety note on the cooking step");
  }
  if (doc.steps.some((s) => COOKER.test(s.text.toLowerCase()) || !!s.whistles) && !PRESSURE_DROPS.test(words)) {
    add("pressure_cooker", "say to open the cooker only after the pressure has dropped by itself");
  }
  const raw = doc.ingredients.filter((i) => ["meat", "seafood", "egg"].includes(ctx.catalog.get(i.ingredient.trim().toLowerCase())?.category ?? ""));
  if (raw.length && !doc.steps.some((s) => s.safety && COOKED_THROUGH.test(stepWords(s)))) {
    add("cooked_through", `${raw.map((r) => r.ingredient).join(", ")} must be cooked through, said in a step with a safety note`);
  }

  // Words anywhere the cook reads or hears.
  const said = [doc.title, doc.description, words, ...Object.values(doc.titles ?? {}), ...Object.values(doc.descriptions ?? {})]
    .filter(Boolean).join(" ").toLowerCase();
  if (HEALTH.test(said)) add("health_claim", "no health, medical or weight-loss claims");
  if (CONTACT.test(said)) add("contact", "no links, phone numbers or addresses");
  if (INJECTION.test(said)) add("injection", "text that isn't about cooking");
  if (doc.titles?.hi && !DEVANAGARI.test(doc.titles.hi)) add("script", "the Hindi title must be in Devanagari");
  if (doc.titles?.["hi-Latn"] && (DEVANAGARI.test(doc.titles["hi-Latn"]) || !LATIN.test(doc.titles["hi-Latn"]))) {
    add("script", "the Hinglish title must be in Latin script");
  }

  // One message per problem.
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = `${p.code}|${p.message}|${p.step ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The same rules in words, for model prompts, so a draft is written to pass the gate the first time. */
export const SAFETY_RULES_PROMPT = `Safety rules every recipe must follow (a recipe that breaks one is never shown):
- Nothing from "avoid" (allergies and dislikes), not even as a garnish or an option.
- Kidney beans (rajma): soak, throw away the soaking water, pressure-cook or boil hard until every bean is completely
  soft, with a safety note on that step. Never slow-cook them from raw.
- Pressure cooker: say to open it only after the pressure has dropped by itself.
- Deep or shallow frying in hot oil: that step has a safety note (never leave hot oil alone, keep children away, no
  water near the oil, slide food in gently).
- Raw meat, fish and egg: cooked through (no pink inside, egg fully set), said in a step with a safety note.
- Never: raw egg, half-cooked or pink meat, a runny egg, skipping soaking or boiling, reusing frying oil, food left
  out overnight, reheating more than once, tasting raw batter or dough, alcohol.
- Sensible amounts per serving: salt at most 4 g, oil or ghee at most 30 ml (frying oil aside), red chilli powder at
  most 3 g, baking soda at most 1.5 g. Step times realistic.
- No health, medical or weight-loss claims; no links, phone numbers or brand promotions.`;

/** The problems as plain lines, for logs and for the model's one rewrite. */
export function problemLines(problems: SafetyProblem[]): string[] {
  return problems.map((p) => (p.step ? `step ${p.step}: ${p.message}` : p.message));
}

/** The allergens a recipe carries, from the catalog only (never from model text). Optional ingredients count. */
export function recipeAllergens(doc: RecipeDoc, catalog: Map<string, CatalogEntry>): string[] {
  const out = new Set<string>();
  for (const i of doc.ingredients) for (const a of catalog.get(i.ingredient.trim().toLowerCase())?.allergens ?? []) out.add(a);
  return [...out].sort();
}
