# Cookmate media: prompts for Antigravity

How to hand this file to Antigravity and get the images back into the repo: see `ANTIGRAVITY.md` next to it.

This folder holds the images the app needs and that code can't draw. Generate each one with the prompt given, save it at the exact path, then run:

```
python3 tools/media/sync.py
```

(from the repo root). The script connects every file that exists to the app and warns you if a size is wrong. Until a file exists, the app shows a soft lime placeholder in its place, so you can generate them in any order and a few at a time.

**For Antigravity:** work through the sections below in order. For each item, generate the image, then resize or crop it to the exact pixel size given (do not stretch it). Save it as PNG at the path shown, relative to `apps/mobile/assets/`. After each section, run the sync script and fix anything it reports. Do not change any other file.

UI icons (tab bar, mic, add, back, location glyphs) are **not** in this list. They are drawn in code (`src/design-system/icons.tsx`) so they can follow the theme and the text size.

---

## 0. Shared style (paste this before every prompt)

> Style for the Cookmate app, an AI kitchen companion for Indian homes. The look is fresh, light and calm: soft, even studio light; bright, saturated but natural food colour; clean edges; plenty of empty space. The palette around the food is limited to a pale grey canvas (#F6F6F6), white (#FFFFFF), one lime green (#9ED22A) with its soft tints (#D6F2A2, #EAF5CD), and near-black ink (#111111) for any line work. The setting is an ordinary Indian home kitchen: steel and brass vessels, a pressure cooker, a tawa, masala dabba, a cotton cloth. No text, letters, numbers, logos, watermarks or brand names anywhere in the image. No people or hands unless the prompt asks for them. No emoji-style cartoon faces on food.

Rules for every file:

- PNG, sRGB, 8-bit. "Transparent" means a real alpha channel (no white or checkerboard baked in).
- Exactly the pixel size given (these are 3x assets; the app shows them at a third of that).
- Keep the subject inside the safe area given, so it isn't cut off by rounded corners or circles.

---

## 1. Empty and error states (`media/illustrations/`)

Shown at 160 x 160 pt above a heading and one line of text, on the pale grey screen. Each one is a small, friendly spot illustration, all in **one consistent style**: flat vector shapes with soft rounded forms, a 6 px near-black (#111111) outline with rounded ends, fills only from the lime tints (#D6F2A2, #EAF5CD) and white, with lime #9ED22A as the one accent. One simple, centred object. No background shape or scene. Transparent background. Keep the drawing inside the central 420 x 420 px.

Generate them together in one session, so the line weight and shapes match.

| File | Size | Prompt (after the shared style) |
| --- | --- | --- |
| `media/illustrations/empty-kitchen.png` | 480 x 480, transparent | An open steel kitchen shelf, or an open fridge door, with nothing inside except one small lime-green leaf resting on the shelf. It should feel calm and inviting, not sad. |
| `media/illustrations/empty-picks.png` | 480 x 480, transparent | A round steel thali, seen from above at a slight angle, empty and clean, with a small lime spoon beside it and three tiny sparkle marks above it, as if an idea is coming. |
| `media/illustrations/empty-list.png` | 480 x 480, transparent | A cotton jhola (Indian cloth shopping bag), folded flat and empty, with a small lime tick mark beside it. |
| `media/illustrations/offline.png` | 480 x 480, transparent | A small kitchen radio, or a phone resting against a steel dabba, with three curved signal arcs above it, the outermost arc broken in the middle. Calm, not alarming. |
| `media/illustrations/error.png` | 480 x 480, transparent | A pressure cooker letting off a small, harmless puff of steam from its whistle. The puff is a soft lime-tint cloud. Friendly and a little funny, not dangerous. |
| `media/illustrations/all-done.png` | 480 x 480, transparent | A clean steel kadhai, seen from the side, with a lime-green circle containing a near-black tick mark floating just above it. Content, finished. |

---

## 2. Onboarding (`media/onboarding/`)

The welcome screen copies the reference look: a big headline at the top and a pile of fresh produce cut-outs at the bottom of the screen, running off the left, right and bottom edges, with a few single leaves floating near the headline.

| File | Size | Prompt (after the shared style) |
| --- | --- | --- |
| `media/onboarding/produce-pile.png` | 1179 x 840, transparent | Studio product photograph of fresh Indian vegetables in a loose, generous pile, cut out with clean edges on a transparent background, no surface, no plate, no basket. The pile includes red tomatoes (one cut in half), red onions, a few potatoes, green chillies, a bunch of coriander, a knob of ginger, two lemons (one halved), and a bunch of palak (spinach). Fill the whole width: the pile runs off the left and right edges and is cut by the bottom edge, and its top forms a soft, uneven hill that reaches about 60% of the image height in the middle and less at the sides. The top 30% of the image is empty. Bright, saturated, studio-lit, with a soft natural contact shadow under each item baked in. Shot slightly from above, as if the produce were piled on the floor of the screen. |
| `media/onboarding/leaf-palak.png` | 240 x 240, transparent | One single fresh palak (spinach) leaf, studio photograph, cut out on a transparent background, tilted about 30 degrees, with a very soft shadow below it. Fills about 80% of the frame. |
| `media/onboarding/leaf-methi.png` | 240 x 240, transparent | One small sprig of fresh methi (fenugreek) with five or six small leaves, studio photograph, cut out on a transparent background, tilted, with a very soft shadow. Fills about 80% of the frame. |
| `media/onboarding/leaf-coriander.png` | 240 x 240, transparent | One single fresh coriander (dhania) sprig, studio photograph, cut out on a transparent background, tilted, with a very soft shadow. Fills about 80% of the frame. |

---

## 3. Dish photos (`media/dishes/`)

One photo per recipe in the starter set. The app shows them as circles (40 pt in lists, overlapping in twos and threes with a white ring) and large in the "Tonight" card, so each must work cropped to a circle.

Shared prompt for all ten, with the dish name filled in:

> Top-down (90 degree overhead) food photograph of homemade **{DISH}**, served the way an Indian family eats it on a weeknight, in a {VESSEL}. The vessel is centred and fills about 90% of the square frame. The background around it is plain pale grey (#F6F6F6) and shows in the corners only. Soft, even, natural daylight from one side; no harsh shadows; no steam effects. Real, appetising, a little imperfect, not glossy restaurant plating. One small garnish only. No cutlery across the dish, no hands, no text.

| File | Size | DISH | VESSEL |
| --- | --- | --- | --- |
| `media/dishes/besan-chilla.png` | 1080 x 1080 | besan chilla (gram flour pancake) with chopped onion, tomato and coriander, a little green chutney on the side | round steel plate |
| `media/dishes/chicken-curry.png` | 1080 x 1080 | home-style chicken curry with a thin, red-brown gravy and a few coriander leaves | steel kadhai |
| `media/dishes/dal-tadka.png` | 1080 x 1080 | yellow dal tadka with a ghee, jeera and red chilli tempering on top | small brass or steel bowl |
| `media/dishes/egg-bhurji.png` | 1080 x 1080 | egg bhurji (spiced scrambled eggs) with onion, tomato, green chilli and coriander | black iron tawa |
| `media/dishes/jeera-aloo.png` | 1080 x 1080 | jeera aloo, golden potato cubes with cumin seeds and coriander | steel kadhai |
| `media/dishes/kadhi-pakora.png` | 1080 x 1080 | Punjabi kadhi pakora, pale yellow yoghurt curry with soft onion pakoras and a red chilli tadka | ceramic bowl |
| `media/dishes/kanda-poha.png` | 1080 x 1080 | kanda poha (flattened rice with onion, turmeric, peanuts and curry leaves), a lemon wedge on the side | round steel plate |
| `media/dishes/matar-paneer.png` | 1080 x 1080 | matar paneer, paneer cubes and green peas in an orange-red tomato gravy | steel bowl |
| `media/dishes/moong-dal-khichdi.png` | 1080 x 1080 | moong dal khichdi with a spoon of ghee melting on top | steel bowl |
| `media/dishes/rajma.png` | 1080 x 1080 | rajma (red kidney bean curry) in thick gravy, a little sliced onion on the side | steel bowl |

When new recipes are added to `content/recipes/`, the sync script will list a new `media/dishes/<slug>.png` to generate with the same prompt.

---

## 4. App icon and splash (`apps/mobile/assets/`, one level up)

These replace the Expo placeholders that are there now. The mark is a simple glyph: a small round cooking pot (handi) seen from the side, with one leaf rising from it like steam. Draw it as flat vector shapes in near-black ink (#111111): thick, rounded, friendly, readable at 29 px. No letters.

| File | Size | Prompt |
| --- | --- | --- |
| `icon.png` | 1024 x 1024, **no** transparency | The Cookmate glyph (round handi with one rising leaf) in solid near-black #111111, centred on a flat lime #9ED22A square that fills the whole canvas edge to edge, no rounded corners (the phone rounds them). The glyph spans about 55% of the width. No gradients, no shadow, no text. |
| `android-icon-foreground.png` | 1024 x 1024, transparent | The same glyph in #111111 on a transparent background, centred, spanning about 40% of the width, so it stays inside Android's central safe circle. |
| `android-icon-background.png` | 1024 x 1024 | A flat lime #9ED22A square, nothing else. |
| `android-icon-monochrome.png` | 1024 x 1024, transparent | The same glyph as `android-icon-foreground.png`, same size and position, in solid white #FFFFFF. |
| `splash-icon.png` | 1024 x 1024, transparent | The same glyph in #111111, centred, spanning about 50% of the width. It is shown on the pale grey splash screen. |
| `favicon.png` | 48 x 48 | `icon.png` scaled down to 48 x 48. |

---

## Checklist

- [x] 1. Six state illustrations (redo later: error, all-done and offline are cropped at the edges)
- [x] 2. Produce pile and three leaves (redo later: the pile should be a studio photo, not flat art)
- [ ] 3. Ten dish photos. **The current ones are temporary placeholders of unconfirmed origin: replace all ten before any release.**
- [x] 4. App icon set and splash
- [ ] `python3 tools/media/sync.py` reports no problems
