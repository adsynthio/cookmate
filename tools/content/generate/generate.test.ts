// The generator's offline parts: a draft becomes a recipe document that passes the catalog and the safety gate.
// deno test --allow-read tools/content/generate/generate.test.ts
import { assertEquals } from "jsr:@std/assert@1";

import { draftProblems, toDoc } from "./generate.ts";

const say = (text: string, safety: string | null = null) => ({ text, safety, look: null, sound: null, smell: null, touch: null });
const step = (text: string, extra: Record<string, unknown> = {}) => ({
  text, technique: null, minutes: null, whistles: null, heat: null, look: null, sound: null, smell: null, touch: null, safety: null,
  hi: say("हिंदी", "सावधान"), hinglish: say("Hinglish", "Saavdhaan"), ...extra,
});

const boondiLadoo = {
  title: "Boondi Ladoo", title_hi: "बूंदी लड्डू", title_hinglish: "Boondi Laddoo",
  description: "Crisp besan drops soaked in cardamom syrup and rolled warm.", description_hi: "चाशनी में भीगी बूंदी के लड्डू।", description_hinglish: "Chaashni mein bheegi boondi ke laddoo.",
  cuisine_region: "north", course: "dessert", diet: "veg", base_servings: 4, prep_time_min: 15, cook_time_min: 35, difficulty: 3, spice_level: 1,
  equipment: ["kadai"], tags: ["festive"], food_groups: [], flavor: { rich: 0.6, heat: 0, acid: 0, crunch: 0.2, starch: 0.4, sweet: 1 },
  ingredients: [
    { ingredient: "gram flour", qty: 150, unit: "g", local: "1 katori besan", role: "base", group: null, optional: false },
    { ingredient: "eno", qty: 1, unit: "g", local: "1 chutki", role: "binder", group: null, optional: true },
    { ingredient: "sugar", qty: 200, unit: "g", local: "1 katori", role: "sweet", group: "Chaashni", optional: false },
    { ingredient: "green cardamom", qty: 1, unit: "g", local: "3 elaichi", role: "spice", group: "Chaashni", optional: false },
    { ingredient: "refined oil", qty: 500, unit: "ml", local: "talne ke liye", role: "fat", group: null, optional: false },
    { ingredient: "ghee", qty: 15, unit: "g", local: "1 chammach", role: "fat", group: null, optional: false },
  ],
  steps: [
    step("Whisk the besan with water into a smooth, flowing batter. Add the Eno last and mix gently.", { technique: "batter" }),
    step("Heat the oil. Tap the batter through a jhara into the hot oil and fry in batches until crisp.", { technique: "deep_fry", minutes: 12, heat: "medium", safety: "Never leave hot oil alone and keep children away from the kadai." }),
    step("Boil the sugar with half a katori of water and the elaichi to a one-string syrup.", { technique: "sugar_syrup", minutes: 8, heat: "medium", safety: "Hot syrup burns badly; don't touch it straight from the pan." }),
    step("Stir the boondi and ghee into the warm syrup and rest 10 minutes.", { minutes: 10 }),
    step("With greased palms, roll into ladoos while still warm.", { technique: "shape" }),
  ],
};

Deno.test("a good draft passes the catalog and the safety gate", () => {
  const doc = toDoc("boondi-ladoo", boondiLadoo as never);
  assertEquals(draftProblems(doc), []);
  assertEquals(doc.review_status, "in_review");
  assertEquals(doc.steps[1]!.timer, true);
});

Deno.test("a draft with an unknown ingredient or no hot-oil note is sent back", () => {
  const bad = structuredClone(boondiLadoo);
  bad.ingredients.push({ ingredient: "edible silver", qty: 1, unit: "g", local: "", role: "garnish", group: null, optional: true });
  bad.steps[1]!.safety = null;
  (bad.steps[0] as { look: string | null }).look = "Smooth and flowing.";
  const problems = draftProblems(toDoc("boondi-ladoo", bad as never));
  assertEquals(problems.some((p) => p.includes("Hindi is missing look")), true);
  assertEquals(problems.some((p) => p.includes("not a catalog name")), true);
  assertEquals(problems.some((p) => p.includes("hot-oil")), true);
});
