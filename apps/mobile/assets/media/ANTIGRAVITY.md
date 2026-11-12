# Handing the media off to Antigravity

The repo on GitHub is the handoff. Antigravity works on its own branch, pushes it, and Claude reviews it and merges it into the sprint branch.

## 1. Get the repo onto your computer

First time:

```
git clone https://github.com/adsynthio/cookmate.git
cd cookmate
```

Already cloned:

```
cd cookmate
git fetch origin
```

Then make a branch just for the images:

```
git checkout -b media/v2 origin/sprint-7/new-look
```

You need `git` and `python3`. The sync script uses only the Python standard library.

## 2. Open the folder in Antigravity and paste this to its agent

> Read `apps/mobile/assets/media/PROMPTS.md` and generate the images it lists, group by group, starting with section 1.1. For each image:
> - Use the shared style block plus that image's prompt.
> - Crop or resize the result to the exact pixel size given (do not stretch it), and save it as PNG at the exact path given.
> - Make backgrounds truly transparent where the file says "transparent".
>
> After each section, run `python3 tools/media/sync.py` from the repo root and fix anything it reports. Only add or replace files under `apps/mobile/assets/` and the generated `apps/mobile/src/design-system/media.ts`; change nothing else.
>
> When a section is done, commit it with the message "Media: <section or group name>" and push it with `git push -u origin media/v2`. Then tick that section in the checklist at the end of PROMPTS.md.

If the agent can't save generated images to disk itself, generate them in Antigravity and save each one to the path in PROMPTS.md yourself. Then run the sync script, commit and push as above.

## 3. Tell Claude

Say "media pushed" (or which sections are done). Claude will:
- fetch `media/v2` and look at every image against the brand kit;
- ask for redos of any that don't fit, naming the file and what to change;
- merge the branch into `sprint-7/new-look` and check the screens with the real images in place.

Pushing one section at a time is fine. Start with section 1 (ingredient photos): the pantry screens are built first and show one on every row. There are 177 of them, so push them a group at a time (1.1, 1.2, and so on). Then sections 2 to 4, then 5.
