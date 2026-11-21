// Everyday Indian dishes, written the way a model writes them, must pass the safety gate. The library has 19 recipes
// and no sweets, pickles, drinks or fermented batters, so these cover what AI recipes (new dishes, "Make <dish>",
// family recipes) write every day. Each one is safe as written; a failure here is a false alarm that would show a
// family "Couldn't write it". The unsafe versions of the same habits are at the end and must still be caught.
import assert from "node:assert/strict";
import { test } from "node:test";

import catalogJson from "../data/catalog.json" with { type: "json" };
import { type CatalogEntry, type InventPlan, validateInvention } from "./invent.ts";
import { checkRecipe, problemLines } from "./recipeSafety.ts";
import type { Course, Diet } from "./ranking.ts";
import type { RecipeDoc } from "./recipes.ts";

const catalog = new Map((catalogJson as CatalogEntry[]).map((c) => [c.name, c]));

type Step = string | { text: string; safety?: string; minutes?: number };
const dish = (title: string, course: Course, diet: Diet, servings: number, ingredients: [string, number, string][], steps: Step[]): RecipeDoc => ({
  slug: title.toLowerCase().replace(/\W+/g, "-"),
  title,
  description: `${title}, the home way.`,
  course,
  diet,
  base_servings: servings,
  prep_time_min: 15,
  cook_time_min: 30,
  difficulty: 2,
  spice_level: 2,
  tags: [],
  review_status: "draft",
  ingredients: ingredients.map(([ingredient, qty, unit]) => ({ ingredient, qty, unit, role: "base" })),
  steps: steps.map((s) => (typeof s === "string" ? { text: s } : s)),
});

const HOT_OIL = "Never leave hot oil alone; keep children away and slide food in gently.";
const HOT_GHEE = "Never leave hot ghee alone; keep children away and slide it in gently.";
const COOKER = "Open the cooker only after the pressure has dropped by itself.";

