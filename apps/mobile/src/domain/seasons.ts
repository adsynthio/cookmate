// U15: what's in season, month by month, across most of India (the plains: north, west and central markets). Seasonal
// produce is fresher, tastier and cheaper, and Indian home cooking follows it: gajar, matar and methi in winter, lauki
// and karela in summer, bhutta and arbi in the rains. Catalog names; a rough guide, not a rule.

const BY_MONTH: Record<number, string[]> = {
  1: ["carrot", "green peas", "cauliflower", "radish", "spinach", "fenugreek leaves", "mustard greens", "bathua", "orange", "guava", "sweet potato"],
  2: ["carrot", "green peas", "cauliflower", "cabbage", "spinach", "fenugreek leaves", "mustard greens", "radish", "beetroot", "orange"],
  3: ["green peas", "drumstick", "raw jackfruit", "cucumber", "bottle gourd", "spinach", "beetroot", "raw mango"],
  4: ["raw mango", "cucumber", "bottle gourd", "ridge gourd", "okra", "drumstick", "raw jackfruit", "watermelon", "mint leaves", "lemon"],
  5: ["mango", "raw mango", "watermelon", "cucumber", "okra", "bitter gourd", "ridge gourd", "pointed gourd", "lemon", "mint leaves"],
  6: ["mango", "jamun", "watermelon", "okra", "pointed gourd", "bitter gourd", "ivy gourd", "bottle gourd"],
  7: ["sweet corn", "jamun", "colocasia leaves", "pointed gourd", "ivy gourd", "bitter gourd", "bottle gourd", "pear"],
  8: ["sweet corn", "colocasia", "colocasia leaves", "pear", "bottle gourd", "ridge gourd", "pomegranate"],
  9: ["sweet corn", "colocasia", "pumpkin", "custard apple", "pear", "pomegranate", "cluster beans"],
  10: ["custard apple", "pomegranate", "pumpkin", "sweet potato", "cluster beans", "guava", "cauliflower"],
  11: ["cauliflower", "green peas", "carrot", "radish", "spinach", "fenugreek leaves", "guava", "orange", "sweet potato", "field beans", "green garlic"],
  12: ["carrot", "green peas", "cauliflower", "cabbage", "spinach", "fenugreek leaves", "mustard greens", "bathua", "radish", "orange", "field beans"],
};

/** In season in `month` (1 = January), most-loved first. */
export function inSeason(month: number): string[] {
  return BY_MONTH[month] ?? [];
}

/** The month (1-12) of a YYYY-MM-DD day. */
export function monthOf(day: string): number {
  return Number(day.slice(5, 7));
}
