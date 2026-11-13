// Library batch generator (docs/AI_RECIPES_PLAN.md, Phase 1, L1–L2). Writes draft recipes for the next dishes in
// content/dish_list.yaml that have no file in content/recipes yet. Each draft:
//   1. is written by Claude in the exact recipe shape (English, Hindi, Hinglish, cues, safety notes, stove heat,
//      household amounts, techniques);
//   2. must pass the recipe safety gate (apps/mobile/src/domain/recipeSafety.ts, the same one the app and the Edge
//      Functions use) and the catalog checks below; it gets one rewrite with the problems listed;
//   3. is written to content/recipes/<slug>.json with review_status "in_review". to_yaml.py turns it into YAML.
// Nothing ships until Gaurav approves the batch's pull request.
//
//   deno run --allow-read --allow-write --allow-env --allow-net tools/content/generate/generate.ts --size 25
// Needs ANTHROPIC_API_KEY. Prints a report (markdown) for the pull request body.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.3.0/helpers/zod";
import { parse as parseYaml } from "jsr:@std/yaml@1";
import { z } from "npm:zod@4.6.5";

import catalogJson from "../../../supabase/functions/_shared/catalog.json" with { type: "json" };
import type { CatalogEntry } from "../../../supabase/functions/_shared/invent.ts";
import { checkRecipe, problemLines, recipeAllergens, SAFETY_RULES_PROMPT } from "../../../supabase/functions/_shared/recipeSafety.ts";
import type { RecipeDoc } from "../../../supabase/functions/_shared/recipes.ts";
import { blueprint } from "../../../apps/mobile/src/domain/blueprint.ts";

const MODEL = "claude-opus-5-5";
const ROOT = new URL("../../../", import.meta.url);
const CATALOG = new Map((catalogJson as CatalogEntry[]).map((c) => [c.name, c]));

const COURSES = ["breakfast", "main", "side", "snack", "dessert", "drink", "tiffin", "chutney_pickle", "component"] as const;
const DIETS = ["veg", "eggetarian", "nonveg", "jain", "vegan"] as const;
const ROLES = ["base", "aromatic", "heat", "acid", "fat", "sweet", "garnish", "component", "liquid", "binder", "protein", "vegetable", "starch", "spice"] as const;
const TECHNIQUES = ["soak", "marinate", "batter", "knead", "make_chenna", "pressure_cook", "saute_onion", "bhuna", "tadka", "simmer", "reduce_milk", "sugar_syrup", "deep_fry", "shallow_fry", "tawa_cook", "dry_roast", "steam", "dum", "dhungar", "shape", "set_chill"] as const;
const TAGS = ["comforting", "quick", "high_protein", "kids_friendly", "light", "fasting", "one_pot", "tiffin", "festive", "basics"] as const;
const EQUIPMENT = ["pressure_cooker", "kadai", "tawa", "air_fryer", "otg", "microwave", "induction", "gas_stove", "mixer_grinder", "blender"] as const;
const GROUPS = ["dal", "sabzi", "greens", "fruit", "dairy", "protein", "grain"] as const;

// The step in Hindi or Hinglish: everything the English says (text, every cue given, the safety note).
const Say = z.object({
  text: z.string(), safety: z.string().nullable(),
  look: z.string().nullable(), sound: z.string().nullable(), smell: z.string().nullable(), touch: z.string().nullable(),
});
type SayT = z.infer<typeof Say>;
const Draft = z.object({
  title: z.string(),
  title_hi: z.string(),
  title_hinglish: z.string(),
  description: z.string(),
  description_hi: z.string(),
  description_hinglish: z.string(),
  cuisine_region: z.string(),
  course: z.enum(COURSES),
  diet: z.enum(DIETS),
  base_servings: z.number(),
  prep_time_min: z.number(),
  cook_time_min: z.number(),
  difficulty: z.number(),
  spice_level: z.number(),
  equipment: z.array(z.enum(EQUIPMENT)),
  tags: z.array(z.enum(TAGS)),
  food_groups: z.array(z.enum(GROUPS)),
  flavor: z.object({ rich: z.number(), heat: z.number(), acid: z.number(), crunch: z.number(), starch: z.number(), sweet: z.number() }),
  ingredients: z.array(z.object({
    ingredient: z.string(), qty: z.number(), unit: z.enum(["g", "ml", "piece", "bunch", "packet"]),
    local: z.string(), role: z.enum(ROLES), group: z.string().nullable(), optional: z.boolean(),
  })),
  steps: z.array(z.object({
    text: z.string(),
    technique: z.enum(TECHNIQUES).nullable(),
    minutes: z.number().nullable(),
    whistles: z.number().nullable(),
    heat: z.enum(["low", "medium", "high"]).nullable(),
    look: z.string().nullable(), sound: z.string().nullable(), smell: z.string().nullable(), touch: z.string().nullable(),
    safety: z.string().nullable(),
    hi: Say,
    hinglish: Say,
  })),
});
type Draft = z.infer<typeof Draft>;

