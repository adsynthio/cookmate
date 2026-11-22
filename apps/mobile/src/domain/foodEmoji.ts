// U1: a fitting food emoji for any ingredient or dish, shown on a soft tint wherever no photo has been generated yet
// (most of the catalog). An empty grey circle read as "broken"; a 🥬 or 🫓 reads as the thing itself.
// Pure TypeScript with no imports; exact names first, then words in the name, then the category.

/** Exact catalog names. */
const BY_NAME: Record<string, string> = {
  potato: "🥔", "sweet potato": "🍠", colocasia: "🥔", "elephant foot yam": "🥔", "raw jackfruit": "🥔", "lotus stem": "🥔",
  onion: "🧅", "spring onion": "🧅", shallots: "🧅", garlic: "🧄", "green garlic": "🧄",
  ginger: "🫚", "ginger garlic paste": "🫚", "dry ginger powder": "🫚",
  tomato: "🍅", "tomato ketchup": "🍅",
  "green chilli": "🌶️", "bhavnagri chilli": "🌶️", "dry red chilli": "🌶️", "red chilli powder": "🌶️",
  "kashmiri chilli powder": "🌶️", "chilli flakes": "🌶️",
  capsicum: "🫑", carrot: "🥕", radish: "🥕", turnip: "🥕", beetroot: "🥕",
  cucumber: "🥒", zucchini: "🥒", "bottle gourd": "🥒", "ridge gourd": "🥒", "bitter gourd": "🥒", "snake gourd": "🥒",
  "ivy gourd": "🥒", "pointed gourd": "🥒", chayote: "🥒", "round gourd": "🍈", "ash gourd": "🍈", "raw papaya": "🍈",
  "sweet corn": "🌽", "baby corn": "🌽", "maize flour": "🌽", cornflour: "🌽",
  brinjal: "🍆", mushroom: "🍄", broccoli: "🥦", cauliflower: "🥦", cabbage: "🥬", lettuce: "🥬", kohlrabi: "🥬",
  "green peas": "🫛", "french beans": "🫛", "cluster beans": "🫛", "field beans": "🫛", drumstick: "🫛", okra: "🫛",
  pumpkin: "🎃", "pumpkin seeds": "🎃",
  coconut: "🥥", "desiccated coconut": "🥥", "coconut milk": "🥥", "coconut oil": "🥥",
  lemon: "🍋", banana: "🍌", "raw banana": "🍌", "banana flower": "🌸", apple: "🍎", pomegranate: "🍎", "custard apple": "🍏",
  guava: "🍏", mango: "🥭", "raw mango": "🥭", papaya: "🍈", grapes: "🍇", raisins: "🍇", watermelon: "🍉",
  "melon seeds": "🍉", orange: "🍊", pineapple: "🍍", pear: "🍐", jamun: "🫐", sapota: "🥝", dates: "🌴", "dried figs": "🌰",
  spinach: "🥬", "mustard greens": "🥬", bathua: "🥬", "amaranth leaves": "🥬", "drumstick leaves": "🥬",
  "colocasia leaves": "🥬", gongura: "🥬", "fenugreek leaves": "🌿", "dried fenugreek leaves": "🌿",
  "coriander leaves": "🌿", "mint leaves": "🌿", "dill leaves": "🌿", lemongrass: "🌿", "curry leaves": "🍃", "bay leaf": "🍃",
  milk: "🥛", buttermilk: "🥛", "fresh cream": "🥛", "condensed milk": "🥛", "milk powder": "🥛", curd: "🥣",
  paneer: "🧀", cheese: "🧀", khoya: "🧀", tofu: "🧀",
  ghee: "🧈", butter: "🧈", vanaspati: "🧈",
  egg: "🥚", chicken: "🍗", mutton: "🍖", "minced mutton": "🍖", pork: "🥓",
  fish: "🐟", "dried fish": "🐟", prawns: "🦐", crab: "🦀",
  rice: "🍚", "basmati rice": "🍚", "brown rice": "🍚", "idli rava": "🍚", poha: "🍚", "puffed rice": "🍚", sabudana: "🍚",
  "rice flour": "🍚", "idli dosa batter": "🥣",
  bread: "🍞", pav: "🍞", rusk: "🍞", biscuits: "🍪", vermicelli: "🍜", noodles: "🍜", pasta: "🍝", "rolled oats": "🥣",
  "moong sprouts": "🌱", peanuts: "🥜", "peanut butter": "🥜", cashews: "🥜", almonds: "🥜", pistachios: "🥜",
  walnuts: "🌰", "fox nuts": "🥜", "sunflower seeds": "🌻",
  salt: "🧂", "black salt": "🧂", "rock salt": "🧂",
  saffron: "🌸", cinnamon: "🪵", "star anise": "⭐", "rose water": "🌹", "kewra water": "💧",
  "olive oil": "🫒", sugar: "🍬", jaggery: "🍯", honey: "🍯",
  "tea leaves": "🍵", "coffee powder": "☕", chocolate: "🍫", "cocoa powder": "🍫", jam: "🍓",
  papad: "🫓", bhujia: "🥨", pickle: "🫙",
};

