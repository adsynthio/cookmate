// Chef's tip (D4): one short, useful tip per cook, the kind a good aunt would mention while you're at the stove.
// The most specific tip for the dish wins (an ingredient it uses beats a general one); among equals it changes with
// the day, so the same dish teaches something new next time. No React, no network.
import type { Locale } from "../i18n/locale";

type L = Record<Locale, string>;
type Tip = { id: string; ingredients?: string[]; tags?: string[]; text: L };

export const TIPS: Tip[] = [
  { id: "rajma-salt", ingredients: ["kidney beans"], text: {
    en: "Add salt to rajma only after it's soft; salt early keeps the skins tough.",
    hi: "राजमा में नमक नरम होने के बाद ही डालें; पहले डालने से छिलका सख़्त रहता है।",
    hinglish: "Rajma mein namak naram hone ke baad hi daalein; pehle daalne se chhilka sakht rehta hai." } },
  { id: "rajma-mash", ingredients: ["kidney beans"], text: {
    en: "Mash a spoonful of the beans against the pan: the gravy thickens on its own, no cream needed.",
    hi: "एक चम्मच राजमा कड़ाही में मसल दें: ग्रेवी अपने आप गाढ़ी हो जाती है।",
    hinglish: "Ek chammach rajma kadhai mein masal dein: gravy apne aap gaadhi ho jaati hai." } },
  { id: "paneer-soft", ingredients: ["paneer"], text: {
    en: "Soak paneer in warm salted water for ten minutes; it stays soft even after cooking.",
    hi: "पनीर को दस मिनट गुनगुने नमक वाले पानी में रखें; पकने के बाद भी नरम रहता है।",
    hinglish: "Paneer ko das minute gungune namak wale paani mein rakhein; pakne ke baad bhi naram rehta hai." } },
  { id: "paneer-last", ingredients: ["paneer"], text: {
    en: "Add paneer at the very end and simmer just two minutes; longer makes it rubbery.",
    hi: "पनीर सबसे आख़िर में डालें और बस दो मिनट पकाएँ; ज़्यादा पकाने से रबड़ जैसा हो जाता है।",
    hinglish: "Paneer sabse aakhir mein daalein aur bas do minute pakayein; zyada pakane se rubber jaisa ho jaata hai." } },
  { id: "dal-tadka-smoke", ingredients: ["toor dal"], text: {
    en: "Let the jeera crackle fully in hot ghee before the garlic goes in; that pop is where the aroma comes from.",
    hi: "लहसुन डालने से पहले जीरा गरम घी में पूरा चटकने दें; ख़ुशबू वहीं से आती है।",
    hinglish: "Lehsun daalne se pehle jeera garam ghee mein poora chatakne dein; khushboo wahin se aati hai." } },
  { id: "dal-froth", ingredients: ["toor dal"], text: {
    en: "Skim the white froth off boiling dal; it keeps the dal clean-tasting and the cooker from spluttering.",
    hi: "उबलती दाल से सफ़ेद झाग निकाल दें; स्वाद साफ़ रहता है और कुकर से पानी नहीं निकलता।",
    hinglish: "Ubalti dal se safed jhaag nikaal dein; swaad saaf rehta hai aur cooker se paani nahi nikalta." } },
  { id: "besan-roast", ingredients: ["gram flour"], text: {
    en: "Rest besan batter for ten minutes; it spreads thinner and cooks without raw taste.",
    hi: "बेसन का घोल दस मिनट रख दें; पतला फैलता है और कच्चा स्वाद नहीं रहता।",
    hinglish: "Besan ka ghol das minute rakh dein; patla failta hai aur kachcha swaad nahi rehta." } },
  { id: "kadhi-stir", ingredients: ["curd", "gram flour"], text: {
    en: "Keep stirring kadhi until it boils once; curd that isn't stirred splits.",
    hi: "कढ़ी एक उबाल आने तक चलाते रहें; बिना चलाए दही फट जाता है।",
    hinglish: "Kadhi ek ubaal aane tak chalate rahein; bina chalaye dahi fat jaata hai." } },
  { id: "poha-rinse", ingredients: ["poha"], text: {
    en: "Rinse poha, then let it sit five minutes before cooking; it softens evenly without going mushy.",
    hi: "पोहा धोकर पाँच मिनट रख दें; बिना गीला हुए बराबर नरम हो जाता है।",
    hinglish: "Poha dhokar paanch minute rakh dein; bina geela hue barabar naram ho jaata hai." } },
  { id: "aloo-dry", ingredients: ["potato"], text: {
    en: "Pat boiled potatoes dry before they go in the pan; dry potatoes crisp, wet ones steam.",
    hi: "उबले आलू कड़ाही में डालने से पहले सुखा लें; सूखे आलू कुरकुरे होते हैं।",
    hinglish: "Ubale aloo kadhai mein daalne se pehle sukha lein; sookhe aloo kurkure hote hain." } },
  { id: "onion-salt", ingredients: ["onion"], text: {
    en: "A pinch of salt on the onions helps them brown faster and more evenly.",
    hi: "प्याज़ पर चुटकी भर नमक डालें; जल्दी और बराबर सुनहरा होता है।",
    hinglish: "Pyaaz par chutki bhar namak daalein; jaldi aur barabar sunehra hota hai." } },
  { id: "masala-oil", ingredients: ["tomato"], text: {
    en: "The masala is ready when oil shines at the edges; rushing this step is why gravies taste raw.",
    hi: "जब किनारों पर तेल दिखने लगे तब मसाला तैयार है; यहीं जल्दी करने से ग्रेवी कच्ची लगती है।",
    hinglish: "Jab kinaron par tel dikhne lage tab masala taiyaar hai; yahin jaldi karne se gravy kachchi lagti hai." } },
  { id: "chicken-room", ingredients: ["chicken"], text: {
    en: "Take marinated chicken out of the fridge 15 minutes before cooking; it cooks more evenly.",
    hi: "मैरिनेट किया चिकन पकाने से 15 मिनट पहले फ़्रिज से निकाल लें; बराबर पकता है।",
    hinglish: "Marinate kiya chicken pakane se 15 minute pehle fridge se nikaal lein; barabar pakta hai." } },
  { id: "egg-low", ingredients: ["egg"], text: {
    en: "Cook bhurji on low heat and stop while it still looks slightly glossy; it keeps cooking on the plate.",
    hi: "भुर्जी धीमी आँच पर बनाएँ और हल्की चमक रहते बंद करें; प्लेट में भी पकती रहती है।",
    hinglish: "Bhurji dheemi aanch par banayein aur halki chamak rehte band karein; plate mein bhi pakti rehti hai." } },
  { id: "rice-rest", ingredients: ["rice", "basmati rice"], text: {
    en: "Let cooked rice rest covered for five minutes before fluffing; the grains firm up and don't break.",
    hi: "पके चावल ढककर पाँच मिनट रखें, फिर चलाएँ; दाने टूटते नहीं।",
    hinglish: "Pake chawal dhakkar paanch minute rakhein, phir chalayein; daane toot-te nahi." } },
  { id: "peas-green", ingredients: ["green peas"], text: {
    en: "Add peas in the last five minutes and leave the lid off; they stay bright green.",
    hi: "मटर आख़िरी पाँच मिनट में डालें और ढक्कन न लगाएँ; हरे बने रहते हैं।",
    hinglish: "Matar aakhri paanch minute mein daalein aur dhakkan na lagayein; hare bane rehte hain." } },
  { id: "spinach-colour", ingredients: ["spinach"], text: {
    en: "Cook spinach briefly and add a squeeze of lemon only at the end to keep it green.",
    hi: "पालक थोड़ी देर ही पकाएँ और नींबू सिर्फ़ आख़िर में डालें; रंग हरा रहता है।",
    hinglish: "Palak thodi der hi pakayein aur nimbu sirf aakhir mein daalein; rang hara rehta hai." } },
  { id: "garam-end", ingredients: ["garam masala"], text: {
    en: "Garam masala goes in at the end; long cooking dulls its fragrance.",
    hi: "गरम मसाला आख़िर में डालें; ज़्यादा पकने से ख़ुशबू कम हो जाती है।",
    hinglish: "Garam masala aakhir mein daalein; zyada pakne se khushboo kam ho jaati hai." } },
  { id: "hing-oil", ingredients: ["asafoetida"], text: {
    en: "Hing needs only a few seconds in hot oil; add it just before the next ingredient so it doesn't burn.",
    hi: "हींग गरम तेल में बस कुछ सेकंड चाहिए; अगली चीज़ डालने से ठीक पहले डालें।",
    hinglish: "Hing garam tel mein bas kuch second chahiye; agli cheez daalne se theek pehle daalein." } },
  { id: "one-pot", tags: ["one_pot"], text: {
    en: "One-pot dishes thicken as they sit; keep a little hot water ready to loosen them before serving.",
    hi: "एक बर्तन वाले खाने रखे-रखे गाढ़े होते हैं; परोसने से पहले थोड़ा गरम पानी मिला लें।",
    hinglish: "Ek bartan wale khane rakhe-rakhe gaadhe hote hain; parosne se pehle thoda garam paani mila lein." } },
  { id: "taste-end", text: {
    en: "Taste once at the end, before the last tadka or garnish: that's the moment to fix salt and sour.",
    hi: "आख़िरी तड़के या सजावट से पहले एक बार चखें: नमक और खटास ठीक करने का यही समय है।",
    hinglish: "Aakhri tadke ya sajavat se pehle ek baar chakhein: namak aur khatas theek karne ka yahi samay hai." } },
];

/** Today's tip for a dish: ingredient matches first, then tag matches, then a general tip; rotates by day. */
export function tipFor(doc: { ingredients: { ingredient: string }[]; tags?: string[] }, day: number, locale: Locale): { id: string; text: string } {
  const uses = new Set(doc.ingredients.map((i) => i.ingredient));
  const tags = new Set(doc.tags ?? []);
  const byIngredient = TIPS.filter((t) => t.ingredients?.some((k) => uses.has(k)));
  const byTag = TIPS.filter((t) => !t.ingredients && t.tags?.some((k) => tags.has(k)));
  const general = TIPS.filter((t) => !t.ingredients && !t.tags);
  const pool = byIngredient.length ? byIngredient : byTag.length ? byTag : general;
  const tip = pool[((day % pool.length) + pool.length) % pool.length]!;
  return { id: tip.id, text: tip.text[locale] };
}
