// "Invent something from what's here" (KIT-056, REC-06). Flavour logic chooses what to combine; the model (or, in
// mock mode, a template) writes the dish; validateInvention() decides whether it is safe to show. A dish that
// fails is never shown. Pure TypeScript with type-only imports: shared with the invent-dish Edge Function.
import type { Diet, FlavorKey } from "./ranking.ts";
import type { RecipeDoc } from "./recipes.ts";

export type CatalogEntry = { name: string; category: string; flags?: string[]; allergens?: string[]; staple?: boolean };

export type InventItem = {
  itemId: string;
  key: string;
  /** raw | opened | cooked | homemade | leftover */
  state: string;
  /** For homemade components (KIT-034): what they bring. */
  roles: FlavorKey[];
  confidence: number;
  daysLeft: number | null;
};

export type InventPlan = {
  /** Things to use, odds and ends first. */
  use: InventItem[];
  /** What the combination brings. */
  roles: FlavorKey[];
  /** What it still lacks; the dish fills these from staples. */
  gaps: FlavorKey[];
  /** Keys of ready-cooked food in the plan (they need reheating until steaming hot). */
  cooked: string[];
};

const ACID = new Set(["lemon", "tamarind", "kokum", "tomato", "curd", "raw mango", "dry mango powder", "vinegar", "buttermilk", "pickle"]);
const HEAT = new Set(["green chilli", "red chilli powder", "kashmiri chilli powder", "dry red chilli", "black pepper", "ginger", "garlic", "pickle", "sambar powder", "garam masala"]);
const CRUNCH = new Set(["onion", "cucumber", "radish", "carrot", "capsicum", "cabbage", "papad", "bhujia", "peanuts", "cashews", "almonds", "puffed rice", "sesame seeds", "fox nuts", "pomegranate"]);
const RICH = new Set(["ghee", "butter", "fresh cream", "khoya", "cheese", "paneer", "coconut", "cashews", "mustard oil"]);
const SWEET = new Set(["jaggery", "sugar", "honey", "raisins", "banana", "mango"]);

/** What an ingredient brings to a plate. Components carry their own roles. */
export function rolesOf(item: Pick<InventItem, "key" | "roles">, cat: CatalogEntry | undefined): FlavorKey[] {
  if (item.roles.length) return item.roles;
  const out = new Set<FlavorKey>();
  const k = item.key;
  const c = cat?.category ?? "";
  if (c === "grain" || c === "flour" || c === "packaged" || ["potato", "sweet potato", "raw banana", "colocasia", "bread", "pav"].includes(k)) out.add("starch");
  if (ACID.has(k)) out.add("acid");
  if (HEAT.has(k)) out.add("heat");
  if (CRUNCH.has(k)) out.add("crunch");
  if (RICH.has(k) || c === "oil_fat") out.add("rich");
  if (SWEET.has(k)) out.add("sweet");
  if (c === "pulse" || c === "dairy" || c === "egg" || c === "meat" || c === "seafood") out.add("rich");
  return [...out];
}

/**
 * Pick the odds and ends worth combining: leftovers and homemade components first, then what spoils soonest, then
 * one starch to carry it. At most five things; staples are assumed. Null when there is too little to invent with.
 */