/** Words in a name, checked in order (homemade things the catalog doesn't know: "hari chutney", "kal ki dal"). */
const BY_WORD: [RegExp, string][] = [
  [/chutney|raita|batter/, "🥣"],
  [/achar|pickle/, "🫙"],
  [/\b(dal|daal|sambar|rasam|kadhi|curry|sabzi|sabji|bhaji)\b/, "🍲"],
  [/\b(roti|chapati|paratha|puri|poori|bhatura|kulcha|thepla|naan)\b/, "🫓"],
  [/\b(rice|chawal|pulao|khichdi)\b/, "🍚"],
  [/\b(oil|tel)\b/, "🫗"],
  [/\b(masala|powder|seeds?)\b/, "🫙"],
  [/\b(flour|atta|besan)\b/, "🌾"],
  [/\b(leaves|saag|patta|patte)\b/, "🥬"],
];

/** By catalog category, last. */
const BY_CATEGORY: Record<string, string> = {
  vegetable: "🥬", herb: "🌿", fruit: "🧺", dairy: "🥛", egg: "🥚", meat: "🍖", seafood: "🐟",
  grain: "🌾", flour: "🌾", pulse: "🫘", spice: "🫙", condiment: "🫙", oil_fat: "🫗", sweetener: "🍯",
  nut_seed: "🥜", beverage: "🍵", packaged: "🛍️", homemade: "🥣", leftover: "🍲", other: "🫙",
};

/** The emoji for an ingredient (catalog name or what the cook typed), falling back to its category. */
export function ingredientEmoji(name: string | null | undefined, category?: string | null): string {
  const n = (name ?? "").trim().toLowerCase();
  if (n && BY_NAME[n]) return BY_NAME[n];
  for (const [re, e] of BY_WORD) if (n && re.test(n)) return e;
  return BY_CATEGORY[category ?? ""] ?? "🍽️";
}

/** Dish words, checked in order: the most telling word wins ("egg bhurji" before "bhurji", "chicken curry" before "curry"). */
const DISH_WORDS: [RegExp, string][] = [
  [/\b(egg|anda|omelet|omelette|bhurji)\b/, "🍳"],
  [/\b(chicken|murgh)\b/, "🍗"],
  [/\b(mutton|gosht|keema|lamb)\b/, "🍖"],
  [/\b(fish|machhli|meen)\b/, "🐟"],
  [/\b(prawn|prawns|jhinga)\b/, "🦐"],
  [/\b(biryani)\b/, "🍛"],
  [/\b(roti|phulka|chapati|paratha|puri|poori|bhatura|kulcha|thepla|naan|chilla|cheela|thalipeeth)\b/, "🫓"],
  [/\b(dosa|uttapam|appam|pancake)\b/, "🥞"],
  [/\b(idli|dhokla)\b/, "🍥"],
  [/\b(pakora|pakode|pakoda|bajji|bhaji|vada|samosa|kachori|tikki|cutlet|bonda)\b/, "🧆"],
  [/\b(noodles|maggi|chowmein|hakka)\b/, "🍜"],
  [/\b(pasta|macaroni|spaghetti)\b/, "🍝"],
  [/\b(sandwich|toast)\b/, "🥪"],
  [/\b(salad|kachumber)\b/, "🥗"],
  [/\b(soup|shorba)\b/, "🍲"],
  [/\b(laddu|ladoo|barfi|burfi|peda|jalebi|gulab jamun|mithai|chikki|mysore pak)\b/, "🍬"],
  [/\b(kheer|halwa|payasam|phirni|custard|pudding|rabri)\b/, "🍮"],
  [/\b(chai|tea)\b/, "🍵"],
  [/\b(lassi|chaas|shake|sharbat|smoothie)\b/, "🥤"],
  [/\b(chutney|raita)\b/, "🥣"],
  [/\b(achar|pickle)\b/, "🫙"],
  [/\b(rice|pulao|khichdi|poha|upma|jeera rice|lemon rice|curd rice)\b/, "🍚"],
  [/\b(dal|daal|sambar|rasam|kadhi)\b/, "🍲"],
  [/\b(chana|chole|rajma|lobia)\b/, "🫘"],
  [/\b(paneer)\b/, "🧀"],
  [/\b(masala|curry|sabzi|sabji|aloo|gobi|bhindi|baingan|korma|kofta)\b/, "🥘"],
];

const BY_COURSE: Record<string, string> = {
  breakfast: "🍳", main: "🍛", side: "🥘", snack: "🧆", dessert: "🍮", sweet: "🍮", drink: "🥤", chutney_pickle: "🫙",
};

/** The emoji for a dish, from its name or slug ("kanda-poha"), then its course. */
export function dishEmoji(nameOrSlug: string | null | undefined, course?: string | null): string {
  const n = (nameOrSlug ?? "").toLowerCase().replace(/[-_]+/g, " ");
  for (const [re, e] of DISH_WORDS) if (re.test(n)) return e;
  return BY_COURSE[course ?? ""] ?? "🍛";
}

/** Which soft wash sits behind the emoji: greens and veg, fruit and sweets, dairy and grains, meat and fish, spices. */
export type FoodTint = "green" | "peach" | "cream" | "rose" | "spice";

export function foodTint(category?: string | null): FoodTint {
  switch (category) {
    case "vegetable":
    case "herb":
      return "green";
    case "fruit":
    case "sweetener":
    case "homemade":
    case "leftover":
      return "peach";
    case "meat":
    case "seafood":
    case "egg":
      return "rose";
    case "spice":
    case "condiment":
    case "oil_fat":
    case "nut_seed":
      return "spice";
    default:
      return "cream";
  }
}
