// GENERATED from apps/mobile/src/domain/rescue.ts by scripts/sync-shared.py. Do not edit; edit the source and re-run.
// Rescue (KIT-090/091/092): what to do when a dish goes wrong mid-cook. Shared by the app and the rescue Edge
// Function (copied to supabase/functions/_shared by scripts/sync-shared.py). No React, no network.
//
// Three rules hold everywhere this is used:
//   1. Safety notes come from SAFETY_PLAYBOOK below, word for word, on screen and in voice. A model never writes one.
//   2. "It's undercooked" for a dish with meat, fish, egg or kidney beans is always answered from the playbook.
//   3. A fix only names things the cook has: the kitchen list, the recipe's own ingredients, water.
import type { RecipeIngredientDoc } from "./recipes.ts";

export type RescueLocale = "en" | "hi" | "hinglish";
type L = Record<RescueLocale, string>;

export const PROBLEMS = ["too_salty", "burning", "too_watery", "too_thick", "too_spicy", "undercooked", "missing_ingredient"] as const;
export type Problem = (typeof PROBLEMS)[number];

export function isProblem(x: unknown): x is Problem {
  return typeof x === "string" && (PROBLEMS as readonly string[]).includes(x);
}

export type CatalogLookup = {
  category: (key: string) => string | undefined;
  name: (key: string, locale: RescueLocale) => string;
};

/** Build a lookup from catalog entries (apps/mobile/src/data/catalog.json). */
export function catalogLookup(entries: { name: string; hi?: string; latn?: string; category?: string }[]): CatalogLookup {
  const byName = new Map(entries.map((e) => [e.name, e]));
  return {
    category: (key) => byName.get(key)?.category,
    name: (key, locale) => {
      const e = byName.get(key);
      return (locale === "hi" ? e?.hi : locale === "hinglish" ? e?.latn : undefined) ?? key;
    },
  };
}

export type RescueContext = {
  ingredients: Pick<RecipeIngredientDoc, "ingredient" | "role" | "optional" | "substitutes">[];
  /** Technique of each step, in order (undefined where the step has none). */
  techniques: (string | undefined)[];
  /** Canonical names of what is confidently in the kitchen, staples included. */
  pantry: string[];
  /** For missing_ingredient: which one. */
  missing?: string;
  /** Anything the cook typed or said about the problem. */
  details?: string;
};

export type RescueResult = {
  /** At most three short things to do now, in the cook's language. */
  steps: string[];
  /** Pinned safety text for this situation, word for word from the playbook; null when none applies. */
  safetyNote: string | null;
  /** Ingredient names the steps rely on. */
  uses: string[];
  source: "rules" | "model";
};

// --- safety playbook (KIT-092) ---------------------------------------------------------------------------------------

export type SafetyId = "undercooked_meat" | "raw_egg" | "kidney_beans" | "oil_fire" | "spoiled_food" | "reheated_rice";

