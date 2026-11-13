// "Ask Cookmate anything", answered on the phone without a model: the preview (mock mode) and the offline fallback.
// It recognises the everyday questions (what can I make, what is going off, leftovers, do I have X) in English,
// Hinglish and Hindi, and answers from the kitchen. The live app asks the ask-cookmate function instead.

export type AskLocale = "en" | "hi" | "hinglish";
export type AskItem = { name: string; key: string | null; daysLeft: number | null; state: string; out: boolean };
export type AskRecipe = { slug: string; title: string; minutes: number; ingredients: { key: string; optional?: boolean }[]; spice?: number };
export type AskReply = { answer: string; recipes: { slug: string; title: string }[]; addToList: string[]; followUps: string[] };

const T = {
  makeWith: { en: "With {items}, {list} would work well.", hi: "{items} से {list} अच्छे बनेंगे।", hinglish: "{items} se {list} achhe banenge." },
  mild: { en: " All of them are mild.", hi: " सब हल्के तीखे हैं।", hinglish: " Sab halke teekhe hain." },
  mildOne: { en: " It's mild.", hi: " यह हल्का तीखा है।", hinglish: " Yeh halka teekha hai." },
  make: { en: "With what you have, {list} would work well.", hi: "आपके पास जो है, उससे {list} अच्छे बनेंगे।", hinglish: "Aapke paas jo hai, usse {list} achhe banenge." },
  makeNone: { en: "Nothing from my recipes fits what's in the kitchen right now. Try “Make something new” on Home.", hi: "अभी रसोई की चीज़ों से मेरी कोई रेसिपी पूरी नहीं बनती। Home पर “कुछ नया बनाएँ” आज़माकर देखें।", hinglish: "Abhi rasoi ki cheezon se meri koi recipe poori nahi banti. Home par “Kuch naya banayein” aazmaakar dekhein." },
  quickest: { en: "Nothing is quite that quick. The quickest you can make is {dish}, in about {n} minutes.", hi: "इतनी जल्दी कुछ नहीं बनेगा। सबसे जल्दी {dish} बनेगा, लगभग {n} मिनट में।", hinglish: "Itni jaldi kuch nahi banega. Sabse jaldi {dish} banega, lagbhag {n} minute mein." },
  within: { en: " (in {n} minutes or less)", hi: " ({n} मिनट या कम में)", hinglish: " ({n} minute ya kam mein)" },
  soon: { en: "Use these first: {list}.", hi: "ये पहले इस्तेमाल करें: {list}।", hinglish: "Ye pehle istemaal karein: {list}." },
  soonNone: { en: "Nothing is close to going off. Your kitchen looks fresh.", hi: "कुछ भी खराब होने के करीब नहीं है। रसोई ताज़ा है।", hinglish: "Kuch bhi kharab hone ke kareeb nahi hai. Rasoi taaza hai." },
  left: { en: "You have {list} ready. Heat it until steaming hot, only once, and that's dinner.", hi: "आपके पास {list} तैयार है। एक बार भाप निकलने तक गरम करें, खाना तैयार।", hinglish: "Aapke paas {list} taiyaar hai. Ek baar bhaap nikalne tak garam karein, khana taiyaar." },
  leftNone: { en: "There are no leftovers in your kitchen right now.", hi: "अभी रसोई में कोई बचा हुआ खाना नहीं है।", hinglish: "Abhi rasoi mein koi bacha hua khana nahi hai." },
  have: { en: "Yes, you have {item}.", hi: "हाँ, आपके पास {item} है।", hinglish: "Haan, aapke paas {item} hai." },
  haveNot: { en: "I don't see {item} in your kitchen. Want it on the list?", hi: "रसोई में {item} नहीं है। लिस्ट में जोड़ दें?", hinglish: "Rasoi mein {item} nahi hai. List mein jod dein?" },
  help: { en: "Ask me what to cook from your kitchen, what's going off, what to do with leftovers or what to buy.", hi: "Cookmate आपकी रसोई से क्या बनाएँ, क्या खराब होने वाला है, बचे खाने के सुझाव और क्या खरीदें, इसमें मदद करता है।", hinglish: "Cookmate aapki rasoi se kya banayein, kya kharab hone wala hai, bache khane ke sujhav aur kya khareedein, ismein madad karta hai." },
  fuMake: { en: "What can I make in 20 minutes?", hi: "20 मिनट में क्या बना सकते हैं?", hinglish: "20 minute mein kya bana sakte hain?" },
  fuSoon: { en: "What's going off soon?", hi: "क्या जल्दी खराब होने वाला है?", hinglish: "Kya jaldi kharab hone wala hai?" },
  fuLeft: { en: "Ideas for my leftovers", hi: "बचे खाने के लिए सुझाव", hinglish: "Bache khane ke liye sujhav" },
} as const;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const list = (xs: string[], locale: AskLocale) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${locale === "hi" ? "और" : locale === "hinglish" ? "aur" : "and"} ${xs.at(-1)}`);

/** "Not spicy", "mild", "kam teekha", "तीखा नहीं": the cook wants it gentle. */
export function wantsMild(q: string): boolean {
  return /mild|not (?:too )?spicy|no spice|less spicy|(?:doesn.?t|don.?t|do not|does not)(?: \w+){0,2} (?:like |eat )?spic|spicy (?:nahi|nahin|na)|teekha (?:nahi|nahin|na)|kam teekha|kam mirch|तीखा नहीं|कम तीखा|कम मिर्च/i.test(q);
}

export type Intent = { kind: "make"; minutes: number | null } | { kind: "soon" } | { kind: "leftovers" } | { kind: "have"; item: string } | { kind: "other" };

export function intentOf(q: string): Intent {
  const s = q.toLowerCase();
  if (/leftover|bach[ae]|बच[ाीे]/.test(s)) return { kind: "leftovers" };
  if (/going off|expir|use soon|use first|kharab|ख़राब|खराब|pehle/.test(s)) return { kind: "soon" };
  const have = s.match(/(?:do i have|have i got|is there)\s+(?:any\s+)?([a-z\s]+?)\??$/) ?? s.match(/^([a-z\s]+?)\s+(?:hai kya|hai\?|है क्या)/);
  if (have?.[1]) return { kind: "have", item: have[1].trim() };
  if (/make|cook|banau|banaun|bana sakt|kya bana|क्या बना|dinner|lunch|khana|खाना|recipe/.test(s)) {
    const m = s.match(/(\d{1,3})\s*(?:min|minute|मिनट)/);
    return { kind: "make", minutes: m ? Number(m[1]) : null };
  }
  return { kind: "other" };
}

/** Dishes whose non-optional ingredients the kitchen mostly has, best match first. */
function makeable(items: AskItem[], recipes: AskRecipe[], staples: ReadonlySet<string>, maxMinutes: number | null, want: { named?: string[]; mild?: boolean } = {}) {
  const have = new Set(items.filter((i) => i.key && !i.out).map((i) => i.key!));
  const named = want.named ?? [];
  // Named ingredients count as on hand: "what can I make with corn" is about cooking with corn.
  for (const k of named) have.add(k);
  return recipes
    .filter((r) => maxMinutes === null || r.minutes <= maxMinutes)
    .filter((r) => !want.mild || (r.spice ?? 0) <= 2)
    .map((r) => {
      const need = r.ingredients.filter((i) => !i.optional);
      const missing = need.filter((i) => !have.has(i.key) && !staples.has(i.key)).map((i) => i.key);
      const uses = named.filter((k) => r.ingredients.some((i) => i.key === k)).length;
      return { r, missing, uses, share: need.length ? 1 - missing.length / need.length : 0 };
    })
    // With named ingredients, a dish must use at least one of them; more of them ranks higher.
    .filter((x) => x.share >= 0.7 && (!named.length || x.uses > 0))
    .sort((a, b) => b.uses - a.uses || b.share - a.share || a.r.minutes - b.r.minutes);
}

export function localAnswer(a: {
  question: string;
  items: AskItem[];
  recipes: AskRecipe[];
  staples: ReadonlySet<string>;
  locale: AskLocale;
  nameOf: (key: string) => string;
  /** Ingredient keys the question names ("paneer and spinach"). */
  named?: string[];
}): AskReply {
  const { locale } = a;
  const L = (k: keyof typeof T) => T[k][locale];
  const named = a.named ?? [];
  const mild = wantsMild(a.question);
  const want = { named, mild };
  let intent = intentOf(a.question);
  // "Paneer and spinach, not spicy" is a what-can-I-make question even without the word "make".
  if (intent.kind === "other" && named.length) intent = { kind: "make", minutes: null };
  // Never offer the question that was just asked.
  const asked = a.question.trim().toLowerCase();
  const followUps = [L("fuMake"), L("fuSoon"), L("fuLeft")].filter((f) => f.toLowerCase() !== asked);

  if (intent.kind === "make") {
    const top = makeable(a.items, a.recipes, a.staples, intent.minutes, want).slice(0, 3);
    if (!top.length && intent.minutes !== null) {
      // Nothing that quick: say so, and offer the quickest dish the kitchen can make.
      const quick = makeable(a.items, a.recipes, a.staples, null, want).sort((x, y) => x.r.minutes - y.r.minutes)[0];
      if (quick) {
        return {
          answer: fill(L("quickest"), { dish: quick.r.title, n: quick.r.minutes }),
          recipes: [{ slug: quick.r.slug, title: quick.r.title }],
          addToList: [...new Set(quick.missing)].map(a.nameOf).slice(0, 6),
          followUps,
        };
      }
    }
    if (!top.length) return { answer: L("makeNone"), recipes: [], addToList: [], followUps };
    const titles = list(top.map((x) => x.r.title), locale);
    const answer =
      (named.length ? fill(L("makeWith"), { items: list(named.map(a.nameOf), locale), list: titles }) : fill(L("make"), { list: titles })) +
      (intent.minutes ? fill(L("within"), { n: intent.minutes }) : "") +
      (mild ? L(top.length > 1 ? "mild" : "mildOne") : "");
    return {
      answer,
      recipes: top.map((x) => ({ slug: x.r.slug, title: x.r.title })),
      addToList: [...new Set(top[0]!.missing)].map(a.nameOf).slice(0, 6),
      followUps: followUps.filter((f) => f !== L("fuMake")),
    };
  }
  if (intent.kind === "soon") {
    const soon = a.items.filter((i) => i.daysLeft !== null && i.daysLeft <= 2 && i.daysLeft >= 0).sort((x, y) => x.daysLeft! - y.daysLeft!);
    if (!soon.length) return { answer: L("soonNone"), recipes: [], addToList: [], followUps };
    const keys = new Set(soon.map((i) => i.key).filter(Boolean));
    const uses = a.recipes.filter((r) => r.ingredients.some((i) => keys.has(i.key))).slice(0, 3);
    return { answer: fill(L("soon"), { list: list(soon.slice(0, 5).map((i) => i.name), locale) }), recipes: uses.map((r) => ({ slug: r.slug, title: r.title })), addToList: [], followUps: followUps.filter((f) => f !== L("fuSoon")) };
  }
  if (intent.kind === "leftovers") {
    const left = a.items.filter((i) => i.state === "leftover" || i.state === "cooked").filter((i) => i.daysLeft === null || i.daysLeft >= 0);
    if (!left.length) return { answer: L("leftNone"), recipes: [], addToList: [], followUps };
    return { answer: fill(L("left"), { list: list(left.slice(0, 3).map((i) => i.name), locale) }), recipes: [], addToList: [], followUps: followUps.filter((f) => f !== L("fuLeft")) };
  }
  if (intent.kind === "have") {
    const q = intent.item.toLowerCase();
    const found = a.items.find((i) => !i.out && (i.name.toLowerCase().includes(q) || (i.key ?? "").includes(q)));
    return found
      ? { answer: fill(L("have"), { item: found.name }), recipes: [], addToList: [], followUps }
      : { answer: fill(L("haveNot"), { item: intent.item }), recipes: [], addToList: [intent.item], followUps };
  }
  return { answer: L("help"), recipes: [], addToList: [], followUps };
}
