# Making the pictures in Antigravity

Antigravity only makes the pictures. It doesn't need the repo or any GitHub sign-in. You upload the finished files into this folder (`apps/mobile/assets/media/`), and Claude checks them, connects them to the app and commits them.

## 1. Set up a folder for Antigravity

1. Make an empty folder on your computer, for example `cookmate-media`.
2. Put a copy of `PROMPTS.md` in it. Get it from this folder on GitHub (open the file, then "Download raw file"), or from the copy Claude sent you in the chat.
3. Open that folder in Antigravity.

## 2. Paste this prompt into Antigravity's agent

Paste it once, at the start. When it stops after a group, reply "next group" to continue.

> You are making the photos and illustrations for Cookmate, a cooking app for Indian homes. Everything you need is in `PROMPTS.md` in this folder. Read all of it before you start.
>
> **What to make.** Work through `PROMPTS.md` in order, one group at a time: 1.1, 1.2, and so on to 1.19, then sections 2, 3, 4, 5.1 and 5.3. Each table row is one picture. Make every row in the group before you stop.
>
> **How to write each image prompt.** For every picture, the prompt you give the image model is made of:
> 1. the shared style block from section 0, word for word;
> 2. the section's own prompt (for section 1, the "Ingredient prompt", with {ITEM}, {HINDI} and {HOW TO SHOW IT} filled in from the row and from the "Show it ..." line under the group heading; for section 5.1, the dish prompt with {DISH} and {VESSEL} filled in; for section 5.3, the drink prompt with {DRINK}, {GLASS} and {GARNISH} filled in);
> 3. for the other sections, the prompt in that row.
>
> Use the Hindi name to get the Indian variety right (for example "capsicum" is green shimla mirch, "brinjal" is the purple Indian baingan, "curd" is homemade dahi in a bowl, "pav" is soft square bread rolls).
>
> **Where to save.** Save every file inside a folder called `media` in this workspace, at exactly the path in the table, without the leading `media/` doubled. For example, the row `media/ingredients/potato.png` goes to `media/ingredients/potato.png`. Use the names exactly as written: lowercase, hyphens, `.png`. Don't rename, translate or add numbers.
>
> **Size and format.** Every file must be PNG, sRGB, at exactly the pixel size the section gives (section 1: 480 x 480; the other sizes are in their tables). If the image model gives you another size or shape, crop from the centre to the right shape and then resize. Never stretch or squash. Where a row says "transparent", the background must be a real transparent alpha channel, not white and not a checkerboard. You may write and run a small Python script with Pillow to crop, resize and check the files.
>
> **Check each picture before you keep it.** Regenerate it if any of these is true:
> - there is any text, letter, number, label, logo, brand or packaging in it;
> - the item isn't clearly recognisable when shown small, as a circle about 2 cm wide;
> - it is the wrong item or a non-Indian variety, or shows more than the row asks for;
> - something important touches the outer edge (it will be cropped to a circle or rounded corners);
> - there are hands or people where the prompt didn't ask for them;
> - it doesn't match the light, angle and colours of the other pictures in the same group.
>
> **Keep a group consistent.** Make all pictures in one group in one go, with the same camera angle, light direction, counter surface and amount of empty space, so they look like one set side by side.
>
> **After each group:**
> 1. Run a check over the `media` folder: for every file in that group, print its name, size and whether it has transparency, and flag any size that doesn't match `PROMPTS.md` or any file that is missing.
> 2. Fix anything flagged.
> 3. Add a line to `media/DONE.md` with the group number and how many files you made.
> 4. Tell me the group is done and stop. Don't start the next group until I say "next group".
>
> Don't edit `PROMPTS.md`, and don't create files anywhere except the `media` folder.

## 3. Upload the pictures

Upload as often as you like; a group at a time is fine. Either way works:

**A. Send them to Claude in the chat (easiest).** Zip the `media` folder (or just the new group's folder) and upload the zip in this chat. Claude puts the files in place, checks every picture, runs `python3 tools/media/sync.py`, and commits them to the working branch.

**B. Upload on GitHub yourself.**
1. On github.com, open the repo and switch to the branch Claude is working on (it's named in the chat; right now `sprint-7/new-look`).
2. Go into `apps/mobile/assets/media/`.
3. Click "Add file" → "Upload files", then drag in the folders from inside your `media` folder (for example the `ingredients` folder). The folder names must stay the same, so the files land in `apps/mobile/assets/media/ingredients/` and so on.
4. Commit directly to that branch, then tell Claude "photos uploaded". Claude connects them to the app (the sync script) and checks them.

Don't upload `DONE.md` or `PROMPTS.md`; only the pictures.

## 4. What Claude does next

- Looks at every picture against the style and the list, and names any file to redo and why.
- Runs the sync script, so each photo appears in the app straight away (until then the app shows a soft placeholder).
- Adds the next batch to `PROMPTS.md` when a new module needs pictures (cooking step photos come with the Cook module).