export const SAFETY_PLAYBOOK: Record<SafetyId, L> = {
  undercooked_meat: {
    en: "Chicken, meat and fish must be cooked all the way through. If any piece is pink inside, cook it longer. Do not taste it to check.",
    hi: "चिकन, मीट और मछली पूरी तरह पकी होनी चाहिए। कोई भी टुकड़ा अंदर से गुलाबी हो तो और पकाएँ। जाँचने के लिए चखें नहीं।",
    hinglish: "Chicken, meat aur machhli poori tarah paki honi chahiye. Koi bhi tukda andar se gulabi ho to aur pakayein. Check karne ke liye chakhein nahi.",
  },
  raw_egg: {
    en: "Cook eggs until both the white and the yolk are firm. Runny egg is not safe for small children, pregnant women or older people.",
    hi: "अंडे तब तक पकाएँ जब तक सफ़ेदी और ज़र्दी दोनों जम न जाएँ। अधपका अंडा छोटे बच्चों, गर्भवती महिलाओं और बुज़ुर्गों के लिए सुरक्षित नहीं है।",
    hinglish: "Ande tab tak pakayein jab tak safedi aur zardi dono jam na jaayein. Adhpaka anda chhote bachchon, pregnant mahilaon aur buzurgon ke liye safe nahi hai.",
  },
  kidney_beans: {
    en: "Raw or undercooked kidney beans are poisonous. Cook until every bean is completely soft. If any bean is still firm, do not eat them yet.",
    hi: "कच्चा या अधपका राजमा ज़हरीला होता है। हर दाना पूरी तरह नरम होने तक पकाएँ। कोई दाना सख़्त हो तो अभी न खाएँ।",
    hinglish: "Kachcha ya adhpaka rajma zehreela hota hai. Har daana poori tarah naram hone tak pakayein. Koi daana sakht ho to abhi na khayein.",
  },
  oil_fire: {
    en: "If oil catches fire, turn off the gas and cover the pan with a lid or a steel plate. Never pour water on burning oil.",
    hi: "तेल में आग लग जाए तो गैस बंद करें और बर्तन को ढक्कन या स्टील की थाली से ढक दें। जलते तेल पर कभी पानी न डालें।",
    hinglish: "Tel mein aag lag jaaye to gas band karein aur bartan ko dhakkan ya steel ki thaali se dhak dein. Jalte tel par kabhi paani na daalein.",
  },
  spoiled_food: {
    en: "If food smells sour, feels slimy or has mould, throw it away. Cooking it again does not make it safe. If you are not sure, do not eat it.",
    hi: "खाने से खट्टी गंध आए, चिपचिपा लगे या फफूँद दिखे तो उसे फेंक दें। दोबारा पकाने से वह सुरक्षित नहीं होता। शक हो तो न खाएँ।",
    hinglish: "Khane se khatti gandh aaye, chipchipa lage ya fafoond dikhe to use phenk dein. Dobara pakane se woh safe nahi hota. Shak ho to na khayein.",
  },
  reheated_rice: {
    en: "Cooked rice should not sit out. Put leftovers in the fridge within an hour, eat them within a day, and reheat only once, until steaming hot.",
    hi: "पका चावल बाहर न छोड़ें। बचा हुआ एक घंटे के अंदर फ़्रिज में रखें, एक दिन में खा लें, और सिर्फ़ एक बार, भाप निकलने तक गरम करें।",
    hinglish: "Paka chawal bahar na chhodein. Bacha hua ek ghante ke andar fridge mein rakhein, ek din mein kha lein, aur sirf ek baar, bhaap nikalne tak garam karein.",
  },
};

const SPOILED = /smell|sour|spoil|slim|mould|mold|rotten|\boff\b|kharab|kharaab|baasi|basi|badbu|sada|sad gaya|खराब|ख़राब|बासी|बदबू|सड़|फफूँद/i;
const RICE = /(^|\s)(rice|poha)(\s|$)/;

const has = (ctx: Pick<RescueContext, "ingredients">, test: (key: string) => boolean) => ctx.ingredients.some((i) => test(i.ingredient));
const hasMeat = (ctx: RescueContext, cat: CatalogLookup) => has(ctx, (k) => ["meat", "seafood"].includes(cat.category(k) ?? ""));
const hasEgg = (ctx: RescueContext, cat: CatalogLookup) => has(ctx, (k) => cat.category(k) === "egg");
const hasKidneyBeans = (ctx: RescueContext) => has(ctx, (k) => k === "kidney beans");
const hasPulse = (ctx: RescueContext, cat: CatalogLookup) => has(ctx, (k) => cat.category(k) === "pulse");

/** Which playbook entries apply to this problem and dish, most serious first. */
export function safetyFor(problem: Problem, ctx: RescueContext, cat: CatalogLookup): SafetyId[] {
  const ids: SafetyId[] = [];
  if (problem === "undercooked") {
    if (hasMeat(ctx, cat)) ids.push("undercooked_meat");
    if (hasEgg(ctx, cat)) ids.push("raw_egg");
    if (hasKidneyBeans(ctx)) ids.push("kidney_beans");
  }
  if (problem === "burning") ids.push("oil_fire");
  if (ctx.details && SPOILED.test(ctx.details)) ids.push("spoiled_food");
  return ids;
}

