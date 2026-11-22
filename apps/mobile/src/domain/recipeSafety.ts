// The recipe safety gate (Sprint 14 G1, docs/AI_RECIPES_PLAN.md). One checker for every recipe a family can see:
// the library (checked over every bundled recipe in tests), AI new creations, named dishes, family recipes and
// house-cook handoffs. The AI writes drafts; these rules decide.
//
// It refuses a recipe only when it could hurt someone. Cooking is creative, and an Indian home cook makes boondi
// from besan, sugar and ghee with Eno for soda, so sugar, ghee, oil and chilli, any real ingredient (on Cookmate's
// list or not), swaps and long methods are the cook's business, not the gate's (22 Nov 2026). It refuses:
// - what the family told us: allergies and dislikes (even as a garnish in a step), the table's diet (veg, Jain,
//   vegan...) and a fast it keeps, whole nuts and big seeds when small children eat;
// - food that can make people ill: rajma not soaked and cooked soft, raw or undercooked meat, fish and egg, food left
//   out overnight and the other shortcuts in stepSafety.ts, salt or soda in amounts no dish uses;
// - burns: frying without a hot-oil note, a pressure cooker opened under pressure;
// - text that isn't cooking: health or medical claims, links and phone numbers, instructions to an AI.
//
// tidyRecipe() runs first on every AI draft and fixes what can be fixed without asking the AI again: it adds the
// standard safety notes, splits a long step, drops an impossible timer or a title in the wrong script, and takes out a
// sentence with a health claim or a link. A good dish is never thrown out over wording.
//
// Allergen labels come from the catalog, or from the ingredient's own name when it isn't in the catalog, never from
// model text (recipeAllergens). Pure TypeScript: shared with the Edge Functions by scripts/sync-shared.py.
import { avoids, type CatalogEntry, dietFits } from "./invent.ts";
import { MAX_STEP_CHARS, unsafeInstructions } from "./stepSafety.ts";
import type { Diet } from "./ranking.ts";
import type { RecipeDoc, RecipeStepDoc } from "./recipes.ts";

export type SafetyCode =
  | "structure"
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
  | "health_claim"
  | "contact"
  | "injection"
  | "fasting";

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

/** Most steps a recipe may have: a long method is fine, a runaway list isn't. */
export const MAX_STEPS = 20;

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

// --- Ingredients that aren't in the catalog ---------------------------------------------------------------------
// The AI may use any real ingredient. One that isn't on Cookmate's list still has to respect the diet, the
// allergies and the hazard rules, so its kind and allergens are read from its name. A wrong guess only ever adds a
// label or refuses ("malai" reads as milk), never hides one.

const PLANT_MILK = /\b(coconut|almond|soy|soya|oat|cashew|peanut|cocoa|nut|rice) (milk|butter|cream|curd|yogh?urt)\b/g;
const GUESS: { re: RegExp; category?: string; allergens?: string[]; flags?: string[]; plantFree?: boolean }[] = [
  { re: /\b(chicken|mutton|lamb|goat|beef|pork|bacon|ham|sausages?|salami|pepperoni|keema|mince|meat|meatballs?|liver|gelatine?|lard)\b/, category: "meat", flags: ["animal"] },
  { re: /\b(fish|anchov\w*|tuna|salmon|sardines?|mackerel|surmai|pomfret|bombil|rohu|katla|hilsa|basa)\b/, category: "seafood", allergens: ["fish"], flags: ["animal"] },
  { re: /\b(prawns?|shrimps?|crabs?|lobsters?|squid|calamari|mussels?|clams?|oysters?|scallops?)\b/, category: "seafood", allergens: ["shellfish"], flags: ["animal"] },
  { re: /\b(eggs?|mayonnaise|mayo|meringue)\b/, category: "egg", allergens: ["egg"] },
  // Milk in its Indian forms; coconut, almond, soy or oat "milk", peanut butter and cocoa butter are taken out first.
  { re: /\b(milk|cream|paneer|cheese|butter|ghee|curd|yogh?urt|dahi|khoya|khoa|mawa|malai|whey|lassi|chaas|chhaas|buttermilk|rabri|rabdi|chhena|chena|kalakand|kulfi|ice cream)\b/, category: "dairy", allergens: ["milk"], flags: ["animal"], plantFree: true },
  { re: /\bhoney\b/, flags: ["animal", "jain_avoid"] },
  { re: /\b(wheat|maida|atta|suji|sooji|semolina|barley|rye|bread|buns?|pav|pasta|noodles?|vermicelli|seviyan|sevai|biscuits?|cookies?|cake|rusks?|dalia|daliya|couscous|seitan|soy sauce)\b/, allergens: ["gluten"] },
  { re: /\b(peanuts?|groundnuts?|moongphali|mungfali|moongfali|chikki)\b/, allergens: ["peanut"] },
  { re: /\b(almonds?|badam|cashews?|kaju|walnuts?|akhrot|pistachios?|pista|hazelnuts?|pecans?|macadamia|chironji|charoli|pine nuts?|praline|marzipan)\b/, allergens: ["tree_nut"] },
  { re: /\b(sesame|til|tahini|gingelly)\b/, allergens: ["sesame"] },
  { re: /\b(soy|soya|tofu|edamame|tempeh|miso)\b/, allergens: ["soy"] },
  { re: /\b(mustard|sarson|rai|kasundi)\b/, allergens: ["mustard"] },
  { re: /\b(onions?|garlic|potato(es)?|aloo|carrots?|radish|mooli|beetroot|ginger|turnips?|yam|jimikand|shallots?|leeks?|colocasia|arbi|mushrooms?)\b/, flags: ["jain_avoid"] },
];

