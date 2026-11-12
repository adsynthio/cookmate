// Drinks (off by default; turned on in setup or on You). Everyday Indian drinks and mocktails for everyone; cocktails
// only after the cook confirms they are of legal drinking age. Ingredients use catalog names where there is one, so
// the kitchen match works; spirits, soda and ice are named here. Text is in English, Hindi and Hinglish.

export type DrinkLocale = "en" | "hi" | "hinglish";
export type L = Record<DrinkLocale, string>;
export type DrinkIngredient = { key: string | null; name?: L; amount: L; optional?: boolean };
export type Drink = {
  id: string;
  alcoholic: boolean;
  kind: "cooler" | "dairy" | "hot" | "cocktail";
  minutes: number;
  serves: number;
  /** Card colours, top to bottom. */
  colors: [string, string];
  title: L;
  about: L;
  ingredients: DrinkIngredient[];
  steps: L[];
};

const l = (en: string, hi: string, hinglish: string): L => ({ en, hi, hinglish });
const ICE = l("Ice", "बर्फ़", "Barf");
const SODA = l("Soda water", "सोडा", "Soda");
const WATER = l("Cold water", "ठंडा पानी", "Thanda paani");

export const DRINKS: Drink[] = [
  {
    id: "nimbu-pani",
    alcoholic: false,
    kind: "cooler",
    minutes: 5,
    serves: 1,
    colors: ["#E9F0C9", "#B9CB6E"],
    title: l("Masala nimbu pani", "मसाला नींबू पानी", "Masala nimbu pani"),
    about: l("Lemon, a little sugar and a pinch of kala namak. The summer classic.", "नींबू, थोड़ी चीनी और चुटकी भर काला नमक। गर्मी का पक्का साथी।", "Nimbu, thodi cheeni aur chutki bhar kala namak. Garmi ka pakka saathi."),
    ingredients: [
      { key: "lemon", amount: l("1", "1", "1") },
      { key: "sugar", amount: l("2 tsp", "2 छोटे चम्मच", "2 chhote chammach") },
      { key: "black salt", amount: l("a pinch", "चुटकी भर", "chutki bhar") },
      { key: "roasted cumin powder", amount: l("½ tsp", "आधा छोटा चम्मच", "aadha chhota chammach") },
      { key: "mint leaves", amount: l("a few", "कुछ पत्ते", "kuch patte"), optional: true },
      { key: null, name: WATER, amount: l("1 glass", "1 गिलास", "1 gilaas") },
      { key: null, name: ICE, amount: l("a few cubes", "कुछ टुकड़े", "kuch tukde"), optional: true },
    ],
    steps: [
      l("Squeeze the lemon into a glass and stir in the sugar until it dissolves.", "गिलास में नींबू निचोड़ें और चीनी घुलने तक मिलाएँ।", "Gilaas mein nimbu nichodein aur cheeni ghulne tak milayein."),
      l("Add kala namak, jeera powder and cold water. Stir and taste.", "काला नमक, जीरा पाउडर और ठंडा पानी डालें। मिलाकर चखें।", "Kala namak, jeera powder aur thanda paani daalein. Milakar chakhein."),
      l("Top with ice and torn mint leaves.", "ऊपर से बर्फ़ और पुदीने के पत्ते डालें।", "Upar se barf aur pudine ke patte daalein."),
    ],
  },
  {
    id: "aam-panna",
    alcoholic: false,
    kind: "cooler",
    minutes: 25,
    serves: 4,
    colors: ["#F4E7A6", "#D8B53A"],
    title: l("Aam panna", "आम पन्ना", "Aam panna"),
    about: l("Tangy raw-mango cooler with roasted jeera. Cools you down on hot days.", "भुने जीरे वाला खट्टा-मीठा कच्चे आम का शरबत। गर्मी में ठंडक देता है।", "Bhune jeere wala khatta-meetha kachche aam ka sharbat. Garmi mein thandak deta hai."),
    ingredients: [
      { key: "raw mango", amount: l("2", "2", "2") },
      { key: "jaggery", amount: l("4 tbsp", "4 बड़े चम्मच", "4 bade chammach") },
      { key: "roasted cumin powder", amount: l("1 tsp", "1 छोटा चम्मच", "1 chhota chammach") },
      { key: "black salt", amount: l("1 tsp", "1 छोटा चम्मच", "1 chhota chammach") },
      { key: "mint leaves", amount: l("a handful", "एक मुट्ठी", "ek mutthi"), optional: true },
      { key: null, name: WATER, amount: l("4 glasses", "4 गिलास", "4 gilaas") },
    ],
    steps: [
      l("Pressure cook the raw mangoes for 2 whistles, or boil until soft. Let them cool.", "कच्चे आम को 2 सीटी तक कुकर में या नरम होने तक उबालें। ठंडा होने दें।", "Kachche aam ko 2 seeti tak cooker mein ya naram hone tak ubaalein. Thanda hone dein."),
      l("Peel and squeeze out the pulp. Blend it with the jaggery and mint.", "छिलका उतारकर गूदा निकालें। गुड़ और पुदीने के साथ पीस लें।", "Chhilka utaarkar gooda nikaalein. Gud aur pudine ke saath pees lein."),
      l("Stir in jeera, kala namak and cold water. Serve chilled.", "जीरा, काला नमक और ठंडा पानी मिलाएँ। ठंडा परोसें।", "Jeera, kala namak aur thanda paani milayein. Thanda parosein."),
    ],
  },
  {
    id: "jaljeera",
    alcoholic: false,
    kind: "cooler",
    minutes: 10,
    serves: 2,
    colors: ["#D9E8C8", "#7FA35A"],
    title: l("Jaljeera", "जलजीरा", "Jaljeera"),
    about: l("Spiced, minty and tangy. Good before or after a heavy meal.", "मसालेदार, पुदीने वाला और खट्टा। भारी खाने से पहले या बाद में अच्छा।", "Masaledar, pudine wala aur khatta. Bhaari khane se pehle ya baad mein achha."),
    ingredients: [
      { key: "mint leaves", amount: l("a handful", "एक मुट्ठी", "ek mutthi") },
      { key: "roasted cumin powder", amount: l("1½ tsp", "डेढ़ छोटा चम्मच", "dedh chhota chammach") },
      { key: "black salt", amount: l("1 tsp", "1 छोटा चम्मच", "1 chhota chammach") },
      { key: "tamarind", amount: l("a small piece", "छोटा टुकड़ा", "chhota tukda") },
      { key: "lemon", amount: l("1", "1", "1") },
      { key: "ginger", amount: l("½ inch", "आधा इंच", "aadha inch"), optional: true },
      { key: null, name: WATER, amount: l("2 glasses", "2 गिलास", "2 gilaas") },
    ],
    steps: [
      l("Soak the tamarind in a little warm water for 10 minutes and squeeze out the pulp.", "इमली को थोड़े गुनगुने पानी में 10 मिनट भिगोकर गूदा निकाल लें।", "Imli ko thode gungune paani mein 10 minute bhigokar gooda nikaal lein."),
      l("Grind mint, ginger and a spoon of water to a paste.", "पुदीना, अदरक और एक चम्मच पानी पीसकर पेस्ट बनाएँ।", "Pudina, adrak aur ek chammach paani peeskar paste banayein."),
      l("Mix everything with lemon juice, jeera, kala namak and cold water. Strain if you like.", "सबको नींबू के रस, जीरे, काले नमक और ठंडे पानी में मिलाएँ। चाहें तो छान लें।", "Sabko nimbu ke ras, jeere, kale namak aur thande paani mein milayein. Chahein to chhaan lein."),
    ],
  },
  {
    id: "sweet-lassi",
    alcoholic: false,
    kind: "dairy",
    minutes: 5,
    serves: 2,
    colors: ["#FBF3E4", "#EBCFA0"],
    title: l("Sweet lassi", "मीठी लस्सी", "Meethi lassi"),
    about: l("Thick, cold and lightly sweet, with a hint of elaichi.", "गाढ़ी, ठंडी और हल्की मीठी, इलायची की खुशबू के साथ।", "Gaadhi, thandi aur halki meethi, elaichi ki khushboo ke saath."),
    ingredients: [
      { key: "curd", amount: l("2 cups", "2 कप", "2 cup") },
      { key: "sugar", amount: l("3 tbsp", "3 बड़े चम्मच", "3 bade chammach") },
      { key: "green cardamom", amount: l("2, crushed", "2, कुटी हुई", "2, kuti hui") },
      { key: "milk", amount: l("½ cup", "आधा कप", "aadha cup") },
      { key: "saffron", amount: l("a few strands", "कुछ धागे", "kuch dhaage"), optional: true },
      { key: null, name: ICE, amount: l("a few cubes", "कुछ टुकड़े", "kuch tukde") },
    ],
    steps: [
      l("Whisk or blend the curd, sugar, elaichi and milk until smooth and frothy.", "दही, चीनी, इलायची और दूध को चिकना और झागदार होने तक फेंटें या पीसें।", "Dahi, cheeni, elaichi aur doodh ko chikna aur jhaagdaar hone tak phentein ya peesein."),
      l("Pour over ice and top with saffron.", "बर्फ़ पर डालें और ऊपर से केसर डालें।", "Barf par daalein aur upar se kesar daalein."),
    ],
  },
  {
    id: "masala-chaas",
    alcoholic: false,
    kind: "dairy",
    minutes: 5,
    serves: 2,
    colors: ["#EEF3E8", "#B7C9A6"],
    title: l("Masala chaas", "मसाला छाछ", "Masala chaas"),
    about: l("Light, salty buttermilk with jeera and ginger. Helps digestion after lunch.", "जीरे और अदरक वाली हल्की, नमकीन छाछ। दोपहर के खाने के बाद पचाने में मदद।", "Jeere aur adrak wali halki, namkeen chaas. Dopahar ke khane ke baad pachane mein madad."),
    ingredients: [
      { key: "curd", amount: l("1 cup", "1 कप", "1 cup") },
      { key: "roasted cumin powder", amount: l("½ tsp", "आधा छोटा चम्मच", "aadha chhota chammach") },
      { key: "black salt", amount: l("½ tsp", "आधा छोटा चम्मच", "aadha chhota chammach") },
      { key: "ginger", amount: l("½ inch, grated", "आधा इंच, कद्दूकस", "aadha inch, kaddukas") },
      { key: "coriander leaves", amount: l("a little", "थोड़ा", "thoda"), optional: true },
      { key: null, name: WATER, amount: l("2 cups", "2 कप", "2 cup") },
    ],
    steps: [
      l("Whisk the curd with cold water until there are no lumps.", "दही को ठंडे पानी के साथ गाँठें खत्म होने तक फेंटें।", "Dahi ko thande paani ke saath gaanthein khatam hone tak phentein."),
      l("Stir in jeera, kala namak, ginger and chopped coriander. Serve cold.", "जीरा, काला नमक, अदरक और कटा धनिया मिलाएँ। ठंडा परोसें।", "Jeera, kala namak, adrak aur kata dhaniya milayein. Thanda parosein."),
    ],
  },
  {
    id: "cold-coffee",
    alcoholic: false,
    kind: "dairy",
    minutes: 5,
    serves: 1,
    colors: ["#EADBC8", "#9C7151"],
    title: l("Cold coffee", "कोल्ड कॉफ़ी", "Cold coffee"),
    about: l("Frothy, café-style cold coffee made in the mixer.", "मिक्सर में बनी झागदार, कैफ़े जैसी कोल्ड कॉफ़ी।", "Mixer mein bani jhaagdaar, cafe jaisi cold coffee."),
    ingredients: [
      { key: "milk", amount: l("1 cup, chilled", "1 कप, ठंडा", "1 cup, thanda") },
      { key: "coffee powder", amount: l("1½ tsp", "डेढ़ छोटा चम्मच", "dedh chhota chammach") },
      { key: "sugar", amount: l("2 tsp", "2 छोटे चम्मच", "2 chhote chammach") },
      { key: null, name: ICE, amount: l("4–5 cubes", "4–5 टुकड़े", "4–5 tukde") },
    ],
    steps: [
      l("Dissolve the coffee and sugar in 2 spoons of hot water.", "कॉफ़ी और चीनी को 2 चम्मच गरम पानी में घोलें।", "Coffee aur cheeni ko 2 chammach garam paani mein gholein."),
      l("Blend with the cold milk and ice for 30 seconds until frothy. Pour and drink at once.", "ठंडे दूध और बर्फ़ के साथ 30 सेकंड झाग आने तक चलाएँ। तुरंत पिएँ।", "Thande doodh aur barf ke saath 30 second jhaag aane tak chalayein. Turant piyein."),
    ],
  },
  {
    id: "masala-chai",
    alcoholic: false,
    kind: "hot",
    minutes: 8,
    serves: 2,
    colors: ["#F2E1CC", "#B7794A"],
    title: l("Adrak elaichi chai", "अदरक इलायची चाय", "Adrak elaichi chai"),
    about: l("Strong ghar ki chai with crushed ginger and elaichi.", "कुटे अदरक और इलायची वाली कड़क घर की चाय।", "Kute adrak aur elaichi wali kadak ghar ki chai."),
    ingredients: [
      { key: "milk", amount: l("1 cup", "1 कप", "1 cup") },
      { key: "tea leaves", amount: l("2 tsp", "2 छोटे चम्मच", "2 chhote chammach") },
      { key: "sugar", amount: l("2–3 tsp", "2–3 छोटे चम्मच", "2–3 chhote chammach") },
      { key: "ginger", amount: l("1 inch, crushed", "1 इंच, कुटा हुआ", "1 inch, kuta hua") },
      { key: "green cardamom", amount: l("2, crushed", "2, कुटी हुई", "2, kuti hui") },
      { key: null, name: l("Water", "पानी", "Paani"), amount: l("1 cup", "1 कप", "1 cup") },
    ],
    steps: [
      l("Boil the water with ginger and elaichi for 2 minutes.", "पानी को अदरक और इलायची के साथ 2 मिनट उबालें।", "Paani ko adrak aur elaichi ke saath 2 minute ubaalein."),
      l("Add tea leaves and sugar and boil for a minute until dark.", "चायपत्ती और चीनी डालकर गहरा रंग आने तक एक मिनट उबालें।", "Chaipatti aur cheeni daalkar gehra rang aane tak ek minute ubaalein."),
      l("Pour in the milk and let it rise twice on medium heat. Strain and serve hot.", "दूध डालें और मध्यम आँच पर दो बार उफान आने दें। छानकर गरम परोसें।", "Doodh daalein aur madhyam aanch par do baar ubaal aane dein. Chhaankar garam parosein."),
    ],
  },
  {
    id: "virgin-mojito",
    alcoholic: false,
    kind: "cooler",
    minutes: 5,
    serves: 1,
    colors: ["#E2F3E6", "#6DBB86"],
    title: l("Virgin mojito", "वर्जिन मोजिटो", "Virgin mojito"),
    about: l("Fizzy lime and mint, no alcohol.", "नींबू और पुदीने वाला सोडा, बिना शराब के।", "Nimbu aur pudine wala soda, bina sharaab ke."),
    ingredients: [
      { key: "lemon", amount: l("½, cut in wedges", "आधा, टुकड़ों में", "aadha, tukdon mein") },
      { key: "mint leaves", amount: l("10 leaves", "10 पत्ते", "10 patte") },
      { key: "sugar", amount: l("2 tsp", "2 छोटे चम्मच", "2 chhote chammach") },
      { key: null, name: SODA, amount: l("1 glass", "1 गिलास", "1 gilaas") },
      { key: null, name: ICE, amount: l("crushed, a handful", "कुटी हुई, एक मुट्ठी", "kuti hui, ek mutthi") },
    ],
    steps: [
      l("Gently crush the lemon wedges, mint and sugar in the glass. Don't shred the mint.", "गिलास में नींबू के टुकड़े, पुदीना और चीनी हल्के से कुचलें। पुदीना ज़्यादा न कूटें।", "Gilaas mein nimbu ke tukde, pudina aur cheeni halke se kuchlein. Pudina zyada na kootein."),
      l("Fill with crushed ice, top with soda and stir once.", "कुटी बर्फ़ भरें, ऊपर से सोडा डालें और एक बार मिलाएँ।", "Kuti barf bharein, upar se soda daalein aur ek baar milayein."),
    ],
  },
  {
    id: "mojito",
    alcoholic: true,
    kind: "cocktail",
    minutes: 5,
    serves: 1,
    colors: ["#DDF1E3", "#3E9B6A"],
    title: l("Mojito", "मोजिटो", "Mojito"),
    about: l("White rum, lime, mint and soda.", "व्हाइट रम, नींबू, पुदीना और सोडा।", "White rum, nimbu, pudina aur soda."),
    ingredients: [
      { key: null, name: l("White rum", "व्हाइट रम", "White rum"), amount: l("60 ml", "60 मि.ली.", "60 ml") },
      { key: "lemon", amount: l("½, cut in wedges", "आधा, टुकड़ों में", "aadha, tukdon mein") },
      { key: "mint leaves", amount: l("10 leaves", "10 पत्ते", "10 patte") },
      { key: "sugar", amount: l("2 tsp", "2 छोटे चम्मच", "2 chhote chammach") },
      { key: null, name: SODA, amount: l("to top", "ऊपर तक", "upar tak") },
      { key: null, name: ICE, amount: l("crushed", "कुटी हुई", "kuti hui") },
    ],
    steps: [
      l("Gently crush the lemon, mint and sugar in a tall glass.", "लंबे गिलास में नींबू, पुदीना और चीनी हल्के से कुचलें।", "Lambe gilaas mein nimbu, pudina aur cheeni halke se kuchlein."),
      l("Add the rum and fill with crushed ice.", "रम डालें और कुटी बर्फ़ भरें।", "Rum daalein aur kuti barf bharein."),
      l("Top with soda and stir from the bottom once.", "ऊपर से सोडा डालें और नीचे से एक बार मिलाएँ।", "Upar se soda daalein aur neeche se ek baar milayein."),
    ],
  },
  {
    id: "cucumber-gin-tonic",
    alcoholic: true,
    kind: "cocktail",
    minutes: 3,
    serves: 1,
    colors: ["#E8F4EE", "#8FC3A6"],
    title: l("Cucumber gin and tonic", "खीरा जिन-टॉनिक", "Kheera gin-tonic"),
    about: l("Crisp and cool, with cucumber and a squeeze of lime.", "खीरे और नींबू के साथ ताज़ा और ठंडा।", "Kheere aur nimbu ke saath taaza aur thanda."),
    ingredients: [
      { key: null, name: l("Gin", "जिन", "Gin"), amount: l("60 ml", "60 मि.ली.", "60 ml") },
      { key: null, name: l("Tonic water", "टॉनिक वॉटर", "Tonic water"), amount: l("150 ml", "150 मि.ली.", "150 ml") },
      { key: "cucumber", amount: l("4 thin slices", "4 पतले स्लाइस", "4 patle slice") },
      { key: "lemon", amount: l("a wedge", "एक टुकड़ा", "ek tukda") },
      { key: null, name: ICE, amount: l("lots", "भरपूर", "bharpoor") },
    ],
    steps: [
      l("Fill a glass with ice and cucumber slices.", "गिलास में बर्फ़ और खीरे के स्लाइस भरें।", "Gilaas mein barf aur kheere ke slice bharein."),
      l("Pour in the gin, then the tonic slowly down the side.", "जिन डालें, फिर टॉनिक धीरे-धीरे किनारे से डालें।", "Gin daalein, phir tonic dheere-dheere kinaare se daalein."),
      l("Squeeze the lime over and stir once.", "ऊपर से नींबू निचोड़ें और एक बार मिलाएँ।", "Upar se nimbu nichodein aur ek baar milayein."),
    ],
  },
  {
    id: "jaggery-whisky-sour",
    alcoholic: true,
    kind: "cocktail",
    minutes: 5,
    serves: 1,
    colors: ["#F6E3C4", "#C98C3E"],
    title: l("Gud whisky sour", "गुड़ व्हिस्की सावर", "Gud whisky sour"),
    about: l("Whisky, lemon and a jaggery syrup instead of sugar.", "व्हिस्की, नींबू और चीनी की जगह गुड़ का शरबत।", "Whisky, nimbu aur cheeni ki jagah gud ka sharbat."),
    ingredients: [
      { key: null, name: l("Whisky", "व्हिस्की", "Whisky"), amount: l("60 ml", "60 मि.ली.", "60 ml") },
      { key: "lemon", amount: l("1, juiced", "1, रस निकाला हुआ", "1, ras nikaala hua") },
      { key: "jaggery", amount: l("1 tbsp, melted in 1 tbsp hot water", "1 बड़ा चम्मच, 1 बड़े चम्मच गरम पानी में घोला", "1 bada chammach, 1 bade chammach garam paani mein ghola") },
      { key: null, name: ICE, amount: l("a few cubes", "कुछ टुकड़े", "kuch tukde") },
    ],
    steps: [
      l("Melt the jaggery in hot water and let it cool.", "गुड़ को गरम पानी में घोलकर ठंडा होने दें।", "Gud ko garam paani mein gholkar thanda hone dein."),
      l("Shake whisky, lemon juice and the jaggery syrup with ice in a closed jar for 15 seconds.", "व्हिस्की, नींबू का रस और गुड़ का शरबत बर्फ़ के साथ बंद डिब्बे में 15 सेकंड हिलाएँ।", "Whisky, nimbu ka ras aur gud ka sharbat barf ke saath band dibbe mein 15 second hilayein."),
      l("Strain into a glass over fresh ice.", "ताज़ी बर्फ़ वाले गिलास में छानकर डालें।", "Taazi barf wale gilaas mein chhaankar daalein."),
    ],
  },
  {
    id: "rum-cola-lime",
    alcoholic: true,
    kind: "cocktail",
    minutes: 2,
    serves: 1,
    colors: ["#EBDDD3", "#7A4B32"],
    title: l("Rum, cola and lime", "रम, कोला और नींबू", "Rum, cola aur nimbu"),
    about: l("Dark rum and cola with a big squeeze of lime.", "डार्क रम और कोला, भरपूर नींबू के साथ।", "Dark rum aur cola, bharpoor nimbu ke saath."),
    ingredients: [
      { key: null, name: l("Dark rum", "डार्क रम", "Dark rum"), amount: l("60 ml", "60 मि.ली.", "60 ml") },
      { key: null, name: l("Cola", "कोला", "Cola"), amount: l("150 ml", "150 मि.ली.", "150 ml") },
      { key: "lemon", amount: l("½", "आधा", "aadha") },
      { key: null, name: ICE, amount: l("lots", "भरपूर", "bharpoor") },
    ],
    steps: [
      l("Fill a glass with ice and pour in the rum.", "गिलास में बर्फ़ भरें और रम डालें।", "Gilaas mein barf bharein aur rum daalein."),
      l("Squeeze in the lime, drop the shell in, and top with cola.", "नींबू निचोड़ें, छिलका भी डाल दें, और ऊपर से कोला डालें।", "Nimbu nichodein, chhilka bhi daal dein, aur upar se cola daalein."),
    ],
  },
];