/** Safety text to show with leftovers of this dish (finish sheet): cooked rice is the one that catches people out. */
export function leftoverSafety(ingredients: { ingredient: string }[]): SafetyId | null {
  return ingredients.some((i) => RICE.test(i.ingredient)) ? "reheated_rice" : null;
}

export function safetyText(ids: SafetyId[], locale: RescueLocale): string | null {
  return ids.length ? ids.map((id) => SAFETY_PLAYBOOK[id][locale]).join(" ") : null;
}

/** Undercooked meat, fish, egg or kidney beans: the answer is the playbook, never a model's. */
export function mustUseRules(problem: Problem, ctx: RescueContext, cat: CatalogLookup): boolean {
  return problem === "undercooked" && (hasMeat(ctx, cat) || hasEgg(ctx, cat) || hasKidneyBeans(ctx));
}

/** The whole playbook as text, pinned in the rescue model's system prompt. */
export function playbookText(): string {
  return (Object.keys(SAFETY_PLAYBOOK) as SafetyId[]).map((id) => `- ${id}: ${SAFETY_PLAYBOOK[id].en}`).join("\n");
}

// --- fixes -----------------------------------------------------------------------------------------------------------

const T = {
  softenDairy: {
    en: "Lower the heat and stir in 2 chammach of {item}. It softens the salt.",
    hi: "आँच धीमी करें और 2 चम्मच {item} मिलाएँ। इससे नमक हल्का लगता है।",
    hinglish: "Aanch dheemi karein aur 2 chammach {item} milayein. Isse namak halka lagta hai.",
  },
  diluteWater: {
    en: "Add half a katori of hot water and simmer for 2 to 3 minutes.",
    hi: "आधी कटोरी गरम पानी डालें और 2-3 मिनट उबलने दें।",
    hinglish: "Aadhi katori garam paani daalein aur 2-3 minute ubalne dein.",
  },
  bulk: {
    en: "Add a boiled, mashed {item}. More food spreads it out.",
    hi: "एक उबला, मसला हुआ {item} मिलाएँ। खाना बढ़ने से यह हल्का हो जाता है।",
    hinglish: "Ek ubla, masla hua {item} milayein. Khana badhne se yeh halka ho jaata hai.",
  },
  sour: {
    en: "Finish with a squeeze of {item}. Sour balances it.",
    hi: "आख़िर में थोड़ा {item} निचोड़ें। खटास इसे संतुलित करती है।",
    hinglish: "Aakhir mein thoda {item} nichodein. Khatas ise balance karti hai.",
  },
  sweet: {
    en: "Add a pinch of {item} and taste.",
    hi: "एक चुटकी {item} डालें और चखें।",
    hinglish: "Ek chutki {item} daalein aur chakhein.",
  },
  servePlainSalt: {
    en: "Serve with plain rice or roti and unsalted curd. Do not salt anything else.",
    hi: "सादे चावल या रोटी और बिना नमक के दही के साथ परोसें। बाकी किसी चीज़ में नमक न डालें।",
    hinglish: "Saade chawal ya roti aur bina namak ke dahi ke saath parosein. Baaki kisi cheez mein namak na daalein.",
  },
  heatOff: {
    en: "Turn the heat off now and lift the pan off the burner.",
    hi: "अभी आँच बंद करें और बर्तन चूल्हे से उतार लें।",
    hinglish: "Abhi aanch band karein aur bartan chulhe se utaar lein.",
  },
  moveTop: {
    en: "Pour the top part into a clean pan. Do not scrape the bottom: the burnt taste is there.",
    hi: "ऊपर का हिस्सा साफ़ बर्तन में निकाल लें। तले को न खुरचें: जला स्वाद वहीं है।",
    hinglish: "Upar ka hissa saaf bartan mein nikaal lein. Tale ko na khurchein: jala swaad wahin hai.",
  },
  carryOnWet: {
    en: "Add a splash of hot water, taste, and carry on over low heat, stirring.",
    hi: "थोड़ा गरम पानी डालें, चखें, और धीमी आँच पर चलाते हुए आगे पकाएँ।",
    hinglish: "Thoda garam paani daalein, chakhein, aur dheemi aanch par chalate hue aage pakayein.",
  },
  carryOnDry: {
    en: "Add a spoon of oil if it looks dry, and carry on over low heat, stirring.",
    hi: "सूखा लगे तो एक चम्मच तेल डालें, और धीमी आँच पर चलाते हुए आगे पकाएँ।",
    hinglish: "Sookha lage to ek chammach tel daalein, aur dheemi aanch par chalate hue aage pakayein.",
  },
  reduce: {
    en: "Take the lid off and simmer on medium heat, stirring now and then, until it thickens.",
    hi: "ढक्कन हटाएँ और मध्यम आँच पर बीच-बीच में चलाते हुए गाढ़ा होने तक पकाएँ।",
    hinglish: "Dhakkan hatayein aur medium aanch par beech-beech mein chalate hue gaadha hone tak pakayein.",
  },
  slurry: {
    en: "Mix 1 chhota chammach of {item} into 2 chammach of cold water, stir it in and cook for 3 to 4 minutes.",
    hi: "1 छोटा चम्मच {item} को 2 चम्मच ठंडे पानी में घोलें, मिलाएँ और 3-4 मिनट पकाएँ।",
    hinglish: "1 chhota chammach {item} ko 2 chammach thande paani mein gholein, milayein aur 3-4 minute pakayein.",
  },
  mash: {
    en: "Mash a few pieces against the side of the pan. They thicken the gravy.",
    hi: "कुछ टुकड़े बर्तन के किनारे पर मसल दें। इससे ग्रेवी गाढ़ी होती है।",
    hinglish: "Kuch tukde bartan ke kinaare par masal dein. Isse gravy gaadhi hoti hai.",
  },
  dryOff: {
    en: "Cook without the lid on high heat, stirring, until the water dries up.",
    hi: "बिना ढक्कन के तेज़ आँच पर चलाते हुए पानी सूखने तक पकाएँ।",
    hinglish: "Bina dhakkan ke tez aanch par chalate hue paani sookhne tak pakayein.",
  },
  loosen: {
    en: "Add hot water 2 chammach at a time, stirring, until it is as loose as you like.",
    hi: "एक बार में 2 चम्मच गरम पानी डालकर चलाते जाएँ, जब तक मनचाहा पतला न हो जाए।",
    hinglish: "Ek baar mein 2 chammach garam paani daalkar chalate jaayein, jab tak manchaha patla na ho jaaye.",
  },
  tasteAfterThinning: {
    en: "Simmer for a minute and taste. Thinning weakens the salt and spice, so adjust them.",
    hi: "एक मिनट उबालें और चखें। पतला करने से नमक-मसाला हल्का हो जाता है, ज़रूरत हो तो ठीक करें।",
    hinglish: "Ek minute ubaalein aur chakhein. Patla karne se namak-masala halka ho jaata hai, zaroorat ho to theek karein.",
  },
  sprinkle: {
    en: "Sprinkle a little water, cover, and cook on low heat for 2 minutes.",
    hi: "थोड़ा पानी छिड़कें, ढकें और धीमी आँच पर 2 मिनट पकाएँ।",
    hinglish: "Thoda paani chhidkein, dhakein aur dheemi aanch par 2 minute pakayein.",
  },
  calmFat: {
    en: "Lower the heat and stir in 2 chammach of {item}. Fat calms chilli.",
    hi: "आँच धीमी करें और 2 चम्मच {item} मिलाएँ। चिकनाई मिर्च को शांत करती है।",
    hinglish: "Aanch dheemi karein aur 2 chammach {item} milayein. Chiknai mirch ko shaant karti hai.",
  },
  servePlainSpice: {
    en: "Serve with plain curd, rice or roti. For children, take out a portion and mix it with curd or ghee.",
    hi: "सादे दही, चावल या रोटी के साथ परोसें। बच्चों के लिए थोड़ा अलग निकालकर दही या घी मिला दें।",
    hinglish: "Saade dahi, chawal ya roti ke saath parosein. Bachchon ke liye thoda alag nikaalkar dahi ya ghee mila dein.",
  },
  meatLonger: {
    en: "Keep cooking. Cover and simmer on low heat for 10 more minutes; add a splash of hot water if it looks dry.",
    hi: "पकाते रहें। ढककर धीमी आँच पर 10 मिनट और पकाएँ; सूखा लगे तो थोड़ा गरम पानी डालें।",
    hinglish: "Pakate rahein. Dhakkar dheemi aanch par 10 minute aur pakayein; sookha lage to thoda garam paani daalein.",
  },
  meatCheck: {
    en: "Cut the thickest piece. It is done when there is no pink inside and the juices run clear.",
    hi: "सबसे मोटा टुकड़ा काटकर देखें। अंदर गुलाबी न हो और रस साफ़ निकले, तब पका है।",
    hinglish: "Sabse mota tukda kaatkar dekhein. Andar gulabi na ho aur ras saaf nikle, tab paka hai.",
  },
  eggLonger: {
    en: "Keep cooking on low heat, stirring, until no liquid egg is left.",
    hi: "धीमी आँच पर चलाते हुए तब तक पकाएँ जब तक कच्चा अंडा बिल्कुल न बचे।",
    hinglish: "Dheemi aanch par chalate hue tab tak pakayein jab tak kachcha anda bilkul na bache.",
  },
  pulseLonger: {
    en: "Close the cooker and give it 3 to 4 more whistles. Add half a katori of water first if it looks dry.",
    hi: "कुकर बंद करें और 3-4 सीटी और आने दें। सूखा लगे तो पहले आधी कटोरी पानी डालें।",
    hinglish: "Cooker band karein aur 3-4 seeti aur aane dein. Sookha lage to pehle aadhi katori paani daalein.",
  },
  pulseCheck: {
    en: "Let the pressure drop by itself, then press one between two fingers. It should mash easily.",
    hi: "भाप अपने आप निकलने दें, फिर एक दाना दो उँगलियों में दबाएँ। आसानी से मसल जाना चाहिए।",
    hinglish: "Bhaap apne aap nikalne dein, phir ek daana do ungliyon mein dabayein. Aasani se masal jaana chahiye.",
  },
  vegLonger: {
    en: "Add a splash of hot water, cover, and cook on low heat for 5 more minutes.",
    hi: "थोड़ा गरम पानी डालें, ढकें और धीमी आँच पर 5 मिनट और पकाएँ।",
    hinglish: "Thoda garam paani daalein, dhakein aur dheemi aanch par 5 minute aur pakayein.",
  },
  vegCheck: {
    en: "Push a knife into the biggest piece. It should go in easily.",
    hi: "सबसे बड़े टुकड़े में चाकू डालकर देखें। आसानी से जाना चाहिए।",
    hinglish: "Sabse bade tukde mein chaaku daalkar dekhein. Aasani se jaana chahiye.",
  },
  sourLater: {
    en: "Add tomato, lemon or other sour things only after it turns soft. Sour slows cooking.",
    hi: "टमाटर, नींबू या दूसरी खट्टी चीज़ें नरम होने के बाद ही डालें। खटास पकने को धीमा करती है।",
    hinglish: "Tamatar, nimbu ya doosri khatti cheezein naram hone ke baad hi daalein. Khatas pakne ko dheema karti hai.",
  },
  useInstead: {
    en: "Use {item} in place of {missing}.",
    hi: "{missing} की जगह {item} इस्तेमाल करें।",
    hinglish: "{missing} ki jagah {item} use karein.",
  },
  leaveOut: {
    en: "Leave out the {missing}. The dish still works without it.",
    hi: "{missing} छोड़ दें। इसके बिना भी डिश बन जाएगी।",
    hinglish: "{missing} chhod dein. Iske bina bhi dish ban jaayegi.",
  },
  essential: {
    en: "{missing} is the heart of this dish, and nothing in your kitchen replaces it. Turn the heat off while you get some.",
    hi: "{missing} इस डिश की जान है, और आपकी रसोई में इसकी जगह लेने वाली कोई चीज़ नहीं है। जब तक ले आएँ, आँच बंद रखें।",
    hinglish: "{missing} is dish ki jaan hai, aur aapki kitchen mein iski jagah lene wali koi cheez nahi hai. Jab tak le aayein, aanch band rakhein.",
  },
  carryOnWithout: {
    en: "Nothing in your kitchen replaces {missing}. You can carry on without it; the taste will be a little different.",
    hi: "आपकी रसोई में {missing} की जगह लेने वाली कोई चीज़ नहीं है। इसके बिना भी आगे बढ़ सकते हैं; स्वाद थोड़ा अलग होगा।",
    hinglish: "Aapki kitchen mein {missing} ki jagah lene wali koi cheez nahi hai. Iske bina bhi aage badh sakte hain; swaad thoda alag hoga.",
  },
  whichOne: {
    en: "Tell me which ingredient is missing and we will find what to use instead.",
    hi: "बताइए कौन-सी चीज़ नहीं है, फिर उसकी जगह क्या लें यह देखते हैं।",
    hinglish: "Bataiye kaun-si cheez nahi hai, phir uski jagah kya lein yeh dekhte hain.",
  },
} satisfies Record<string, L>;