export function planInvention(items: InventItem[], catalog: Map<string, CatalogEntry>, diet: Diet, avoid: string[] = []): InventPlan | null {
  // Never plan around something the family avoids (allergies, dislikes), even if it's in the kitchen.
  const fits = (k: string) => dietFits(diet, catalog.get(k)) && !avoids(avoid, k);
  // Raw staples (rice, atta) are assumed; cooked rice from yesterday is exactly what we want to use.
  // Homemade components the catalog doesn't know ("hari chutney") are the household's own food: usable as they are.
  const own = (i: InventItem) => !catalog.has(i.key) && ["homemade", "leftover", "cooked"].includes(i.state) && !avoids(avoid, i.key);
  const usable = items.filter((i) =>
    i.confidence >= 0.5 && (own(i) || (fits(i.key) && (i.state !== "raw" || !catalog.get(i.key)?.staple))));
  const priority = (i: InventItem) =>
    (i.state === "leftover" || i.state === "cooked" ? 0 : i.state === "homemade" ? 1 : 2) * 100 + Math.min(99, i.daysLeft ?? 99);
  const sorted = [...usable].sort((a, b) => priority(a) - priority(b) || a.key.localeCompare(b.key));

  const use: InventItem[] = [];
  const roles = new Set<FlavorKey>();
  for (const i of sorted) {
    if (use.length >= 5) break;
    const r = rolesOf(i, catalog.get(i.key));
    const isOddEnd = i.state !== "raw" || (i.daysLeft !== null && i.daysLeft <= 3);
    // Odds and ends always go in; other things only when they add something the plate lacks.
    if (isOddEnd || r.some((x) => !roles.has(x))) {
      use.push(i);
      r.forEach((x) => roles.add(x));
    }
  }
  const oddsAndEnds = use.filter((i) => i.state !== "raw" || (i.daysLeft !== null && i.daysLeft <= 3));
  if (!oddsAndEnds.length || use.length < 2) return null;
  const gaps = (["starch", "rich", "heat", "acid", "crunch"] as FlavorKey[]).filter((r) => !roles.has(r));
  const cooked = use.filter((i) => i.state === "leftover" || i.state === "cooked").map((i) => i.key);
  return { use, roles: [...roles], gaps, cooked };
}

export function dietFits(diet: Diet, entry: CatalogEntry | undefined): boolean {
  if (!entry) return false;
  if (diet === "nonveg") return true;
  if (entry.category === "meat" || entry.category === "seafood") return false;
  if (diet === "eggetarian") return true;
  if (entry.category === "egg") return false;
  if (diet === "jain") return !(entry.flags ?? []).includes("jain_avoid");
  if (diet === "vegan") return entry.category !== "dairy" && !(entry.allergens ?? []).includes("milk") && !(entry.flags ?? []).includes("animal");
  return true;
}

const UNSAFE = /\b(raw egg|half[- ]cooked|undercook|still pink|slightly pink|runny yolk|skip (the )?(boil|soak)|no need to (boil|cook|reheat)|reuse (the )?oil|room temperature overnight|lukewarm)\b/i;
const REHEAT = /\b(steaming hot|piping hot|bubbling|boil(ing)?|simmer)/i;
const COOKED_THROUGH = /\b(cooked through|no pink|firm|set completely|fully set|fully cooked|until done)\b/i;

/**
 * True when `key` is, or plainly contains, something the family avoids: "peanuts" avoids "peanuts" and the homemade
 * "peanut chutney" (singular or plural), whole words only, so avoiding "egg" doesn't avoid "eggplant".
 */
export function avoids(avoid: Iterable<string>, key: string): boolean {
  const k = ` ${key.trim().toLowerCase()} `;
  for (const a of avoid) {
    const w = a.trim().toLowerCase();
    if (!w) continue;
    const forms = [w, `${w}s`, `${w}es`, w.endsWith("s") ? w.slice(0, -1) : w];
    if (forms.some((f) => k.includes(` ${f} `))) return true;
  }
  return false;
}

/**
 * Problems with an invented dish; empty means it can be shown (labelled "new creation") and cooked.
 * - nothing the family avoids (allergies and dislikes), not even as an optional extra;
 * - only catalog ingredients that fit the diet, and nothing the kitchen doesn't have except staples;
 * - every planned odd-and-end is used (that's the point);
 * - leftovers and cooked food are reheated until steaming hot, in a step with a safety note;
 * - raw meat, fish and egg must be cooked through, said in a step with a safety note; no unsafe shortcuts.
 */
