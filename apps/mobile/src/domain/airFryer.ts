// Air fryer mode: a frying step done in the air fryer instead, for households that have one. Known dishes get their
// own tried instructions; any other frying step gets a general guide, marked as general. Batter needs to be thicker
// in an air fryer (runny batter drips through the basket), so that is always said. No React, no network.
import type { Locale } from "../i18n/locale";

type L = Record<Locale, string>;
export type AirFry = { tempC: number; minutes: number; preheat: number; lines: string[]; general: boolean };

type Plan = { tempC: number; minutes: number; preheat: number; lines: L[] };

const KNOWN: Record<string, Plan> = {
  "kadhi-pakora:5": {
    tempC: 190,
    minutes: 12,
    preheat: 3,
    lines: [
      { en: "Stir 2 more chammach besan into the pakora batter so it holds its shape.", hi: "पकौड़े के घोल में 2 चम्मच बेसन और मिलाएँ ताकि वह आकार में रहे।", hinglish: "Pakode ke ghol mein 2 chammach besan aur milayein taaki woh aakaar mein rahe." },
      { en: "Brush the basket with oil (or line it with greased baking paper) and drop small spoonfuls, a little apart.", hi: "बास्केट पर तेल लगाएँ (या चिकना बेकिंग पेपर बिछाएँ) और छोटे-छोटे चम्मच भर घोल थोड़ी दूरी पर रखें।", hinglish: "Basket par tel lagayein (ya chikna baking paper bichhayein) aur chhote-chhote chammach bhar ghol thodi doori par rakhein." },
      { en: "Brush about 1 chammach oil over the tops.", hi: "ऊपर से लगभग 1 चम्मच तेल लगाएँ।", hinglish: "Upar se lagbhag 1 chammach tel lagayein." },
      { en: "Turn them at 6 minutes. They're done when golden and firm.", hi: "6 मिनट पर पलटें। सुनहरे और सख़्त हों तो तैयार।", hinglish: "6 minute par palatein. Sunehre aur sakht hon to taiyaar." },
    ],
  },
  "kanda-poha:2": {
    tempC: 160,
    minutes: 7,
    preheat: 2,
    lines: [
      { en: "Toss the peanuts with ½ chammach oil and spread them in one layer.", hi: "मूँगफली में ½ चम्मच तेल मिलाकर एक परत में फैलाएँ।", hinglish: "Moongphali mein ½ chammach tel milakar ek parat mein phailayein." },
      { en: "Shake the basket at 3 minutes; watch the last minute, they burn quickly.", hi: "3 मिनट पर बास्केट हिलाएँ; आख़िरी मिनट ध्यान रखें, जल्दी जलती हैं।", hinglish: "3 minute par basket hilayein; aakhri minute dhyaan rakhein, jaldi jalti hain." },
      { en: "Meanwhile carry on with the next step on the stove.", hi: "इस बीच चूल्हे पर अगला स्टेप शुरू कर दें।", hinglish: "Is beech chulhe par agla step shuru kar dein." },
    ],
  },
  "jeera-aloo:4": {
    tempC: 200,
    minutes: 14,
    preheat: 3,
    lines: [
      { en: "Toss the boiled potato cubes with 1 chammach oil, the turmeric, chilli powder, coriander powder and salt.", hi: "उबले आलू के टुकड़ों में 1 चम्मच तेल, हल्दी, मिर्च, धनिया पाउडर और नमक मिलाएँ।", hinglish: "Ubale aloo ke tukdon mein 1 chammach tel, haldi, mirch, dhaniya powder aur namak milayein." },
      { en: "Air fry in one layer, shaking twice, until crisp at the edges.", hi: "एक परत में रखें, दो बार हिलाएँ, किनारे कुरकुरे होने तक।", hinglish: "Ek parat mein rakhein, do baar hilayein, kinare kurkure hone tak." },
      { en: "Tip them into the jeera tadka in the pan and toss for 1 minute.", hi: "फिर कड़ाही के जीरे के तड़के में डालकर 1 मिनट चलाएँ।", hinglish: "Phir kadhai ke jeere ke tadke mein daalkar 1 minute chalayein." },
    ],
  },
};

const GENERAL: Record<"deep_fry" | "shallow_fry", Plan> = {
  deep_fry: {
    tempC: 190,
    minutes: 12,
    preheat: 3,
    lines: [
      { en: "Batter must be thick enough to hold its shape; add a little besan or atta if it runs.", hi: "घोल इतना गाढ़ा हो कि आकार बना रहे; पतला हो तो थोड़ा बेसन या आटा मिलाएँ।", hinglish: "Ghol itna gaadha ho ki aakaar bana rahe; patla ho to thoda besan ya aata milayein." },
      { en: "Brush the basket and the tops with oil, keep pieces apart, and turn them halfway.", hi: "बास्केट और ऊपर तेल लगाएँ, टुकड़े दूर-दूर रखें, आधे समय पर पलटें।", hinglish: "Basket aur upar tel lagayein, tukde door-door rakhein, aadhe samay par palatein." },
    ],
  },
  shallow_fry: {
    tempC: 180,
    minutes: 10,
    preheat: 3,
    lines: [
      { en: "Brush or toss with a little oil and keep one layer.", hi: "थोड़ा तेल लगाकर एक परत में रखें।", hinglish: "Thoda tel lagakar ek parat mein rakhein." },
      { en: "Shake or turn halfway, and check a minute early.", hi: "आधे समय पर हिलाएँ या पलटें, और एक मिनट पहले देख लें।", hinglish: "Aadhe samay par hilayein ya palatein, aur ek minute pehle dekh lein." },
    ],
  },
};

/** The air-fryer way to do this step, or null when the step isn't frying. */
export function airFryFor(slug: string, stepNo: number, step: { technique?: string | null }, locale: Locale): AirFry | null {
  const known = KNOWN[`${slug}:${stepNo}`];
  const plan = known ?? (step.technique === "deep_fry" || step.technique === "shallow_fry" ? GENERAL[step.technique] : null);
  if (!plan) return null;
  return { tempC: plan.tempC, minutes: plan.minutes, preheat: plan.preheat, lines: plan.lines.map((l) => l[locale]), general: !known };
}