/** What Cookmate can tell about an ingredient from its name alone: its kind, allergens and diet flags. */
export function guessEntry(name: string): CatalogEntry {
  const n = name.trim().toLowerCase();
  let category = "other";
  const allergens = new Set<string>();
  const flags = new Set<string>();
  const plantFree = n.replace(PLANT_MILK, " ");
  for (const g of GUESS) {
    if (!g.re.test(g.plantFree ? plantFree : n)) continue;
    // Meat beats fish beats egg beats dairy: "chicken in butter" is meat.
    if (g.category && category === "other") category = g.category;
    for (const a of g.allergens ?? []) allergens.add(a);
    for (const f of g.flags ?? []) flags.add(f);
  }
  return { name: n, category, allergens: [...allergens], flags: [...flags] };
}

/** The catalog's entry, or what the name says when the catalog doesn't know it. */
function entryFor(name: string, catalog: Map<string, CatalogEntry>): { entry: CatalogEntry; known: boolean } {
  const e = catalog.get(name);
  return e ? { entry: e, known: true } : { entry: guessEntry(name), known: false };
}

/** The allergen groups behind what a family avoids ("peanuts" -> peanut), to catch a new name for the same thing. */
function avoidedAllergens(avoid: string[], catalog: Map<string, CatalogEntry>): Set<string> {
  const out = new Set<string>();
  for (const a of avoid) for (const g of entryFor(a.trim().toLowerCase(), catalog).entry.allergens ?? []) out.add(g);
  return out;
}

// --- Hazard patterns --------------------------------------------------------------------------------------------

const KIDNEY_BEANS = new Set(["kidney beans", "rajma"]);
const SOAKED = /\bsoak/;
const COOKED_SOFT = /\b(pressure[- ]cook|whistle|boil (hard|rapidly|vigorously)|completely soft|fully soft|until (every|each) bean)/;
const SLOW_COOK_RAW = /\bslow[- ]cook/;

const COOKER = /\b(pressure[- ]cook|cooker|whistles?)\b/;
const PRESSURE_DROPS = /\b(let the pressure (drop|settle|release|come down)|pressure (has )?(fully |completely )?(dropped|drops|settled|released)|until the pressure (drops|is gone|has dropped)|once the pressure (drops|has dropped|is down))/;

// Frying in ghee counts too (boondi, jalebi, gulab jamun): the ghee is the frying medium, not eaten.
const FRYING = /\b(deep[- ]fry|deep[- ]fried|fry (them |it )?in batches|fr(y|ies|ied) .{0,40}\bin (the )?hot (oil|ghee)|into (the )?hot (oil|ghee)|(slide|drop) .{0,40} into .{0,20}(oil|ghee)|through .{0,30} into .{0,20}(oil|ghee))/;
const OIL_CARE = /\b(hot oil|never leave|keep children|water (and|in|into|near) .{0,15}oil|splutter|spatter|dry (them|it|the) |pat dry|careful|gently slide|slide .{0,30} close)/;

