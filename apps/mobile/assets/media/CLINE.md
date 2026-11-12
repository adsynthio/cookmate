# Making the pictures with Cline and Vertex AI

Cline (in VS Code) writes and runs a small Python script that calls Google's image model on Vertex AI for every row in `PROMPTS.md`, crops each result to the exact size, and saves it under `media/`. You upload the finished pictures exactly as described in `ANTIGRAVITY.md`, section 3.

## 1. Set up the folder

1. Make a folder, for example `cookmate-media`, and put `PROMPTS.md` in it (and the `media` folder from Antigravity, if you have one, so finished pictures are skipped).
2. Open the folder in VS Code.
3. Put your Vertex AI key in an environment variable, not in a file Cline will read or commit. In VS Code's terminal:
   - macOS / Linux: `export GOOGLE_API_KEY="your key"`
   - Windows PowerShell: `$env:GOOGLE_API_KEY="your key"`
   If you use a Google Cloud project with `gcloud auth application-default login` instead of a key, also set `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` (for example `us-central1`).
4. Start VS Code from that same terminal (`code .`) so Cline's terminal sees the variable.

## 2. Paste this prompt into Cline

> You are making the photos and illustrations for Cookmate, a cooking app for Indian homes, using Google's image model on Vertex AI. Everything to make is listed in `PROMPTS.md` in this folder. Read all of it first.
>
> **Set up**
> 1. Create a Python virtual environment in `.venv` and install `google-genai` and `Pillow`.
> 2. Write `make_images.py`. It must read credentials only from the environment: `GOOGLE_API_KEY` (use `genai.Client(vertexai=True, api_key=...)`), or, if that isn't set, `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` with application default credentials. Never print, log, or write the key anywhere, and never put it in a file.
> 3. List the image-generation models my credentials can use and pick the newest Imagen model (prefer the standard quality one, not "fast" or "ultra"). Tell me which one you picked before generating anything.
>
> **What the script does**
> 1. Parse every table row in `PROMPTS.md` that names a file under `media/` (sections 1.1 to 1.19, 2, 3, 4, 5.1). For each row, build the prompt exactly as the file says:
>    - always start with the shared style block from section 0, word for word;
>    - section 1: the "Ingredient prompt" with {ITEM} = the item column (including the name in brackets), {HINDI} = the Hindi column, and {HOW TO SHOW IT} = the "Show it ..." line under that group's heading; section 1.19 rows add their own text after it;
>    - section 5.1: the dish prompt with {DISH} and {VESSEL} from the row;
>    - sections 2, 3 and 4: the prompt text in that row.
> 2. Skip any file that already exists, so the script can be stopped and run again safely.
> 3. Ask the model for one image per row, with the aspect ratio closest to the target (1:1 for square files, 16:9 for 1080 x 690, 9:16 for 1080 x 1600). Turn off any added people or text if the API has such options.
> 4. Crop from the centre to the target shape and resize to the exact pixel size given (never stretch). For section 1 (ingredients), crop a little tighter: keep the central 80% of the square before resizing, so the item fills the thumbnail.
> 5. Rows that say "transparent" (section 3 illustrations, some of section 4): add "on a plain flat pure white background" to the prompt, then make the background transparent by removing the near-white area connected to the image edges (flood fill from the borders, with soft edges), and save as RGBA PNG.
> 6. Save as PNG at the exact path, creating folders as needed.
> 7. Handle errors calmly: retry a failed or rate-limited call up to 3 times with a growing pause; if the model blocks a prompt, log it and move on. Run at most 2 requests at a time.
> 8. Append one line per saved file to `media/DONE.md` (file name, size), and write any failures to `media/FAILED.md` with the reason.
> 9. Accept command-line options: `--group 1.1` (or a section number like `2`) to make only that group, `--only file1,file2` to make named files, `--limit N` to stop after N new images, and `--dry-run` to print the prompts without calling the API.
>
> **How to run it**
> 1. First run `--dry-run --group 1.1 --limit 3` and show me the three full prompts.
> 2. Then make these first, in this order, because the app shows them most:
>    - `--group 1.19` (the 20 category fallbacks)
>    - `--only` these everyday items: coriander-leaves, green-chilli, lemon, spinach, cauliflower, okra, brinjal, cucumber, milk, curd, paneer, butter, ghee, egg, chicken, rice, basmati-rice, whole-wheat-flour, gram-flour, toor-dal, yellow-moong-dal, chana-dal, kidney-beans, salt, turmeric-powder, red-chilli-powder, cumin-seeds, garam-masala, mustard-oil, sugar, tea-leaves (each is `media/ingredients/<name>.png`)
> 3. After each run, make `media/contact-sheet.png`: a grid of every image from that run with its file name under it, and show it to me. Look at each picture yourself too, and regenerate it (delete the file and run again with `--only`) if:
>    - there is any text, number, label, logo or packaging in it;
>    - it is the wrong item or a non-Indian variety (use the Hindi name to check);
>    - the item is small in the frame or cut off at the edge;
>    - there are hands or people where the prompt didn't ask for them;
>    - it doesn't match the light, angle and colours of the rest of its group.
> 4. Then continue group by group: 1.1, 1.2 and so on to 1.18, then 2, 3, 4, 5.1. Stop after each group and wait for me to say "next group".
>
> Don't edit `PROMPTS.md`. Don't create files outside this folder except the virtual environment. Before starting a big group, tell me roughly how many images it will make so I can keep an eye on my credits.

## 3. Upload

Zip the `media` folder (or just the new subfolder) and upload it in the Claude chat, or upload the folders on GitHub as described in `ANTIGRAVITY.md`. Leave out `DONE.md`, `FAILED.md`, `contact-sheet.png` and `make_images.py`. The key never leaves your computer.
