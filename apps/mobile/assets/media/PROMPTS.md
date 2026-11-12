# Cookmate media, version 2: prompts for Antigravity

How to hand this file to Antigravity and get the images back: see `ANTIGRAVITY.md` next to it.

The app is being rebuilt to match the Stitch designs (warm cream pages, olive green and terracotta, soft rounded cards, real food photos everywhere). This file lists every picture that look needs, **pantry first**, then the other modules. Save each picture at the exact path in its table (`media/...`), at the exact size given. Upload them as described in `ANTIGRAVITY.md`; Claude then runs `python3 tools/media/sync.py`, which connects every file that exists to the app and flags any wrong size. Until a picture exists the app shows a soft placeholder, so any order works, a group at a time.

UI icons (tabs, mic, add, back, burner and location glyphs) are **not** in this list. They are drawn in code so they follow the theme and the text size.

---

## 0. Shared style (paste this before every prompt)

> Warm editorial food photograph for Cookmate, a kitchen companion app for Indian homes. Natural soft daylight from a window on one side, gentle shadows, true-to-life colour that is warm but not orange. Calm, uncluttered, like a good home-cooking magazine, not a glossy restaurant shoot. The setting is an ordinary, clean Indian home kitchen: steel and brass vessels, ceramic bowls, a wooden chopping board, a cotton cloth, a stone or warm cream counter. Background and props stay in a quiet palette of cream (#F7F0E5), off-white porcelain (#FFFDF8), soft peach clay (#E8C9AA), olive green (#68734A) and terracotta (#C95D32) accents. No text, letters, numbers, labels, logos, brand names, packaging or watermarks anywhere. No people or hands unless the prompt asks for them.

Rules for every file:

- PNG, sRGB, 8-bit, exactly the pixel size given (crop or resize, never stretch). These are 3x assets.
- Keep the subject inside the safe area given, so circles and rounded corners don't cut it.

---

## 1. Pantry: one photo per ingredient (`media/ingredients/`)

Shown as round thumbnails (about 56 pt) on the Kitchen screen, in chips and in lists, so each must read clearly when cropped to a circle and when small.

Ingredient prompt (after the shared style), with the item and how to show it filled in:

> Close-up, slightly overhead (about 45 degrees) photograph of **{ITEM}** ({HINDI}), {HOW TO SHOW IT}, on a warm cream counter. **Tight close-up: the item fills about 80% of the square frame**, centred, with only a little counter around it; keep the window, shelves, bowls and cloths out of frame or very soft. Nothing important within the outer 10% (it is cropped to a rounded square and a circle). One item only, clearly recognisable at thumbnail size (about 2 cm on a phone).

**Size for every file in section 1: 480 x 480.** Do one group at a time in one session so the light and angle match. Use the Hindi name to get the Indian variety right (for example "capsicum" is the green shimla mirch, "brinjal" is the purple Indian baingan, "curd" is homemade dahi in a bowl).

### 1.1 Vegetables (44)

Show it whole and raw, as bought from an Indian sabzi market: two or three pieces (or one for large ones like cauliflower, pumpkin, cabbage, bottle gourd), one cut open where that shows what it is.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/potato.png` | potato (aloo) | आलू |
| `media/ingredients/onion.png` | onion (pyaaz) | प्याज़ |
| `media/ingredients/tomato.png` | tomato (tamatar) | टमाटर |
| `media/ingredients/garlic.png` | garlic (lahsun) | लहसुन |
| `media/ingredients/ginger.png` | ginger (adrak) | अदरक |
| `media/ingredients/green-chilli.png` | green chilli (hari mirch) | हरी मिर्च |
| `media/ingredients/cauliflower.png` | cauliflower (phool gobhi) | फूलगोभी |
| `media/ingredients/cabbage.png` | cabbage (patta gobhi) | पत्तागोभी |
| `media/ingredients/green-peas.png` | green peas (matar) | मटर |
| `media/ingredients/carrot.png` | carrot (gajar) | गाजर |
| `media/ingredients/capsicum.png` | capsicum (shimla mirch) | शिमला मिर्च |
| `media/ingredients/brinjal.png` | brinjal (baingan) | बैंगन |
| `media/ingredients/okra.png` | okra (bhindi) | भिंडी |
| `media/ingredients/bottle-gourd.png` | bottle gourd (lauki) | लौकी |
| `media/ingredients/ridge-gourd.png` | ridge gourd (turai) | तुरई |
| `media/ingredients/bitter-gourd.png` | bitter gourd (karela) | करेला |
| `media/ingredients/pumpkin.png` | pumpkin (kaddu) | कद्दू |
| `media/ingredients/cucumber.png` | cucumber (kheera) | खीरा |
| `media/ingredients/radish.png` | radish (mooli) | मूली |
| `media/ingredients/beetroot.png` | beetroot (chukandar) | चुकंदर |
| `media/ingredients/french-beans.png` | french beans | फ्रेंच बीन्स |
| `media/ingredients/cluster-beans.png` | cluster beans (gwar phali) | ग्वार फली |
| `media/ingredients/sweet-potato.png` | sweet potato (shakarkand) | शकरकंद |
| `media/ingredients/colocasia.png` | colocasia (arbi) | अरबी |
| `media/ingredients/raw-banana.png` | raw banana (kaccha kela) | कच्चा केला |
| `media/ingredients/drumstick.png` | drumstick (sahjan) | सहजन |
| `media/ingredients/mushroom.png` | mushroom | मशरूम |
| `media/ingredients/sweet-corn.png` | sweet corn (bhutta) | भुट्टा |
| `media/ingredients/spring-onion.png` | spring onion (hara pyaaz) | हरा प्याज़ |
| `media/ingredients/round-gourd.png` | round gourd (tinda) | टिंडा |
| `media/ingredients/ivy-gourd.png` | ivy gourd (kundru) | कुंदरू |
| `media/ingredients/pointed-gourd.png` | pointed gourd (parwal) | परवल |
| `media/ingredients/raw-jackfruit.png` | raw jackfruit (kathal) | कटहल |
| `media/ingredients/turnip.png` | turnip (shalgam) | शलजम |
| `media/ingredients/lotus-stem.png` | lotus stem (kamal kakdi) | कमल ककड़ी |
| `media/ingredients/elephant-foot-yam.png` | elephant foot yam (jimikand) | जिमीकंद |
| `media/ingredients/raw-mango.png` | raw mango (kaccha aam) | कच्चा आम |
| `media/ingredients/ker.png` | ker | कैर |
| `media/ingredients/sangri.png` | sangri | सांगरी |
| `media/ingredients/spinach.png` | spinach (palak) | पालक |
| `media/ingredients/fenugreek-leaves.png` | fenugreek leaves (methi) | मेथी |
| `media/ingredients/mustard-greens.png` | mustard greens (sarson saag) | सरसों का साग |
| `media/ingredients/bathua.png` | bathua | बथुआ |
| `media/ingredients/amaranth-leaves.png` | amaranth leaves (chaulai) | चौलाई |

### 1.2 Herbs (4)

Show it a small fresh bunch, loosely tied or lying loose.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/coriander-leaves.png` | coriander leaves (hara dhaniya) | हरा धनिया |
| `media/ingredients/mint-leaves.png` | mint leaves (pudina) | पुदीना |
| `media/ingredients/curry-leaves.png` | curry leaves (kadi patta) | करी पत्ता |
| `media/ingredients/dill-leaves.png` | dill leaves (soya) | सोआ |

### 1.3 Fruit (11)

Show it whole, one or two pieces, one cut open where that helps.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/lemon.png` | lemon (nimbu) | नींबू |
| `media/ingredients/banana.png` | banana (kela) | केला |
| `media/ingredients/apple.png` | apple (seb) | सेब |
| `media/ingredients/mango.png` | mango (aam) | आम |
| `media/ingredients/papaya.png` | papaya (papita) | पपीता |
| `media/ingredients/guava.png` | guava (amrood) | अमरूद |
| `media/ingredients/pomegranate.png` | pomegranate (anaar) | अनार |
| `media/ingredients/orange.png` | orange (santra) | संतरा |
| `media/ingredients/grapes.png` | grapes (angoor) | अंगूर |
| `media/ingredients/watermelon.png` | watermelon (tarbooz) | तरबूज़ |
| `media/ingredients/sapota.png` | sapota (chikoo) | चीकू |

### 1.4 Dairy (8)

Show it in the vessel an Indian home keeps it in (steel container, glass jar, clay pot for curd).

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/milk.png` | milk (doodh) | दूध |
| `media/ingredients/curd.png` | curd (dahi) | दही |
| `media/ingredients/paneer.png` | paneer | पनीर |
| `media/ingredients/butter.png` | butter (makhan) | मक्खन |
| `media/ingredients/fresh-cream.png` | fresh cream (malai) | मलाई |
| `media/ingredients/khoya.png` | khoya | खोया |
| `media/ingredients/buttermilk.png` | buttermilk (chaas) | छाछ |
| `media/ingredients/cheese.png` | cheese | चीज़ |

### 1.5 Eggs (1)

Show it three brown or white eggs, one cracked into a small bowl.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/egg.png` | egg (anda) | अंडा |

### 1.6 Meat (3)

Show it raw, fresh, neat pieces on a steel plate, clean and appetising, no blood pooling.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/chicken.png` | chicken | चिकन |
| `media/ingredients/mutton.png` | mutton | मटन |
| `media/ingredients/minced-mutton.png` | minced mutton (keema) | कीमा |

### 1.7 Fish and seafood (2)

Show it raw, fresh, on a steel plate with a lemon wedge, clean and appetising.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/fish.png` | fish (machli) | मछली |
| `media/ingredients/prawns.png` | prawns (jhinga) | झींगा |

### 1.8 Dals and pulses (12)

Show it a small heap in a shallow ceramic or steel bowl, a few pieces spilling onto the surface.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/toor-dal.png` | toor dal (arhar dal) | अरहर दाल |
| `media/ingredients/yellow-moong-dal.png` | yellow moong dal (moong dal) | मूंग दाल |
| `media/ingredients/whole-green-moong.png` | whole green moong (sabut moong) | साबुत मूंग |
| `media/ingredients/masoor-dal.png` | masoor dal | मसूर दाल |
| `media/ingredients/chana-dal.png` | chana dal | चना दाल |
| `media/ingredients/urad-dal.png` | urad dal | उड़द दाल |
| `media/ingredients/whole-black-urad.png` | whole black urad (sabut urad) | साबुत उड़द |
| `media/ingredients/kidney-beans.png` | kidney beans (rajma) | राजमा |
| `media/ingredients/chickpeas.png` | chickpeas (kabuli chana) | काबुली चना |
| `media/ingredients/black-chickpeas.png` | black chickpeas (kala chana) | काला चना |
| `media/ingredients/black-eyed-peas.png` | black eyed peas (lobia) | लोबिया |
| `media/ingredients/moth-beans.png` | moth beans (moth) | मोठ |

### 1.9 Rice and grains (11)

Show it a small heap in a shallow ceramic bowl, a few grains spilling onto the surface.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/rice.png` | rice (chawal) | चावल |
| `media/ingredients/basmati-rice.png` | basmati rice (basmati chawal) | बासमती चावल |
| `media/ingredients/poha.png` | poha | पोहा |
| `media/ingredients/semolina.png` | semolina (sooji) | सूजी |
| `media/ingredients/broken-wheat.png` | broken wheat (daliya) | दलिया |
| `media/ingredients/sabudana.png` | sabudana | साबूदाना |
| `media/ingredients/vermicelli.png` | vermicelli (seviyan) | सेवई |
| `media/ingredients/pearl-millet.png` | pearl millet (bajra) | बाजरा |
| `media/ingredients/sorghum.png` | sorghum (jowar) | ज्वार |
| `media/ingredients/rolled-oats.png` | rolled oats (oats) | ओट्स |
| `media/ingredients/puffed-rice.png` | puffed rice (murmura) | मुरमुरा |

### 1.10 Flours (11)

Show it a soft mound in a small steel katori, a little dusting around it.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/whole-wheat-flour.png` | whole wheat flour (atta) | आटा |
| `media/ingredients/refined-flour.png` | refined flour (maida) | मैदा |
| `media/ingredients/gram-flour.png` | gram flour (besan) | बेसन |
| `media/ingredients/rice-flour.png` | rice flour (chawal ka atta) | चावल का आटा |
| `media/ingredients/pearl-millet-flour.png` | pearl millet flour (bajre ka atta) | बाजरे का आटा |
| `media/ingredients/maize-flour.png` | maize flour (makki ka atta) | मक्की का आटा |
| `media/ingredients/cornflour.png` | cornflour | कॉर्नफ्लोर |
| `media/ingredients/finger-millet-flour.png` | finger millet flour (ragi atta) | रागी का आटा |
| `media/ingredients/sorghum-flour.png` | sorghum flour (jowar atta) | ज्वार का आटा |
| `media/ingredients/water-chestnut-flour.png` | water chestnut flour (singhare ka atta) | सिंघाड़े का आटा |
| `media/ingredients/buckwheat-flour.png` | buckwheat flour (kuttu ka atta) | कुट्टू का आटा |

### 1.11 Spices and masalas (32)

Show it a small heap in a small steel katori or in one compartment of a masala dabba, a few whole pieces in front.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/salt.png` | salt (namak) | नमक |
| `media/ingredients/black-salt.png` | black salt (kala namak) | काला नमक |
| `media/ingredients/rock-salt.png` | rock salt (sendha namak) | सेंधा नमक |
| `media/ingredients/turmeric-powder.png` | turmeric powder (haldi) | हल्दी |
| `media/ingredients/red-chilli-powder.png` | red chilli powder (lal mirch) | लाल मिर्च पाउडर |
| `media/ingredients/kashmiri-chilli-powder.png` | kashmiri chilli powder (kashmiri mirch) | कश्मीरी लाल मिर्च |
| `media/ingredients/coriander-powder.png` | coriander powder (dhaniya powder) | धनिया पाउडर |
| `media/ingredients/cumin-seeds.png` | cumin seeds (jeera) | जीरा |
| `media/ingredients/roasted-cumin-powder.png` | roasted cumin powder (bhuna jeera) | भुना जीरा पाउडर |
| `media/ingredients/garam-masala.png` | garam masala | गरम मसाला |
| `media/ingredients/mustard-seeds.png` | mustard seeds (rai) | राई |
| `media/ingredients/fenugreek-seeds.png` | fenugreek seeds (methi dana) | मेथी दाना |
| `media/ingredients/asafoetida.png` | asafoetida (hing) | हींग |
| `media/ingredients/carom-seeds.png` | carom seeds (ajwain) | अजवाइन |
| `media/ingredients/fennel-seeds.png` | fennel seeds (saunf) | सौंफ |
| `media/ingredients/dried-fenugreek-leaves.png` | dried fenugreek leaves (kasuri methi) | कसूरी मेथी |
| `media/ingredients/dry-mango-powder.png` | dry mango powder (amchur) | अमचूर |
| `media/ingredients/black-pepper.png` | black pepper (kali mirch) | काली मिर्च |
| `media/ingredients/cloves.png` | cloves (laung) | लौंग |
| `media/ingredients/green-cardamom.png` | green cardamom (elaichi) | हरी इलायची |
| `media/ingredients/black-cardamom.png` | black cardamom (badi elaichi) | बड़ी इलायची |
| `media/ingredients/cinnamon.png` | cinnamon (dalchini) | दालचीनी |
| `media/ingredients/bay-leaf.png` | bay leaf (tej patta) | तेज पत्ता |
| `media/ingredients/dry-red-chilli.png` | dry red chilli (sabut lal mirch) | साबुत लाल मिर्च |
| `media/ingredients/chaat-masala.png` | chaat masala | चाट मसाला |
| `media/ingredients/nigella-seeds.png` | nigella seeds (kalonji) | कलौंजी |
| `media/ingredients/nutmeg.png` | nutmeg (jaiphal) | जायफल |
| `media/ingredients/saffron.png` | saffron (kesar) | केसर |
| `media/ingredients/dry-ginger-powder.png` | dry ginger powder (saunth) | सोंठ |
| `media/ingredients/sambar-powder.png` | sambar powder (sambar masala) | सांभर मसाला |
| `media/ingredients/pav-bhaji-masala.png` | pav bhaji masala | पाव भाजी मसाला |
| `media/ingredients/chole-masala.png` | chole masala | छोले मसाला |

### 1.12 Oils and ghee (6)

Show it in a small glass bottle or steel container, a little poured into a small spoon in front.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/ghee.png` | ghee | घी |
| `media/ingredients/mustard-oil.png` | mustard oil (sarson ka tel) | सरसों का तेल |
| `media/ingredients/groundnut-oil.png` | groundnut oil (moongphali tel) | मूंगफली का तेल |
| `media/ingredients/refined-oil.png` | refined oil (refined tel) | रिफाइंड तेल |
| `media/ingredients/coconut-oil.png` | coconut oil (nariyal tel) | नारियल तेल |
| `media/ingredients/sesame-oil.png` | sesame oil (til ka tel) | तिल का तेल |

### 1.13 Nuts and seeds (12)

Show it a small heap in a shallow bowl, a few spilling onto the surface.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/peanuts.png` | peanuts (moongphali) | मूंगफली |
| `media/ingredients/cashews.png` | cashews (kaju) | काजू |
| `media/ingredients/almonds.png` | almonds (badam) | बादाम |
| `media/ingredients/raisins.png` | raisins (kishmish) | किशमिश |
| `media/ingredients/walnuts.png` | walnuts (akhrot) | अखरोट |
| `media/ingredients/pistachios.png` | pistachios (pista) | पिस्ता |
| `media/ingredients/fox-nuts.png` | fox nuts (makhana) | मखाना |
| `media/ingredients/coconut.png` | coconut (nariyal) | नारियल |
| `media/ingredients/desiccated-coconut.png` | desiccated coconut (sukha nariyal) | सूखा नारियल |
| `media/ingredients/sesame-seeds.png` | sesame seeds (til) | तिल |
| `media/ingredients/poppy-seeds.png` | poppy seeds (khaskhas) | खसखस |
| `media/ingredients/flax-seeds.png` | flax seeds (alsi) | अलसी |

### 1.14 Sugar and jaggery (3)

Show it in a small bowl (jaggery as a broken block).

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/sugar.png` | sugar (cheeni) | चीनी |
| `media/ingredients/jaggery.png` | jaggery (gud) | गुड़ |
| `media/ingredients/honey.png` | honey (shahad) | शहद |

### 1.15 Sauces, pickles, pastes (7)

Show it in a small glass jar or bowl, a spoonful in front.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/tamarind.png` | tamarind (imli) | इमली |
| `media/ingredients/kokum.png` | kokum | कोकम |
| `media/ingredients/ginger-garlic-paste.png` | ginger garlic paste (adrak lahsun paste) | अदरक लहसुन पेस्ट |
| `media/ingredients/tomato-ketchup.png` | tomato ketchup (tomato sauce) | टमाटर सॉस |
| `media/ingredients/vinegar.png` | vinegar (sirka) | सिरका |
| `media/ingredients/soy-sauce.png` | soy sauce (soya sauce) | सोया सॉस |
| `media/ingredients/pickle.png` | pickle (achaar) | अचार |

### 1.16 Bread and packaged food (6)

Show it as it looks at home, out of any packet (no packaging, no labels).

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/bread.png` | bread | ब्रेड |
| `media/ingredients/pav.png` | pav | पाव |
| `media/ingredients/soya-chunks.png` | soya chunks | सोया चंक्स |
| `media/ingredients/tofu.png` | tofu | टोफू |
| `media/ingredients/papad.png` | papad | पापड़ |
| `media/ingredients/bhujia.png` | bhujia | भुजिया |

### 1.17 Tea and coffee (2)

Show it a small heap in a small bowl, a cup beside it.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/tea-leaves.png` | tea leaves (chai patti) | चाय पत्ती |
| `media/ingredients/coffee-powder.png` | coffee powder (coffee) | कॉफ़ी |

### 1.18 Baking (2)

Show it a small heap in a tiny bowl.

| File | Item | Hindi |
| --- | --- | --- |
| `media/ingredients/baking-soda.png` | baking soda (khane ka soda) | खाने का सोडा |
| `media/ingredients/baking-powder.png` | baking powder | बेकिंग पाउडर |

### 1.19 Fallbacks for the unknown (`media/ingredients/category-*.png`, 480 x 480)

Used when an item has no photo of its own yet, and for homemade food and leftovers, which the catalog doesn't list.

| File | Prompt (after the shared style and the ingredient prompt) |
| --- | --- |
| `media/ingredients/category-beverage.png` | a small, tidy mix of three or four typical items from this group: tea and coffee, arranged together |
| `media/ingredients/category-condiment.png` | a small, tidy mix of three or four typical items from this group: sauces, pickles, pastes, arranged together |
| `media/ingredients/category-dairy.png` | a small, tidy mix of three or four typical items from this group: dairy, arranged together |
| `media/ingredients/category-egg.png` | a small, tidy mix of three or four typical items from this group: eggs, arranged together |
| `media/ingredients/category-flour.png` | a small, tidy mix of three or four typical items from this group: flours, arranged together |
| `media/ingredients/category-fruit.png` | a small, tidy mix of three or four typical items from this group: fruit, arranged together |
| `media/ingredients/category-grain.png` | a small, tidy mix of three or four typical items from this group: rice and grains, arranged together |
| `media/ingredients/category-herb.png` | a small, tidy mix of three or four typical items from this group: herbs, arranged together |
| `media/ingredients/category-homemade.png` | a small glass jar of homemade green chutney next to a steel katori of homemade masala paste |
| `media/ingredients/category-leftover.png` | a steel tiffin box with its lid half open showing yesterday's dal and rice inside |
| `media/ingredients/category-meat.png` | a small, tidy mix of three or four typical items from this group: meat, arranged together |
| `media/ingredients/category-nut_seed.png` | a small, tidy mix of three or four typical items from this group: nuts and seeds, arranged together |
| `media/ingredients/category-oil_fat.png` | a small, tidy mix of three or four typical items from this group: oils and ghee, arranged together |
| `media/ingredients/category-other.png` | a small, tidy mix of three or four typical items from this group: baking, arranged together |
| `media/ingredients/category-packaged.png` | a small, tidy mix of three or four typical items from this group: bread and packaged food, arranged together |
| `media/ingredients/category-pulse.png` | a small, tidy mix of three or four typical items from this group: dals and pulses, arranged together |
| `media/ingredients/category-seafood.png` | a small, tidy mix of three or four typical items from this group: fish and seafood, arranged together |
| `media/ingredients/category-spice.png` | a small, tidy mix of three or four typical items from this group: spices and masalas, arranged together |
| `media/ingredients/category-sweetener.png` | a small, tidy mix of three or four typical items from this group: sugar and jaggery, arranged together |
| `media/ingredients/category-vegetable.png` | a small, tidy mix of three or four typical items from this group: vegetables, arranged together |

---

## 2. Onboarding and kitchen scenes (`media/scenes/`)

| File | Size | Prompt (after the shared style) |
| --- | --- | --- |
| `media/scenes/welcome.png` | 1080 x 690 | A ceramic bowl of fresh kachumber salad (tomato, cucumber, onion, coriander, a squeeze of lemon) on a wooden table by a sunlit kitchen window, a small brass bottle of oil and a potted tulsi plant softly blurred behind. Wide shot, bowl slightly left of centre, lots of calm space. Bottom-left corner kept plain (a label sits there). |
| `media/scenes/fridge-open.png` | 1080 x 1600 | Looking straight into an open, tidy Indian home fridge next to an open wooden pantry shelf, as if through a phone camera: steel containers of dal and sabzi, a bowl of curd, paneer, eggs in the door, coriander and palak in the crisper, lemons, tomatoes, green chillies; on the shelf glass jars of dals, rice and atta, a masala dabba, onions and potatoes in a basket. Evenly lit, everything recognisable. Used behind the camera scan screen when no camera is available. |
| `media/scenes/pantry-shelf.png` | 1080 x 690 | A neat open kitchen shelf with glass jars of different dals, rice and atta, a steel masala dabba with its lid off showing the spices, and a wire basket of onions and potatoes. Soft morning light. Used on the kitchen setup step. |

---

## 3. Empty and error states (`media/illustrations/`, redo in the new colours)

Same six files and sizes as before (480 x 480, **transparent**, drawing inside the central 420 x 420). Small, friendly spot illustrations, all in one consistent style: soft rounded flat shapes with a 6 px charcoal (#24231F) outline with rounded ends, fills from cream (#F7F0E5), peach (#E8C9AA) and porcelain (#FFFDF8), with olive (#68734A) as the one accent and a small touch of terracotta (#C95D32) only where the prompt says. One centred object, no background shape. Generate all six in one session.

| File | Prompt |
| --- | --- |
| `media/illustrations/empty-kitchen.png` | An open steel kitchen shelf with nothing on it but one small olive-green leaf. Calm and inviting, not sad. |
| `media/illustrations/empty-picks.png` | An empty round steel thali at a slight angle, a small olive spoon beside it, three tiny terracotta sparkle marks above it. |
| `media/illustrations/empty-list.png` | A cotton jhola (cloth shopping bag), folded flat and empty, with a small olive tick mark beside it. |
| `media/illustrations/offline.png` | A phone leaning on a steel dabba, three curved signal arcs above it, the outer arc broken in the middle. Calm. |
| `media/illustrations/error.png` | A pressure cooker letting off one small harmless puff of steam, the puff a soft peach cloud. Friendly, a little funny. |
| `media/illustrations/all-done.png` | A clean steel kadhai seen from the side, an olive circle with a porcelain tick floating above it. |

Keep a clear margin: last time error, all-done and offline were cut at the edges.

---

## 4. App icon and splash (`apps/mobile/assets/`, recolour)

Same glyph as before (a small round handi seen from the side with one leaf rising like steam), same files and sizes as the previous version of this file, with these colours:

| File | Change |
| --- | --- |
| `icon.png` (1024 x 1024, no transparency) | Glyph in porcelain #FFFDF8 on a flat olive #68734A square filling the canvas. |
| `android-icon-foreground.png` (1024 x 1024, transparent) | Glyph in porcelain #FFFDF8, about 40% of the width, centred. |
| `android-icon-background.png` (1024 x 1024) | Flat olive #68734A. |
| `android-icon-monochrome.png` (1024 x 1024, transparent) | Same glyph and position, solid white. |
| `splash-icon.png` (1024 x 1024, transparent) | Glyph in olive #68734A, about 50% of the width (shown on the cream splash). |
| `favicon.png` (48 x 48) | `icon.png` scaled down. |

---

## 5. Later modules (do after sections 1 to 4)

### 5.1 Dish photos (`media/dishes/`, 1080 x 1080, replace all ten)

The current ten are temporary and must be replaced before any release. Same file names as now. New prompt (after the shared style):

> Three-quarter angle (about 35 degrees) photograph of homemade **{DISH}** in a {VESSEL}, on a wooden table or cream cloth, a spoon resting at the side, one small garnish. The dish is centred and fills about 75% of the square frame; nothing important in the outer 12% (it is also cropped to a circle). Real, appetising, a little imperfect.

| File | DISH | VESSEL |
| --- | --- | --- |
| `media/dishes/besan-chilla.png` | besan chilla with chopped onion, tomato and coriander, green chutney on the side | round steel plate |
| `media/dishes/chicken-curry.png` | home-style chicken curry, thin red-brown gravy, coriander leaves | steel kadhai |
| `media/dishes/dal-tadka.png` | yellow dal tadka with a ghee, jeera and red chilli tempering | brass bowl |
| `media/dishes/egg-bhurji.png` | egg bhurji with onion, tomato, green chilli and coriander | black iron tawa |
| `media/dishes/jeera-aloo.png` | jeera aloo, golden potato cubes with cumin and coriander | steel kadhai |
| `media/dishes/kadhi-pakora.png` | Punjabi kadhi pakora with a red chilli tadka | ceramic bowl |
| `media/dishes/kanda-poha.png` | kanda poha with peanuts and curry leaves, a lemon wedge | round steel plate |
| `media/dishes/matar-paneer.png` | matar paneer in an orange-red tomato gravy | steel bowl |
| `media/dishes/moong-dal-khichdi.png` | moong dal khichdi with ghee melting on top | steel bowl |
| `media/dishes/rajma.png` | rajma in thick gravy, sliced onion on the side | steel bowl |

### 5.2 Coming with the Cook module

"How it should look" photos for the cooking steps (golden onions, oil separating from masala, dal at the right thickness and so on). Claude will add that list here when the Cook module starts, generated from the recipes' sensory cues.

---

## Checklist

- [ ] 1. Ingredient photos: vegetables, herbs, fruit, dairy, egg, meat, seafood (12 vegetables in: potato, onion, tomato, garlic, ginger, green peas, carrot, capsicum, french beans, bitter gourd, ridge gourd, mushroom; Claude cropped them tighter. Redo `ridge-gourd.png`: real turai has a star-shaped cut end with sharp ridges)
- [ ] 1. Ingredient photos: dals, grains, flours
- [ ] 1. Ingredient photos: spices, oils, nuts, sweeteners, condiments, packaged, tea, baking
- [ ] 1.19 Category fallbacks
- [ ] 2. Three scenes
- [ ] 3. Six state illustrations in the new colours
- [ ] 4. App icon set and splash in olive
- [ ] 5.1 Ten dish photos
- [ ] `python3 tools/media/sync.py` reports no problems