const COOKED_THROUGH = /\b(cooked through|no pink|not pink|juices run clear|fully set|set completely|completely set|fully cooked|until done|opaque all the way|flakes easily)\b/;

const RAW_BATTER_TASTE = /\b(taste|lick|eat) (the )?(raw )?(batter|dough)\b/;

/** The standard notes tidyRecipe() adds where a step needs one and the writer left it out. */
export const NOTES = {
  hotOil: "Hot oil: never leave it alone, keep children away and keep water away from the oil.",
  cooker: "Let the pressure drop by itself before you open the cooker.",
  cookedThrough: "Cook until there is no pink inside and any egg is fully set.",
  rajma: "Rajma that isn't fully cooked can make you ill: every bean should squash easily between two fingers.",
  reheat: "Use leftovers kept in the fridge; if you heat them, heat until steaming hot all the way through.",
};

// Phrases no recipe may say, in any step: stepSafety.ts (shared with the new-dish check).

// --- Fasting (vrat) food, F3 -------------------------------------------------------------------------------------
// A recipe tagged "fasting" is offered on vrat days the family keeps, so it must be vrat food in the common North
// Indian way (Navratri, Ekadashi): no grains, ordinary flours or dals, no onion, garlic or hing, and rock salt, not
// ordinary salt. The vrat flours and starches are allowed. A family's own fast rules (from the calendar) come in as
// "avoid".
const VRAT_OK = new Set([
  "sabudana", "buckwheat flour", "water chestnut flour", "barnyard millet", "amaranth flour", "fox nuts", "rock salt",
  "sweet potato", "potato", "colocasia", "raw banana",
]);
const VRAT_NEVER = new Set([
  "onion", "spring onion", "shallots", "garlic", "green garlic", "ginger garlic paste", "asafoetida", "salt", "black salt",
  // Wheat and rice in a packet: not "grain" in the catalog, still not vrat food.
  "bread", "pav", "biscuits", "rusk", "idli dosa batter",
]);

/** Why an ingredient isn't vrat food, or null. */
export function notVrat(name: string, entry: { category: string } | undefined): string | null {
  if (VRAT_OK.has(name)) return null;
  if (VRAT_NEVER.has(name)) return name === "salt" ? "use rock salt (sendha namak) on a fast" : `${name} isn't eaten on a fast`;
  if (entry && ["grain", "flour", "pulse"].includes(entry.category)) return `${name} isn't vrat food; use kuttu, singhara, samak or sabudana`;
  return null;
}

// --- Small children ---------------------------------------------------------------------------------------------
// Whole nuts, big seeds and dried fruit a small child can choke on. Tiny seeds (til, khus khus, flax, chia, sabja),
// coconut milk, grated coconut and nut butters are not choking risks: flagging every "nut or seed" refused coconut
// chutney, til laddoo and avial for families with children.
const CHOKING = new Set([
  "peanuts", "cashews", "almonds", "walnuts", "pistachios", "fox nuts", "raisins", "dried figs", "chironji",
  "melon seeds", "pumpkin seeds", "sunflower seeds", "coconut",
]);
/** Words that mean it is no longer whole: ground, crushed, grated, blended. */
const MADE_SMALL = /\b(ground|grind\w*|paste|powder\w*|crush\w*|grated|grate|grating|scraped|desiccated|blend\w*|pur[eé]e\w*|mash\w*)\b/;

/** True when the recipe names this nut ground, grated or crushed, or a step that mentions it does that. */
function madeSmall(doc: RecipeDoc, name: string, local: string | undefined): boolean {
  if (MADE_SMALL.test(`${name} ${local ?? ""}`.toLowerCase())) return true;
  const word = name.replace(/s$/, "");
  const said = (local ?? "").toLowerCase().trim();
  return doc.steps.some((s) => {
    const t = s.text.toLowerCase();
    return (t.includes(word) || (said.length > 2 && t.includes(said))) && MADE_SMALL.test(t);
  });
}

