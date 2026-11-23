// New dish ideas for the preview (mock mode) and offline: everyday home dishes that are not among Cookmate's own
// recipes, offered on Home when the kitchen has what they need, and written out when the cook taps one. The live app
// asks the model instead (suggest-meals' chef step names the dish; invent-dish writes it for this kitchen).
import type { RecipeDoc } from "./recipes";

type Idea = {
  /** Key ingredients the kitchen must have for the idea to be offered. */
  needs: string[];
  why: { en: string; hi: string; hinglish: string };
  doc: RecipeDoc;
};

const step = (text: string, minutes?: number, extra: { cue?: string; safety?: string } = {}) => ({ text, minutes, timer: !!(minutes && minutes >= 3), ...extra });
const ing = (ingredient: string, qty: number, unit: string, local?: string) => ({ ingredient, qty, unit, local, role: "base" as const });

export const IDEAS: Idea[] = [
  {
    needs: ["potato", "green peas", "tomato"],
    why: {
      en: "Potatoes, peas and tomato are all here: a homely aloo matar.",
      hi: "आलू, मटर और टमाटर सब हैं: घर जैसा आलू मटर।",
      hinglish: "Aloo, matar aur tamatar sab hain: ghar jaisa aloo matar.",
    },
    doc: {
      slug: "idea-aloo-matar",
      title: "Aloo Matar",
      titles: { en: "Aloo Matar", hi: "आलू मटर", "hi-Latn": "Aloo Matar" },
      description: "Potatoes and peas in a light tomato gravy, the everyday North Indian way.",
      course: "main", diet: "veg", base_servings: 2, prep_time_min: 10, cook_time_min: 20, difficulty: 1, spice_level: 2,
      tags: ["new_creation"], review_status: "draft",
      ingredients: [
        ing("potato", 250, "g", "2 medium"), ing("green peas", 100, "g", "1 katori"), ing("tomato", 150, "g", "2 medium"),
        ing("onion", 80, "g", "1 small"), ing("cumin seeds", 3, "g", "1 chammach"), ing("turmeric powder", 2, "g", "½ chammach"),
        ing("red chilli powder", 2, "g", "½ chammach"), ing("garam masala", 2, "g", "½ chammach"), ing("salt", 5, "g", "1 chammach"),
      ],
      steps: [
        step("Peel the potatoes and cut them into cubes. Chop the onion and tomatoes."),
        step("Heat oil, add cumin and let it splutter. Fry the onion until golden.", 5, { cue: "The onion turns golden at the edges and smells sweet." }),
        step("Add tomatoes, turmeric, chilli and salt. Cook until the tomatoes are soft and the oil shows at the sides.", 6),
        step("Add potatoes, peas and 1½ cups water. Cover and simmer until the potatoes are soft.", 12, { cue: "A potato cube breaks easily with a spoon." }),
        step("Stir in garam masala, mash a few potatoes to thicken, and serve hot with roti or rice."),
      ],
    },
  },
  {
    needs: ["rice", "tomato", "onion"],
    why: {
      en: "Rice, tomato and onion make a quick tangy tomato rice.",
      hi: "चावल, टमाटर और प्याज़ से झटपट टमाटर राइस बनेगा।",
      hinglish: "Chawal, tamatar aur pyaaz se jhatpat tomato rice banega.",
    },
    doc: {
      slug: "idea-tomato-rice",
      title: "Tomato Rice",
      titles: { en: "Tomato Rice", hi: "टमाटर राइस", "hi-Latn": "Tomato Rice" },
      description: "South Indian style rice cooked with tomatoes, mustard seeds and curry leaves.",
      course: "main", diet: "veg", base_servings: 2, prep_time_min: 10, cook_time_min: 20, difficulty: 1, spice_level: 2,
      tags: ["new_creation"], review_status: "draft",
      ingredients: [
        ing("rice", 150, "g", "1 katori"), ing("tomato", 200, "g", "3 medium"), ing("onion", 80, "g", "1 small"),
        ing("mustard seeds", 3, "g", "½ chammach"), ing("curry leaves", 2, "g", "8 to 10 leaves"), ing("green chilli", 5, "g", "1"),
        ing("turmeric powder", 2, "g", "½ chammach"), ing("salt", 5, "g", "1 chammach"),
      ],
      steps: [
        step("Wash the rice and soak it for 15 minutes. Chop the onion, tomatoes and chilli.", 15),
        step("Heat oil, add mustard seeds and curry leaves. When they crackle, fry the onion and chilli.", 4, { cue: "The mustard seeds pop and the leaves crisp up." }),
        step("Add tomatoes, turmeric and salt and cook until they turn soft and jammy.", 6),
        step("Add the drained rice and 1¾ cups water. Cover and cook on low until the water is absorbed.", 15, { cue: "Small holes appear on top and the rice is soft." }),
        step("Rest for 5 minutes, fluff gently and serve with curd or papad.", 5),
      ],
    },
  },
  {
    needs: ["paneer", "onion", "tomato"],
    why: {
      en: "Paneer, onion and tomato: soft paneer bhurji in 15 minutes.",
      hi: "पनीर, प्याज़ और टमाटर: 15 मिनट में नरम पनीर भुर्जी।",
      hinglish: "Paneer, pyaaz aur tamatar: 15 minute mein naram paneer bhurji.",
    },
    doc: {
      slug: "idea-paneer-bhurji",
      title: "Paneer Bhurji",
      titles: { en: "Paneer Bhurji", hi: "पनीर भुर्जी", "hi-Latn": "Paneer Bhurji" },
      description: "Crumbled paneer cooked quickly with onion, tomato and a little spice.",
      course: "main", diet: "veg", base_servings: 2, prep_time_min: 5, cook_time_min: 10, difficulty: 1, spice_level: 2,
      tags: ["new_creation"], review_status: "draft",
      ingredients: [
        ing("paneer", 200, "g", "1 packet"), ing("onion", 80, "g", "1 small"), ing("tomato", 100, "g", "1 large"),
        ing("green chilli", 5, "g", "1"), ing("turmeric powder", 1, "g", "1 chutki"), ing("salt", 4, "g", "¾ chammach"),
        ing("coriander leaves", 5, "g", "a handful"),
      ],
      steps: [
        step("Crumble the paneer with your fingers. Chop the onion, tomato and chilli."),
        step("Heat oil and fry the onion and chilli until soft.", 4),
        step("Add tomato, turmeric and salt; cook until the tomato is soft.", 3),
        step("Add the paneer, stir gently for 2 minutes so it stays soft, and finish with coriander.", 2, { cue: "The paneer is warm through and still moist." }),
      ],
    },
  },
  {
    needs: ["spinach", "paneer"],
    why: {
      en: "The spinach needs using and there's paneer: palak paneer tonight.",
      hi: "पालक इस्तेमाल करना है और पनीर है: आज पालक पनीर।",
      hinglish: "Palak use karna hai aur paneer hai: aaj palak paneer.",
    },
    doc: {
      slug: "idea-palak-paneer",
      title: "Palak Paneer",
      titles: { en: "Palak Paneer", hi: "पालक पनीर", "hi-Latn": "Palak Paneer" },
      description: "Paneer in a smooth, garlicky spinach gravy.",
      course: "main", diet: "veg", base_servings: 2, prep_time_min: 10, cook_time_min: 20, difficulty: 2, spice_level: 2,
      tags: ["new_creation"], review_status: "draft",
      ingredients: [
        ing("spinach", 250, "g", "1 bunch"), ing("paneer", 200, "g", "1 packet"), ing("onion", 80, "g", "1 small"),
        ing("garlic", 6, "g", "3 cloves"), ing("cumin seeds", 3, "g", "½ chammach"), ing("garam masala", 2, "g", "½ chammach"),
        ing("salt", 4, "g", "¾ chammach"),
      ],
      steps: [
        step("Wash the spinach well. Blanch it in boiling water for 2 minutes, cool and blend smooth.", 2),
        step("Heat oil, add cumin, then the chopped onion and garlic; fry until golden.", 5, { cue: "The garlic smells sweet, not raw." }),
        step("Add the spinach purée, salt and a splash of water. Simmer gently.", 5),
        step("Add paneer cubes and garam masala, simmer 2 minutes so the paneer stays soft, and serve with roti.", 2),
      ],
    },
  },
  {
    needs: ["potato", "whole wheat flour"],
    why: {
      en: "Potatoes and atta are here: hot aloo paratha with curd.",
      hi: "आलू और आटा है: दही के साथ गरम आलू पराठा।",
      hinglish: "Aloo aur atta hai: dahi ke saath garam aloo paratha.",
    },
    doc: {
      slug: "idea-aloo-paratha",
      title: "Aloo Paratha",
      titles: { en: "Aloo Paratha", hi: "आलू पराठा", "hi-Latn": "Aloo Paratha" },
      description: "Whole wheat flatbread stuffed with spiced mashed potato, cooked with ghee on the tawa.",
      course: "breakfast", diet: "veg", base_servings: 2, prep_time_min: 20, cook_time_min: 20, difficulty: 2, spice_level: 1,
      tags: ["new_creation"], review_status: "draft",
      ingredients: [
        ing("whole wheat flour", 200, "g", "2 katori"), ing("potato", 300, "g", "3 medium"), ing("onion", 40, "g", "½ small"),
        ing("red chilli powder", 2, "g", "½ chammach"), ing("garam masala", 1, "g", "1 chutki"), ing("salt", 5, "g", "1 chammach"),
        ing("ghee", 20, "g", "4 chammach"),
      ],
      steps: [
        step("Boil the potatoes until soft, peel and mash them with the chopped onion, chilli, garam masala and salt.", 15, { cue: "A knife slides through the potato with no push." }),
        step("Knead the atta with water and a pinch of salt into a soft dough; rest it 10 minutes.", 10),
        step("Roll a small disc, put a ball of filling in the middle, close it up and roll it out gently.", undefined),
        step("Cook on a hot tawa, then brush with ghee and cook both sides until golden spots appear.", 3, { cue: "Brown spots on both sides and it puffs in places." }),
      ],
    },
  },
  {
    needs: ["spinach", "curd"],
    why: {
      en: "Spinach and curd make a cool palak raita on the side.",
      hi: "पालक और दही से साथ में ठंडा पालक रायता।",
      hinglish: "Palak aur dahi se saath mein thanda palak raita.",
    },
    doc: {
      slug: "idea-palak-raita",
      title: "Palak Raita",
      titles: { en: "Palak Raita", hi: "पालक रायता", "hi-Latn": "Palak Raita" },
      description: "Wilted spinach folded into whisked curd with roasted cumin.",
      course: "side", diet: "veg", base_servings: 2, prep_time_min: 5, cook_time_min: 3, difficulty: 1, spice_level: 1,
      tags: ["new_creation"], review_status: "draft",
      ingredients: [
        ing("spinach", 100, "g", "2 handfuls"), ing("curd", 250, "g", "1 katori"), ing("roasted cumin powder", 2, "g", "½ chammach"),
        ing("salt", 2, "g", "½ chammach"),
      ],
      steps: [
        step("Wash and chop the spinach. Wilt it in a pan with a spoon of water, then let it cool.", 3, { cue: "The leaves turn dark green and soft." }),
        step("Whisk the curd smooth, fold in the spinach, roasted cumin and salt, and serve cool."),
      ],
    },
  },
];