const DAIRY = ["curd", "cream", "milk", "coconut milk"];
const FAT = ["curd", "cream", "milk", "coconut milk", "butter", "ghee"];
const SOUR = ["lemon"];
const SWEET = ["sugar", "jaggery"];
const THICKENERS = ["gram flour", "cornflour", "rice flour"];
const WET = ["simmer", "pressure_cook"];
/** Roles a dish can lose and still be the dish (same list as adapt.ts). */
const DROPPABLE = ["garnish", "heat", "aromatic"];
/** Roles the dish is built on. */
const ESSENTIAL = ["protein", "base", "starch", "vegetable", "binder"];

type Fix = { text: L; item?: string };

/** A dish with a simmered or pressure-cooked step has liquid to work with. */
export function isWetDish(ctx: Pick<RescueContext, "techniques">): boolean {
  return ctx.techniques.some((t) => t !== undefined && WET.includes(t));
}

function fixesFor(problem: Problem, ctx: RescueContext, cat: CatalogLookup): Fix[] {
  const inKitchen = (options: string[]) => options.find((o) => ctx.pantry.includes(o));
  const withItem = (text: L, options: string[]): Fix[] => {
    const item = inKitchen(options);
    return item ? [{ text, item }] : [];
  };
  const wet = isWetDish(ctx);

  switch (problem) {
    case "too_salty":
      return wet
        ? [...withItem(T.softenDairy, DAIRY), { text: T.diluteWater }, ...withItem(T.bulk, ["potato"]), ...withItem(T.sour, SOUR), { text: T.servePlainSalt }]
        : [...withItem(T.bulk, ["potato"]), ...withItem(T.sour, SOUR), { text: T.servePlainSalt }];
    case "burning":
      return [{ text: T.heatOff }, { text: T.moveTop }, { text: wet ? T.carryOnWet : T.carryOnDry }];
    case "too_watery":
      return wet
        ? [{ text: T.reduce }, ...(hasPulse(ctx, cat) || has(ctx, (k) => k === "potato") ? [{ text: T.mash }] : []), ...withItem(T.slurry, THICKENERS)]
        : [{ text: T.dryOff }];
    case "too_thick":
      return wet ? [{ text: T.loosen }, { text: T.tasteAfterThinning }] : [{ text: T.sprinkle }];
    case "too_spicy":
      return [...withItem(T.calmFat, FAT), ...withItem(T.sweet, SWEET), ...withItem(T.sour, SOUR), ...withItem(T.bulk, ["potato"]), { text: T.servePlainSpice }];
    case "undercooked": {
      if (hasMeat(ctx, cat)) return [{ text: T.meatLonger }, { text: T.meatCheck }];
      if (hasEgg(ctx, cat)) return [{ text: T.eggLonger }];
      if (hasPulse(ctx, cat)) return [{ text: T.pulseLonger }, { text: T.pulseCheck }];
      const sour = ctx.ingredients.some((i) => i.role === "acid");
      return [{ text: T.vegLonger }, { text: T.vegCheck }, ...(sour ? [{ text: T.sourLater }] : [])];
    }
    case "missing_ingredient": {
      const line = ctx.ingredients.find((i) => i.ingredient === ctx.missing);
      if (!ctx.missing || !line) return [{ text: T.whichOne }];
      const swap = (line.substitutes ?? []).find((s) => ctx.pantry.includes(s.ingredient));
      if (swap) return [{ text: T.useInstead, item: swap.ingredient }];
      if (line.optional || DROPPABLE.includes(line.role)) return [{ text: T.leaveOut }];
      return [{ text: ESSENTIAL.includes(line.role) ? T.essential : T.carryOnWithout }];
    }
  }
}

