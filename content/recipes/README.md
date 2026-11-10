# Curated recipes

One YAML file per dish. `python3 tools/content/build.py` validates every file against the ingredient
catalog, techniques and the database enums, then regenerates `supabase/seed.sql`.

**Review rule (REC-01):** a dish is published only when `review_status: approved`, which means the culinary lead
has cooked it and checked quantities, timings, cues and safety notes. Everything here starts as `draft`
and stays invisible to users until approved.

## Format

```yaml
slug: jeera-aloo                 # unique, lowercase-hyphenated, same as the file name
title: Jeera Aloo
titles: {hi: जीरा आलू, hi-Latn: Jeera Aloo}
description: One paragraph.
cuisine_region: generic_north
course: side                     # breakfast, main, side, snack, dessert, drink, tiffin, chutney_pickle, component
diet: vegan                      # veg, eggetarian, nonveg, jain, vegan (checked against the ingredients)
base_servings: 4
prep_time_min: 10
cook_time_min: 20
difficulty: 1                    # 1-5
spice_level: 2                   # 1-5
equipment: [pressure_cooker, kadai]
tags: [quick, kids_friendly]
flavor_profile: {rich: 0.3, heat: 0.4, acid: 0.2, crunch: 0.3, starch: 0.9, sweet: 0}
food_groups: [sabzi]
review_status: draft
ingredients:
  - {ingredient: potato, qty: 500, unit: g, local: 4 medium aloo, role: base}
  - {ingredient: cumin seeds, qty: 4, unit: g, local: 2 chhota chammach, role: spice, group: Tadka}
  - {ingredient: ghee, qty: 13, unit: g, optional: true, substitutes: [{ingredient: refined oil, ratio: 1}]}
steps:
  - text: Instruction in plain English or Hinglish.
    technique: tadka             # slug from content/catalog/techniques.yaml
    minutes: 5                   # or seconds:
    timer: true                  # start a timer automatically (needs minutes/seconds)
    whistles: 3                  # pressure-cooker whistles (needs technique pressure_cook)
    cue: How to know it is right.
    safety: Food-safety note. Never shortened or softened by the model.
    branch: {age_group: child, action: Take out a portion before adding chilli}
variation_rules:
  - {type: substitute, condition: {missing: curd}, action: {use: buttermilk, qty_ratio: 3}, note: ...}
```