const SYSTEM = `You write one recipe for Cookmate, an Indian home-cooking app, the way a good home cook makes it on a
weekday: home amounts, simple steps, nothing restaurant-only. The recipe is shown in English, Hindi (Devanagari) and
Hinglish (Latin script), read aloud while cooking, and checked by food-safety rules.
- Ingredients: ONLY these catalog names, exactly as written: ${[...CATALOG.keys()].join(", ")}.
  "local" is the household amount in Hinglish ("2 pyaaz", "1 chhota chammach", "1 katori"). Quantities in g or ml
  (piece for eggs and breads), for base_servings people (usually 4). Mark garnish and optional extras honestly.
- Steps: 3 to 10, each one action in plain English a home cook follows. Give technique where one applies, minutes
  where it takes time, whistles for the pressure cooker, heat (low/medium/high) when on the stove, and the sensory
  cues a cook notices (look, sound, smell, touch), one short sentence each, only where they help.
- hi and hinglish: everything the English step says, in Hindi (Devanagari) and Hinglish (Latin): the text, every
  cue you gave (look, sound, smell, touch) and the safety note. Natural kitchen language, masculine first person if any.
- Difficulty and spice 1 to 5. Diet must match the ingredients. No health or nutrition claims. No brand promotion.
${SAFETY_RULES_PROMPT}`;

type Dish = { slug: string; name: string; group: string };

function nextDishes(size: number): Dish[] {
  const list = parseYaml(Deno.readTextFileSync(new URL("content/dish_list.yaml", ROOT))) as Record<string, [string, string][]>;
  const out: Dish[] = [];
  for (const [group, dishes] of Object.entries(list)) {
    for (const [slug, name] of dishes) {
      const exists = [".yaml", ".json"].some((ext) => {
        try {
          Deno.statSync(new URL(`content/recipes/${slug}${ext}`, ROOT));
          return true;
        } catch {
          return false;
        }
      });
      if (!exists) out.push({ slug, name, group });
    }
  }
  return out.slice(0, size);
}

/** The draft as the app's recipe document, for the safety gate and the YAML file. */
export function toDoc(slug: string, d: Draft): RecipeDoc & Record<string, unknown> {
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
  return {
    slug,
    title: d.title.trim(),
    titles: { hi: d.title_hi.trim(), "hi-Latn": d.title_hinglish.trim() },
    description: d.description.trim(),
    descriptions: { hi: d.description_hi.trim(), "hi-Latn": d.description_hinglish.trim() },
    cuisine_region: d.cuisine_region.trim().toLowerCase().replace(/[^a-z_]+/g, "_") || undefined,
    course: d.course,
    diet: d.diet,
    base_servings: clamp(d.base_servings, 1, 12),
    prep_time_min: clamp(d.prep_time_min, 0, 600),
    cook_time_min: clamp(d.cook_time_min, 0, 600),
    difficulty: clamp(d.difficulty, 1, 5),
    spice_level: clamp(d.spice_level, 1, 5),
    equipment: [...new Set(d.equipment)],
    tags: [...new Set(d.tags)],
    flavor_profile: Object.fromEntries(Object.entries(d.flavor).map(([k, v]) => [k, Math.max(0, Math.min(1, Math.round(v * 10) / 10))])),
    food_groups: [...new Set(d.food_groups)],
    review_status: "in_review",
    ingredients: d.ingredients.map((i) => ({
      ingredient: i.ingredient.trim().toLowerCase(),
      qty: Math.round(i.qty * 10) / 10,
      unit: i.unit,
      local: i.local.trim() || undefined,
      role: i.role,
      ...(i.group ? { group: i.group.trim() } : {}),
      ...(i.optional ? { optional: true } : {}),
    })),
    steps: d.steps.map((s) => {
      const cues = Object.fromEntries((["look", "sound", "smell", "touch"] as const).filter((k) => s[k]?.trim()).map((k) => [k, s[k]!.trim()]));
      // Only the lines the English step has, so a translation says exactly what the English does.
      const say = (x: SayT) => ({
        text: x.text.trim(),
        ...Object.fromEntries(Object.keys(cues).filter((k) => x[k as keyof SayT]?.trim()).map((k) => [k, (x[k as keyof SayT] as string).trim()])),
        ...(s.safety?.trim() && x.safety?.trim() ? { safety: x.safety.trim() } : {}),
      });
      return {
        text: s.text.trim(),
        ...(s.technique ? { technique: s.technique } : {}),
        ...(s.minutes && s.minutes > 0 ? { minutes: Math.round(s.minutes) } : {}),
        ...(s.whistles && s.whistles > 0 ? { whistles: Math.round(s.whistles) } : {}),
        ...(s.minutes && s.minutes >= 3 ? { timer: true } : {}),
        ...(s.heat ? { heat: s.heat } : {}),
        ...(Object.keys(cues).length ? { cues } : {}),
        ...(s.safety?.trim() ? { safety: s.safety.trim() } : {}),
        say: { hi: say(s.hi), "hi-Latn": say(s.hinglish) },
      };
    }),
  } as RecipeDoc & Record<string, unknown>;
}