export function validateInvention(
  doc: RecipeDoc,
  plan: InventPlan,
  ctx: { catalog: Map<string, CatalogEntry>; diet: Diet; have: Set<string>; avoid?: Iterable<string> },
): string[] {
  const problems: string[] = [];
  const avoid = [...(ctx.avoid ?? [])];
  for (const i of doc.ingredients) {
    if (avoids(avoid, i.ingredient)) problems.push(`${i.ingredient} is something this family never eats (allergy or dislike)`);
  }
  // A garnish slipped into a step ("top with peanuts") counts too.
  for (const s of doc.steps) {
    const words = s.text.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ");
    for (const a of avoid) if (avoids([a], words)) problems.push(`a step uses ${a}, which this family never eats`);
  }
  if (!doc.title.trim() || doc.title.length > 80) problems.push("bad title");
  if (doc.steps.length < 2 || doc.steps.length > 10) problems.push("needs 2 to 10 steps");
  for (const s of doc.steps) {
    if (!s.text.trim() || s.text.length > 400) problems.push("a step is empty or too long");
    if (UNSAFE.test(s.text)) problems.push(`unsafe instruction: "${s.text.slice(0, 60)}"`);
  }
  const ownFood = new Set(plan.use.filter((u) => !ctx.catalog.has(u.key)).map((u) => u.key));
  for (const i of doc.ingredients) {
    const cat = ctx.catalog.get(i.ingredient);
    if (ownFood.has(i.ingredient)) continue; // the household's own component, from the plan
    if (!cat) {
      problems.push(`unknown ingredient ${i.ingredient}`);
      continue;
    }
    if (!(i.qty > 0) || !Number.isFinite(i.qty)) problems.push(`bad quantity for ${i.ingredient}`);
    if (!dietFits(ctx.diet, cat)) problems.push(`${i.ingredient} doesn't fit a ${ctx.diet} diet`);
    if (!cat.staple && !ctx.have.has(i.ingredient) && !i.optional) problems.push(`${i.ingredient} isn't in the kitchen`);
  }
  const used = new Set(doc.ingredients.map((i) => i.ingredient));
  for (const u of plan.use) if (!used.has(u.key)) problems.push(`doesn't use ${u.key}`);

  const safetySteps = doc.steps.filter((s) => s.safety?.trim());
  if (plan.cooked.length && !safetySteps.some((s) => REHEAT.test(`${s.text} ${s.safety}`))) {
    problems.push("leftovers must be reheated until steaming hot, with a safety note");
  }
  const risky = doc.ingredients.filter((i) => ["meat", "seafood", "egg"].includes(ctx.catalog.get(i.ingredient)?.category ?? "") && !plan.cooked.includes(i.ingredient));
  if (risky.length && !safetySteps.some((s) => COOKED_THROUGH.test(`${s.text} ${s.safety}`))) {
    problems.push(`${risky.map((r) => r.ingredient).join(", ")} must be cooked through, with a safety note`);
  }
  return [...new Set(problems)];
}

/** Mock mode and tests: a plain tawa dish from the plan (the real dish comes from the model). */
export function templateInvention(plan: InventPlan, diet: Diet): RecipeDoc {
  const names = plan.use.map((u) => u.key);
  const title = `${names.slice(0, 2).map((n) => n[0]!.toUpperCase() + n.slice(1)).join(" and ")} tawa mix`;
  const steps: RecipeDoc["steps"] = [
    { text: "Heat 1 tablespoon oil in a pan or tawa. Add cumin seeds and let them crackle.", minutes: 1 },
    ...(plan.cooked.length
      ? [{ text: `Add the ${plan.cooked.join(" and ")} with a splash of water and cook, stirring, until steaming hot all through.`, minutes: 4, safety: "Reheat leftovers until steaming hot all the way through." }]
      : []),
    { text: `Add the ${names.filter((n) => !plan.cooked.includes(n)).join(", ") || "rest"}, salt and turmeric. Cook, stirring, until tender.`, minutes: 6 },
    { text: "Taste, adjust salt and serve hot.", cue: "Everything is hot and tender." },
  ];
  return {
    slug: "new-creation",
    title,
    description: `A new creation from ${names.join(", ")}.`,
    course: "main",
    diet,
    base_servings: 2,
    prep_time_min: 5,
    cook_time_min: 12,
    difficulty: 1,
    spice_level: 2,
    tags: ["new_creation"],
    review_status: "draft",
    ingredients: [
      ...plan.use.map((u) => ({ ingredient: u.key, qty: 100, unit: "g", role: "base" })),
      { ingredient: "refined oil", qty: 15, unit: "ml", role: "fat" },
      { ingredient: "cumin seeds", qty: 2, unit: "g", role: "spice" },
      { ingredient: "salt", qty: 3, unit: "g", role: "spice" },
      { ingredient: "turmeric powder", qty: 1, unit: "g", role: "spice" },
    ],
    steps,
  };
}