/** True when the rules had a real answer for a missing ingredient (a reviewed substitute, or it can be left out). */
export function missingResolved(ctx: RescueContext): boolean {
  const line = ctx.ingredients.find((i) => i.ingredient === ctx.missing);
  if (!line) return false;
  return (line.substitutes ?? []).some((s) => ctx.pantry.includes(s.ingredient)) || !!line.optional || DROPPABLE.includes(line.role);
}

/** The playbook answer (RES-02 fallback, and the only answer when mustUseRules). At most three steps. */
export function staticRescue(problem: Problem, ctx: RescueContext, cat: CatalogLookup, locale: RescueLocale): RescueResult {
  // The last fix in each list is the "serve it this way" fallback; keep it when there is room.
  const all = fixesFor(problem, ctx, cat);
  const picked = all.length > 3 ? [...all.slice(0, 2), all[all.length - 1]!] : all;
  const missing = ctx.missing ? cat.name(ctx.missing, locale) : "";
  const steps = picked.map((f) =>
    f.text[locale].replace("{item}", f.item ? cat.name(f.item, locale) : "").replace("{missing}", missing),
  );
  return {
    steps,
    safetyNote: safetyText(safetyFor(problem, ctx, cat), locale),
    uses: picked.flatMap((f) => (f.item ? [f.item] : [])),
    source: "rules",
  };
}