/** Problems with a draft: the catalog and the shared safety gate. */
export function draftProblems(doc: RecipeDoc): string[] {
  const out: string[] = [];
  for (const i of doc.ingredients) if (!CATALOG.has(i.ingredient)) out.push(`'${i.ingredient}' is not a catalog name`);
  // Every Hindi and Hinglish step says all the English does: the text, each cue and the safety note.
  doc.steps.forEach((st, n) => {
    const needed = ["text", ...Object.keys(st.cues ?? {}), ...(st.safety ? ["safety"] : [])];
    for (const lang of ["hi", "hi-Latn"] as const) {
      const tr = (st.say?.[lang] ?? {}) as Record<string, string | undefined>;
      const missing = needed.filter((k) => !tr[k]?.trim());
      if (missing.length) out.push(`step ${n + 1}: the ${lang === "hi" ? "Hindi" : "Hinglish"} is missing ${missing.join(", ")}`);
    }
  });
  out.push(...problemLines(checkRecipe(doc, { catalog: CATALOG })));
  return [...new Set(out)];
}

async function write(client: Anthropic, dish: Dish, problems: string[]): Promise<Draft | null> {
  const r = await client.messages.parse(
    {
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(Draft) },
      system: [{ type: "text", cache_control: { type: "ephemeral" }, text: SYSTEM }],
      messages: [{
        role: "user",
        content: JSON.stringify({ dish: dish.name, kind: dish.group, ...(problems.length ? { fix_these_problems_from_your_last_draft: problems } : {}) }),
      }],
    },
    { timeout: 600_000 },
  );
  if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens") return null;
  return (r.parsed_output as Draft | null) ?? null;
}

if (import.meta.main) {
  const size = Number(Deno.args[Deno.args.indexOf("--size") + 1] ?? 25) || 25;
  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    console.error("ANTHROPIC_API_KEY is not set; nothing written.");
    Deno.exit(1);
  }
  const client = new Anthropic();
  const rows: string[] = [];
  let written = 0;
  for (const dish of nextDishes(size)) {
    let problems: string[] = [];
    let doc: RecipeDoc | null = null;
    for (let attempt = 0; attempt < 2 && !doc; attempt++) {
      try {
        const d = await write(client, dish, problems);
        if (!d) {
          problems = ["no usable draft"];
          continue;
        }
        const candidate = toDoc(dish.slug, d);
        problems = draftProblems(candidate);
        if (!problems.length) doc = candidate;
      } catch (err) {
        problems = [`error: ${err instanceof Error ? err.message : String(err)}`];
      }
    }
    if (!doc) {
      rows.push(`| ${dish.name} | not written | ${problems.slice(0, 3).join("; ").replace(/\|/g, "/")} |`);
      continue;
    }
    Deno.writeTextFileSync(new URL(`content/recipes/${dish.slug}.json`, ROOT), JSON.stringify(doc, null, 2));
    written++;
    const allergens = recipeAllergens(doc, CATALOG);
    const parts = blueprint(doc).map((p) => p.technique).join(" → ");
    rows.push(`| ${doc.title} (${doc.titles?.hi}) | ${doc.course}, ${doc.diet}, ${doc.steps.length} steps | ${parts}${allergens.length ? `; contains ${allergens.join(", ")}` : ""} |`);
  }
  console.log(`Wrote ${written} draft recipes (review_status in_review). Each passed the content build and the recipe safety gate.\n`);
  console.log("| Dish | What | Parts and allergens |\n|---|---|---|");
  for (const r of rows) console.log(r);
}