const good: RecipeDoc[] = [
  dish("Idli", "breakfast", "veg", 4, [["rice", 300, "g"], ["urad dal", 100, "g"], ["fenugreek seeds", 2, "g"], ["salt", 6, "g"]], [
    "Soak the rice, and separately the urad dal with fenugreek seeds, for 6 hours.",
    "Grind both into a smooth batter, mix with salt and leave it covered at room temperature overnight (8 to 10 hours) to ferment.",
    { text: "Pour the risen batter into greased idli moulds and steam for 10 to 12 minutes.", minutes: 12 },
    "Rest for a minute, then unmould and serve hot with chutney.",
  ]),
  dish("Masala dosa", "breakfast", "veg", 4, [["rice", 300, "g"], ["urad dal", 80, "g"], ["potato", 400, "g"], ["onion", 1, "piece"], ["mustard seeds", 3, "g"], ["turmeric powder", 2, "g"], ["refined oil", 40, "ml"], ["salt", 8, "g"]], [
    "Soak rice and urad dal for 6 hours, grind smooth and let the batter ferment overnight in a warm place.",
    { text: "Boil the potatoes until soft, then peel and mash them roughly.", minutes: 15 },
    "Crackle mustard seeds in a little oil, add sliced onion until soft, then turmeric, salt and the potatoes.",
    { text: "Spread a ladle of batter thin on a hot tawa, drizzle oil and cook until crisp and golden.", minutes: 3 },
    "Fill with the potato masala, fold and serve.",
  ]),
  dish("Homemade curd", "component", "veg", 4, [["milk", 1000, "ml"], ["curd", 15, "g"]], [
    { text: "Boil the milk, then let it cool until it is lukewarm, just warm to a fingertip.", minutes: 20 },
    "Stir in a spoon of curd, cover and leave it at room temperature overnight to set.",
    "Once set, keep it in the fridge.",
  ]),
  dish("Vegetable biryani", "main", "veg", 4, [["basmati rice", 300, "g"], ["carrot", 100, "g"], ["french beans", 100, "g"], ["green peas", 100, "g"], ["onion", 2, "piece"], ["curd", 100, "g"], ["garam masala", 4, "g"], ["ghee", 40, "ml"], ["salt", 10, "g"], ["saffron", 1, "pinch"]], [
    "Rinse the rice and soak it for 30 minutes.",
    { text: "Boil the rice in salted water until it is half cooked, about 70 percent done, then drain.", minutes: 6 },
    "Fry the onions in ghee until golden, add the vegetables, curd and garam masala and cook until tender.",
    "Layer the rice over the vegetables, sprinkle saffron milk, cover tightly.",
    { text: "Cook on the lowest flame (dum) until the rice is fully cooked and fluffy.", minutes: 20 },
  ]),
  dish("Chicken biryani", "main", "nonveg", 4, [["basmati rice", 300, "g"], ["chicken", 500, "g"], ["curd", 150, "g"], ["onion", 2, "piece"], ["ginger garlic paste", 20, "g"], ["garam masala", 5, "g"], ["red chilli powder", 6, "g"], ["ghee", 40, "ml"], ["salt", 12, "g"]], [
    "Marinate the chicken in curd, ginger garlic paste, chilli powder, garam masala and salt; keep it covered in the fridge overnight.",
    { text: "Boil the rice in salted water until it is half cooked, then drain.", minutes: 6 },
    { text: "Cook the chicken with fried onions in ghee until it is cooked through with no pink inside.", minutes: 25, safety: "Chicken must be cooked through, with no pink inside." },
    { text: "Layer the rice over the chicken, cover tightly and cook on dum until the rice is fully done.", minutes: 20 },
  ]),
  dish("Rajma", "main", "veg", 4, [["kidney beans", 200, "g"], ["onion", 2, "piece"], ["tomato", 3, "piece"], ["ginger garlic paste", 15, "g"], ["red chilli powder", 4, "g"], ["refined oil", 30, "ml"], ["salt", 8, "g"]], [
    "Soak the rajma overnight, then throw away the soaking water and rinse.",
    { text: "Pressure-cook the rajma in fresh water for 6 to 7 whistles until every bean is completely soft.", minutes: 30, safety: `Rajma must be fully soft; never slow-cook it from raw. ${COOKER}` },
    "Fry onions, ginger garlic paste and tomatoes with chilli powder until the oil separates.",
    { text: "Add the cooked rajma with some of its water and simmer until thick.", minutes: 15 },
  ]),
  dish("Mango pickle", "chutney_pickle", "veg", 12, [["raw mango", 1000, "g"], ["salt", 150, "g"], ["mustard oil", 250, "ml"], ["red chilli powder", 50, "g"], ["fenugreek seeds", 20, "g"], ["mustard seeds", 30, "g"], ["turmeric powder", 10, "g"]], [
    "Wash the raw mangoes, dry them completely and cut into pieces with the stone.",
    "Rub the pieces with salt and turmeric and leave them in a clean dry jar for a day.",
    "Roast and coarsely grind the fenugreek and mustard seeds, then mix them in with the chilli powder.",
    { text: "Heat the mustard oil until it smokes, cool it completely and pour it over the mangoes.", minutes: 10, safety: "Let the hot oil cool completely before pouring; keep children away." },
    "Keep the jar in the sun for a week, shaking it daily; always use a dry spoon.",
  ]),
  dish("Lemon pickle", "chutney_pickle", "veg", 12, [["lemon", 12, "piece"], ["salt", 120, "g"], ["red chilli powder", 30, "g"], ["sugar", 100, "g"]], [
    "Cut the lemons into pieces and remove the seeds.",
    "Mix with salt and keep in a dry glass jar in the sun for two weeks, shaking daily, until the peels are soft.",
    "Mix in the chilli powder and sugar and keep for another week before eating.",
  ]),
  dish("Gulab jamun", "dessert", "veg", 6, [["khoya", 200, "g"], ["refined flour", 30, "g"], ["sugar", 400, "g"], ["ghee", 500, "ml"], ["green cardamom", 4, "piece"]], [
    { text: "Boil the sugar with 400 ml water and cardamom for 5 minutes into a light syrup; keep it warm.", minutes: 5 },
    "Knead the khoya with the flour into a smooth soft dough and roll into crack-free balls.",
    { text: "Fry the balls in hot ghee on a low flame, turning gently, until deep golden brown.", minutes: 10, safety: HOT_GHEE },
    { text: "Drop them straight into the warm syrup and soak for at least 2 hours.", minutes: 120 },
  ]),
  dish("Jalebi", "dessert", "veg", 6, [["refined flour", 200, "g"], ["curd", 50, "g"], ["sugar", 300, "g"], ["refined oil", 500, "ml"], ["saffron", 1, "pinch"]], [
    "Mix the flour and curd with water into a thick batter and leave it covered overnight to ferment.",
    { text: "Boil the sugar with 200 ml water and saffron to a one-string syrup; keep it lukewarm.", minutes: 8 },
    { text: "Pipe spirals of batter into the hot oil and fry until crisp on both sides.", minutes: 3, safety: HOT_OIL },
    "Dip the hot jalebis in the syrup for a minute and serve.",
  ]),
  dish("Gajar ka halwa", "dessert", "veg", 4, [["carrot", 1000, "g"], ["milk", 1000, "ml"], ["sugar", 200, "g"], ["ghee", 60, "ml"], ["khoya", 100, "g"], ["cashews", 20, "g"], ["green cardamom", 4, "piece"]], [
    "Grate the carrots.",
    { text: "Cook the carrots in the milk on a medium flame, stirring often, until the milk dries up.", minutes: 45 },
    { text: "Add the sugar and ghee and cook until glossy and the ghee shows at the sides.", minutes: 15 },
    "Stir in the crumbled khoya, crushed cardamom and chopped cashews.",
  ]),
  dish("Rice kheer", "dessert", "veg", 4, [["milk", 1000, "ml"], ["rice", 50, "g"], ["sugar", 120, "g"], ["green cardamom", 4, "piece"], ["almonds", 15, "g"]], [
    "Wash the rice and soak it for 20 minutes.",
    { text: "Simmer the rice in the milk, stirring often so it doesn't stick, until thick and creamy.", minutes: 40 },
    "Stir in the sugar and crushed cardamom, top with sliced almonds and serve warm or chilled.",
  ]),
  dish("Besan laddu", "dessert", "veg", 6, [["gram flour", 300, "g"], ["ghee", 150, "ml"], ["sugar", 250, "g"], ["green cardamom", 5, "piece"]], [
    { text: "Roast the gram flour in the ghee on a low flame, stirring all the time, until nutty and golden.", minutes: 25 },
    "Let it cool until just warm, then mix in powdered sugar and cardamom.",
    "Shape into laddus while the mixture is still warm.",
  ]),
  dish("Masala chai", "drink", "veg", 2, [["tea leaves", 8, "g"], ["milk", 250, "ml"], ["sugar", 20, "g"], ["ginger", 10, "g"], ["green cardamom", 2, "piece"]], [
    { text: "Boil 250 ml water with crushed ginger and cardamom.", minutes: 3 },
    { text: "Add the tea leaves and sugar, then the milk, and boil until it turns a rich brown.", minutes: 4 },
    "Strain into cups and serve hot.",
  ]),
  dish("Sweet lassi", "drink", "veg", 2, [["curd", 400, "g"], ["sugar", 50, "g"], ["green cardamom", 2, "piece"]], [
    "Whisk the chilled curd with the sugar, crushed cardamom and 100 ml cold water until frothy.",
    "Pour into glasses and serve cold.",
  ]),
  dish("Sambar", "main", "veg", 4, [["toor dal", 150, "g"], ["tamarind", 20, "g"], ["sambar powder", 15, "g"], ["drumstick", 2, "piece"], ["brinjal", 150, "g"], ["onion", 1, "piece"], ["mustard seeds", 3, "g"], ["curry leaves", 10, "piece"], ["refined oil", 20, "ml"], ["salt", 10, "g"]], [
    { text: "Pressure-cook the toor dal with turmeric until completely soft, then mash.", minutes: 15, safety: COOKER },
    "Soak the tamarind in warm water and squeeze out the pulp.",
    { text: "Cook the vegetables in the tamarind water with sambar powder and salt until tender.", minutes: 12 },
    { text: "Add the dal, simmer, then pour over a tadka of mustard seeds and curry leaves.", minutes: 5 },
  ]),
  dish("Kanda poha", "breakfast", "veg", 2, [["poha", 150, "g"], ["onion", 1, "piece"], ["potato", 1, "piece"], ["peanuts", 20, "g"], ["mustard seeds", 2, "g"], ["turmeric powder", 1, "g"], ["refined oil", 15, "ml"], ["salt", 4, "g"], ["lemon", 1, "piece"]], [
    "Rinse the poha in a sieve and let it soften for 5 minutes.",
    "Fry the peanuts, then the mustard seeds, and the onions until soft and slightly pink.",
    { text: "Add diced potato, turmeric and salt, cover and cook until the potato is tender.", minutes: 8 },
    "Fold in the poha, heat through and finish with lemon juice.",
  ]),
  dish("Khaman dhokla", "snack", "veg", 4, [["gram flour", 200, "g"], ["curd", 100, "g"], ["eno", 5, "g"], ["sugar", 15, "g"], ["mustard seeds", 3, "g"], ["curry leaves", 10, "piece"], ["refined oil", 20, "ml"], ["salt", 5, "g"]], [
    "Whisk the gram flour, curd, salt, sugar and water into a smooth batter and rest it for 10 minutes.",
    { text: "Stir in the Eno, pour into a greased plate and steam for 15 minutes.", minutes: 15 },
    "Pour a tadka of mustard seeds and curry leaves over it, then cut into squares.",
  ]),
  dish("Chole bhature", "main", "veg", 4, [["chickpeas", 250, "g"], ["chole masala", 15, "g"], ["onion", 2, "piece"], ["tomato", 3, "piece"], ["refined flour", 300, "g"], ["curd", 60, "g"], ["refined oil", 500, "ml"], ["salt", 10, "g"]], [
    "Soak the chickpeas overnight.",
    { text: "Pressure-cook them until soft, then simmer with fried onion, tomato and chole masala.", minutes: 35, safety: COOKER },
    "Knead the flour with curd, salt and water into a soft dough and let it rest for 2 hours.",
    { text: "Roll out the bhature and deep fry them in hot oil until puffed and golden.", minutes: 10, safety: HOT_OIL },
  ]),
  dish("Egg curry", "main", "eggetarian", 4, [["egg", 6, "piece"], ["onion", 2, "piece"], ["tomato", 2, "piece"], ["garam masala", 4, "g"], ["refined oil", 30, "ml"], ["salt", 6, "g"]], [
    { text: "Hard-boil the eggs for 10 minutes until the yolks are fully set, then peel.", minutes: 10, safety: "Eggs must be fully set." },
    "Fry onions and tomatoes with garam masala and salt into a thick gravy.",
    { text: "Add the eggs and simmer for a few minutes.", minutes: 5 },
  ]),
  dish("Fish curry", "main", "nonveg", 4, [["fish", 500, "g"], ["coconut", 100, "g"], ["kokum", 4, "piece"], ["red chilli powder", 6, "g"], ["turmeric powder", 2, "g"], ["coconut oil", 30, "ml"], ["salt", 8, "g"]], [
    "Grind the coconut with chilli powder and turmeric into a smooth paste.",
    { text: "Simmer the paste with water and kokum.", minutes: 8 },
    { text: "Slide in the fish and simmer until it is opaque and flakes easily, cooked through.", minutes: 8, safety: "Fish must be cooked through and flake easily." },
  ]),
  dish("Onion pakoda", "snack", "veg", 4, [["onion", 3, "piece"], ["gram flour", 150, "g"], ["red chilli powder", 4, "g"], ["carom seeds", 2, "g"], ["refined oil", 500, "ml"], ["salt", 5, "g"]], [
    "Mix sliced onions with gram flour, chilli powder, carom seeds, salt and a little water.",
    { text: "Drop small spoonfuls into hot oil and fry until crisp and golden.", minutes: 8, safety: HOT_OIL },
    "Drain on paper and serve hot with chutney.",
  ]),
];