// --- Amounts ----------------------------------------------------------------------------------------------------
// Only amounts that could make someone ill, about four times anything a real dish uses per serving (a typo like
// "50 g salt" for 2): sugar, ghee, oil and chilli are the cook's choice. Pickles and chutneys are eaten by the spoon,
// so they have no limit.
const HARMFUL_PER_SERVING: Record<string, number> = {
  salt: 8,
  "black salt": 8,
  "rock salt": 8,
  "baking soda": 6,
  "baking powder": 12,
  eno: 10,
};

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

// --- Tidy: fix what can be fixed, before the check ---------------------------------------------------------------

/** Sentences of a text, keeping their end marks; "1.5 tsp" is one sentence, since no space follows the point. */
function sentences(text: string): string[] {
  return text.replace(/([.!?।]["')\]]*)\s+/g, "$1\u0000").split("\u0000").map((x) => x.trim()).filter(Boolean);
}

/** The text without sentences that make health claims or give links or numbers; the same text if there are none. */
function withoutClaims(text: string): string {
  const all = sentences(text);
  const kept = all.filter((x) => !HEALTH.test(x.toLowerCase()) && !CONTACT.test(x.toLowerCase()));
  return kept.length === all.length ? text.trim() : kept.join(" ");
}

/** A sentence longer than a step, cut after a comma or between words; no word is lost. */
function chunks(x: string): string[] {
  const out: string[] = [];
  let rest = x.trim();
  while (rest.length > MAX_STEP_CHARS) {
    const head = rest.slice(0, MAX_STEP_CHARS);
    const cut = Math.max(head.lastIndexOf(", ") + 1, 0) || head.lastIndexOf(" ");
    const at = cut > MAX_STEP_CHARS / 2 ? cut : MAX_STEP_CHARS;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** A long step as steps of at most MAX_STEP_CHARS, split between sentences; the timer, cue and notes go on the last. */
function splitStep(s: RecipeStepDoc): RecipeStepDoc[] {
  if (s.text.length <= MAX_STEP_CHARS) return [s];
  const parts: string[] = [];
  for (const x of sentences(s.text).flatMap(chunks)) {
    const last = parts.length - 1;
    const prev = parts[last];
    if (prev !== undefined && prev.length + 1 + x.length <= MAX_STEP_CHARS) parts[last] = `${prev} ${x}`;
    else parts.push(x);
  }
  return parts.map((text, i) =>
    i === parts.length - 1 ? { ...s, text } : { text, ...(s.technique ? { technique: s.technique } : {}), ...(s.heat ? { heat: s.heat } : {}) },
  );
}

function addNote(s: RecipeStepDoc | undefined, note: string) {
  if (!s) return;
  s.safety = s.safety?.trim() ? `${s.safety.trim()} ${note}` : note;
}

/** What tidyRecipe() is told about the cook's kitchen. */
export type TidyContext = {
  catalog: Map<string, CatalogEntry>;
  /** Leftovers and cooked food the dish uses: they get the "steaming hot" note. */
  leftovers?: string[];
  /** The household's own components (as in SafetyContext): already cooked, so no "cooked through" note. */
  ownFood?: Iterable<string>;
};

/** Raw meat, fish and egg in a recipe: what must be cooked through (the household's own cooked food aside). */
function rawProtein(doc: RecipeDoc, catalog: Map<string, CatalogEntry>, own: Set<string>): string[] {
  return doc.ingredients
    .map((i) => i.ingredient.trim().toLowerCase())
    .filter((n) => !own.has(n) && ["meat", "seafood", "egg"].includes(entryFor(n, catalog).entry.category));
}

/**
 * An AI draft with everything fixable fixed, so the gate only ever refuses a real danger: a long step split in two,
 * an impossible timer dropped, a title in the wrong script dropped (the English one shows), a sentence with a health
 * claim or a link taken out, and the standard safety note added where a step needs one (frying, the pressure cooker,
 * meat, fish and egg cooked through, rajma, leftovers). Returns a new document and what it changed, for the logs.
 */
export function tidyRecipe(input: RecipeDoc, ctx: TidyContext): { doc: RecipeDoc; fixes: string[] } {
  const doc: RecipeDoc = structuredClone(input);
  const fixes: string[] = [];

  doc.title = (doc.title ?? "").trim();
  if (doc.title.length > 80) {
    doc.title = doc.title.slice(0, 80).replace(/\s+\S*$/, "").trim();
    fixes.push("shortened the title");
  }
  if (doc.titles) {
    if (doc.titles.en) doc.titles.en = doc.title;
    if (doc.titles.hi && !DEVANAGARI.test(doc.titles.hi)) {
      delete doc.titles.hi;
      fixes.push("dropped a Hindi title not in Devanagari");
    }
    const latn = doc.titles["hi-Latn"];
    if (latn && (DEVANAGARI.test(latn) || !LATIN.test(latn))) {
      delete doc.titles["hi-Latn"];
      fixes.push("dropped a Hinglish title not in Latin script");
    }
  }
  if (doc.description) {
    const d = withoutClaims(doc.description);
    if (d !== doc.description.trim()) fixes.push("took a health claim or a link out of the description");
    doc.description = d;
  }

  const steps: RecipeStepDoc[] = [];
  for (const s0 of doc.steps) {
    const s = { ...s0, text: (s0.text ?? "").trim() };
    const clean = withoutClaims(s.text);
    if (clean !== s.text) {
      fixes.push("took a health claim or a link out of a step");
      // A step that was only a claim or a link ("watch the video at...") isn't cooking: it goes.
      if (!clean && doc.steps.length > 1) continue;
      if (clean) s.text = clean;
    }
    const parts = splitStep(s);
    if (parts.length > 1) fixes.push("split a long step");
    steps.push(...parts);
  }
  doc.steps = steps;

  doc.steps.forEach((s, i) => {
    const w = stepWords(s);
    const longOk = s.technique === "soak" || s.technique === "marinate" || /\bsoak|marinat|overnight|ferment|set\b/.test(w);
    if (s.minutes !== undefined && s.minutes !== null && !(s.minutes > 0 && s.minutes <= (longOk ? 24 * 60 : 240))) {
      delete s.minutes;
      s.timer = false;
      fixes.push(`dropped an impossible timer on step ${i + 1}`);
    }
    if ((FRYING.test(s.text.toLowerCase()) || s.technique === "deep_fry") && !(s.safety && OIL_CARE.test(s.safety.toLowerCase()))) {
      addNote(s, NOTES.hotOil);
      fixes.push(`added the hot-oil note to step ${i + 1}`);
    }
  });

  const cookerStep = doc.steps.find((s) => COOKER.test(s.text.toLowerCase()) || !!s.whistles);
  if (cookerStep && !PRESSURE_DROPS.test(recipeWords(doc))) {
    addNote(cookerStep, NOTES.cooker);
    fixes.push("added the pressure-cooker note");
  }

  const names = doc.ingredients.map((i) => i.ingredient.trim().toLowerCase());
  const mentions = (s: RecipeStepDoc, keys: string[]) => {
    const t = s.text.toLowerCase();
    return keys.some((k) => t.includes(k.replace(/s$/, "")));
  };
  const lastMentioning = (keys: string[]) => [...doc.steps].reverse().find((s) => mentions(s, keys));

  const raw = rawProtein(doc, ctx.catalog, new Set([...(ctx.ownFood ?? [])].map((x) => x.trim().toLowerCase())));
  if (raw.length && !doc.steps.some((s) => s.safety && COOKED_THROUGH.test(stepWords(s)))) {
    addNote(lastMentioning(raw) ?? doc.steps[doc.steps.length - 1], NOTES.cookedThrough);
    fixes.push("added the cooked-through note");
  }

  const rajma = names.filter((n) => KIDNEY_BEANS.has(n));
  if (rajma.length && !doc.steps.some((s) => s.safety && /\b(kidney|rajma)\b/.test(s.safety.toLowerCase()))) {
    const at = [...doc.steps].reverse().find((s) => mentions(s, [...rajma, "rajma", "bean"]) && COOKED_SOFT.test(s.text.toLowerCase()))
      ?? lastMentioning([...rajma, "rajma", "bean"]) ?? doc.steps[doc.steps.length - 1];
    addNote(at, NOTES.rajma);
    fixes.push("added the rajma note");
  }

  const left = (ctx.leftovers ?? []).filter((k) => names.includes(k));
  if (left.length && !doc.steps.some((s) => s.safety && /\b(steaming hot|piping hot)\b/.test(`${s.text} ${s.safety}`.toLowerCase()))) {
    addNote(doc.steps.find((s) => mentions(s, left)) ?? doc.steps[0], NOTES.reheat);
    fixes.push("added the leftovers note");
  }

  return { doc, fixes: [...new Set(fixes)] };
}

// --- The checker ------------------------------------------------------------------------------------------------

/** Problems with a recipe; an empty list means a family can see it. Run tidyRecipe() on an AI draft first. */
export function checkRecipe(doc: RecipeDoc, ctx: SafetyContext): SafetyProblem[] {
  const out: SafetyProblem[] = [];
  const add = (code: SafetyCode, message: string, step?: number) => out.push(step === undefined ? { code, message } : { code, message, step });
  const servings = Math.max(1, doc.base_servings || 1);
  const avoid = [...(ctx.avoid ?? [])];
  const avoidGroups = avoidedAllergens(avoid, ctx.catalog);
  const own = new Set([...(ctx.ownFood ?? [])].map((x) => x.trim().toLowerCase()));
  const diet = ctx.diet ?? doc.diet;
  const words = recipeWords(doc);

  // Structure: something to show.
  if (!doc.title?.trim()) add("structure", "the title is empty");
  if (doc.steps.length < 1 || doc.steps.length > MAX_STEPS) add("structure", `a recipe has 1 to ${MAX_STEPS} steps`);
  if (!doc.ingredients.length) add("structure", "a recipe needs ingredients");
  if (!(doc.base_servings >= 1 && doc.base_servings <= 12)) add("structure", "servings must be 1 to 12");

  // Ingredients: the family's rules, real amounts, nothing harmful.
  for (const i of doc.ingredients) {
    const name = i.ingredient.trim().toLowerCase();
    if (avoids(avoid, name)) add("avoid", `${name} is something this family never eats (allergy or dislike)`);
    // The household's own food ("leftover fish fry") is already cooked, but still answers to the diet and allergies.
    const { entry, known } = entryFor(name, ctx.catalog);
    // A new name for something avoided ("groundnut chikki" when the family avoids peanuts).
    if (!known) {
      const hit = (entry.allergens ?? []).filter((g) => avoidGroups.has(g));
      if (hit.length) add("avoid", `${name} has ${hit.join(", ").replace(/_/g, " ")}, which this family avoids`);
    }
    if (!(i.qty > 0) || !Number.isFinite(i.qty)) add("quantity", `bad quantity for ${name}`);
    if (!dietFits(diet, entry)) add("diet", `${name} doesn't fit a ${diet} diet`);
    const max = doc.course === "chutney_pickle" ? undefined : HARMFUL_PER_SERVING[name];
    if (max !== undefined && i.qty > 0 && i.qty / servings > max) {
      add("amount", `far too much ${name}: ${Math.round((i.qty / servings) * 10) / 10} per serving could make someone ill`);
    }
    if (ctx.children && CHOKING.has(name) && !madeSmall(doc, name, i.local)) {
      add("children", `whole ${name} can choke a small child; grind, crush or leave them out`);
    }
  }

  // F3: a fasting recipe is vrat food.
  if (doc.tags?.includes("fasting")) {
    for (const i of doc.ingredients) {
      const name = i.ingredient.trim().toLowerCase();
      const why = notVrat(name, ctx.catalog.get(name) ?? (own.has(name) ? undefined : guessEntry(name)));
      if (why) add("fasting", why);
    }
  }

  // Steps: shortcuts that make people ill, garnish of avoided things, hot oil.
  const hasEgg = doc.ingredients.some((i) => entryFor(i.ingredient.trim().toLowerCase(), ctx.catalog).entry.category === "egg");
  const names = new Set(doc.ingredients.map((i) => i.ingredient.trim().toLowerCase()));
  const raw = rawProtein(doc, ctx.catalog, own);
  const protein = raw.length > 0 || [...names].some((x) => KIDNEY_BEANS.has(x));
  doc.steps.forEach((s, idx) => {
    const n = idx + 1;
    const w = stepWords(s);
    if (!s.text?.trim()) add("structure", "a step is empty", n);
    // Safety notes warn against these ("undercooked beans are unsafe"); only instructions count.
    for (const what of unsafeInstructions(stepInstruction(s), protein)) add("unsafe_shortcut", `unsafe: ${what}`, n);
    const plain = s.text.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ");
    for (const a of avoid) if (avoids([a], plain)) add("avoid", `uses ${a}, which this family never eats`, n);
    // Tasting pakora batter for salt is everyday cooking; raw egg in a batter is not.
    if (hasEgg && RAW_BATTER_TASTE.test(w) && !/\b(cooked|after cooking|once cooked)\b/.test(w)) add("raw_batter", "never taste a batter or dough with raw egg in it", n);
    if (FRYING.test(s.text.toLowerCase()) || s.technique === "deep_fry") {
      if (!(s.safety && OIL_CARE.test(s.safety.toLowerCase()))) add("hot_oil", "a frying step needs a hot-oil safety note (never leave it, keep children away, no water near the oil)", n);
    }
  });

  // Hazards across the recipe.
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
  if (raw.length && !doc.steps.some((s) => s.safety && COOKED_THROUGH.test(stepWords(s)))) {
    add("cooked_through", `${raw.join(", ")} must be cooked through, said in a step with a safety note`);
  }

  // Words anywhere the cook reads or hears.
  const said = [doc.title, doc.description, words, ...Object.values(doc.titles ?? {}), ...Object.values(doc.descriptions ?? {})]
    .filter(Boolean).join(" ").toLowerCase();
  if (HEALTH.test(said)) add("health_claim", "no health, medical or weight-loss claims");
  if (CONTACT.test(said)) add("contact", "no links, phone numbers or addresses");
  if (INJECTION.test(said)) add("injection", "text that isn't about cooking");

  // One message per problem.
  const seen = new Set<string>();
  return out.filter((p) => {
    const k = `${p.code}|${p.message}|${p.step ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The rules in words, for model prompts: only the ones that keep people safe. */
export const SAFETY_RULES_PROMPT = `The only hard rules (a recipe that breaks one is never shown); everything else is your creativity:
- Nothing from "avoid" (allergies and dislikes), under any name, not even as a garnish or an option.
- Every ingredient suits the table's diet (veg, Jain, vegan, eggetarian), and a fast day's food is vrat food.
- Kidney beans (rajma): soak, throw away the soaking water, pressure-cook or boil hard until every bean is completely
  soft. Never slow-cook them from raw.
- Raw meat, fish and egg are cooked through (no pink inside, egg fully set).
- Never: raw egg, half-cooked or pink meat, food left out overnight (fermenting batter or setting curd is fine),
  lukewarm leftovers, alcohol. Salt and soda only in amounts a real dish uses.
- When small_children is true: no whole nuts, big seeds or raisins (peanuts, cashews, almonds, melon seeds, makhana,
  coconut pieces); grind, crush or grate them in a step, or leave them out. Til, khus khus and coconut milk are fine.
- No health, medical or weight-loss claims; no links, phone numbers or brand promotions.
Sugar, ghee, oil and chilli are the cook's choice: write the dish the way it is really made.`;

/** The problems as plain lines, for logs and for the model's one rewrite. */
export function problemLines(problems: SafetyProblem[]): string[] {
  return problems.map((p) => (p.step ? `step ${p.step}: ${p.message}` : p.message));
}

/**
 * The allergens a recipe carries: from the catalog, or from the name for an ingredient the catalog doesn't know
 * (never from model text). Optional ingredients count.
 */
export function recipeAllergens(doc: RecipeDoc, catalog: Map<string, CatalogEntry>): string[] {
  const out = new Set<string>();
  for (const i of doc.ingredients) for (const a of entryFor(i.ingredient.trim().toLowerCase(), catalog).entry.allergens ?? []) out.add(a);
  return [...out].sort();
}