export type IdeaLocale = "en" | "hi" | "hinglish";

/** The first idea the kitchen can make that isn't one of Cookmate's recipes or tonight's picks. */
export function ideaFor(have: ReadonlySet<string>, takenTitles: string[], locale: IdeaLocale): { name: string; why: string } | null {
  return ideasFor(have, takenTitles, locale, 1)[0] ?? null;
}

/** Up to `max` ideas this kitchen can make, skipping taken titles and ones shown lately; ones using `focus` first. */
export function ideasFor(
  have: ReadonlySet<string>,
  takenTitles: string[],
  locale: IdeaLocale,
  max = 3,
  lately: string[] = [],
  focus: string[] = [],
): { name: string; why: string }[] {
  const usesFocus = (i: Idea) => (i.needs.some((k) => focus.includes(k)) ? 0 : 1);
  const pick = (skip: string[]) => {
    const taken = new Set(skip.map((t) => t.toLowerCase()));
    return IDEAS.filter((i) => i.needs.every((k) => have.has(k)))
      .sort((a, b) => usesFocus(a) - usesFocus(b))
      .map((i) => ({ name: locale === "hi" ? i.doc.titles?.hi ?? i.doc.title : i.doc.title, title: i.doc.title, why: i.why[locale] }))
      .filter((i) => !taken.has(i.title.toLowerCase()) && !taken.has(i.name.toLowerCase()))
      .slice(0, max)
      .map(({ name, why }) => ({ name, why }));
  };
  // New ones first; when every idea was shown lately, show them again rather than nothing (as the live chef does).
  const fresh = pick([...takenTitles, ...lately]);
  return fresh.length ? fresh : pick(takenTitles);
}

/** The written-out idea for a dish name (any of its titles), or null when the preview doesn't know that dish. */
export function ideaRecipe(name: string): RecipeDoc | null {
  const low = name.trim().toLowerCase();
  const idea = IDEAS.find((i) => [i.doc.title, i.doc.titles?.hi, i.doc.titles?.["hi-Latn"]].some((t) => t?.toLowerCase() === low));
  return idea ? idea.doc : null;
}