// A dish a model wrote, as the new-dish check (validateInvention) sees it: everything is in the kitchen.
const plan: InventPlan = { use: [], roles: [], gaps: [], cooked: [] };

for (const doc of good) {
  test(`passes: ${doc.title}`, () => {
    assert.deepEqual(problemLines(checkRecipe(doc, { catalog, diet: doc.diet })), [], "recipe safety gate");
    const have = new Set(doc.ingredients.map((i) => i.ingredient));
    assert.deepEqual(validateInvention(doc, plan, { catalog, diet: doc.diet, have }).filter((p) => p.startsWith("unsafe")), [], "new-dish check");
  });
}

// The same habits, done unsafely, are still refused.
const unsafe: [string, RecipeDoc][] = [
  ["leftover dal reheated only until lukewarm", dish("Dal", "main", "veg", 2, [["toor dal", 100, "g"], ["salt", 4, "g"]], [
    "Take yesterday's leftover dal from the fridge.", "Reheat it until just lukewarm and serve."])],
  ["cooked rice left out overnight", dish("Fried rice", "main", "veg", 2, [["rice", 200, "g"], ["salt", 4, "g"]], [
    "Leave the cooked rice out overnight so it dries.", "Stir-fry it the next day."])],
  ["chicken served half-cooked", dish("Chicken fry", "main", "nonveg", 2, [["chicken", 300, "g"], ["salt", 4, "g"]], [
    "Fry the chicken until half cooked and serve it hot.", "Garnish and serve."])],
  ["mutton still pink inside", dish("Mutton fry", "main", "nonveg", 2, [["mutton", 300, "g"], ["salt", 4, "g"]], [
    "Cook the mutton until it is still pink inside for tenderness.", "Serve."])],
];
for (const [name, doc] of unsafe) {
  test(`refused: ${name}`, () => {
    assert.ok(problemLines(checkRecipe(doc, { catalog, diet: doc.diet })).some((p) => p.includes("unsafe:")), name);
  });
}