// --- model output ----------------------------------------------------------------------------------------------------

const UNSAFE = /\b(raw egg|half[- ]cooked|undercook|still pink|slightly pink|medium rare|skip (the )?(boil|soak)|no need to (boil|cook)|reuse (the )?oil|room temperature overnight|pour water on (the )?(oil|fire))\b/i;
export const MAX_STEPS = 3;
export const MAX_STEP_CHARS = 220;

/** Check a model's fix before it is shown. An empty list means it may be used. */
export function validateModelRescue(out: { steps: string[]; uses: string[] }, ctx: RescueContext): string[] {
  const problems: string[] = [];
  if (out.steps.length < 1 || out.steps.length > MAX_STEPS) problems.push(`expected 1 to ${MAX_STEPS} steps, got ${out.steps.length}`);
  for (const s of out.steps) {
    if (!s.trim()) problems.push("empty step");
    if (s.length > MAX_STEP_CHARS) problems.push(`step too long (${s.length} chars)`);
    if (UNSAFE.test(s)) problems.push(`unsafe instruction: "${s.slice(0, 60)}"`);
  }
  const allowed = new Set([...ctx.pantry, ...ctx.ingredients.map((i) => i.ingredient), "water"]);
  if (ctx.missing) allowed.delete(ctx.missing);
  for (const u of out.uses) if (!allowed.has(u)) problems.push(`uses "${u}", which is not in the kitchen`);
  return problems;
}
