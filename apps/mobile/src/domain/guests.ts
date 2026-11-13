// Sprint 13 S10: guests and tiffin.
//   * "4 guests at 8": a simple menu everyone at the table can eat (a main, a dal, a dry side when there is one, and
//     rotis), chosen from what the kitchen can cook with the fewest things to buy, scaled to everyone, with one
//     timeline worked back from dinner across all the dishes.
//   * Tonight's dinner suggests tomorrow's tiffin: cook a little extra dal and it becomes dal paratha.
// No React, no network.
import { planDinner, type PlanItem, type PlanStep } from "./dinnerPlan.ts";

export type MenuDish = {
  slug: string;
  course: string;
  diet: string;
  food_groups?: string[];
  steps: (PlanStep & { text: string })[];
};

const DIET_ALLOWS: Record<string, string[]> = {
  nonveg: ["nonveg", "eggetarian", "veg", "jain", "vegan"],
  eggetarian: ["eggetarian", "veg", "jain", "vegan"],
  veg: ["veg", "jain", "vegan"],
  jain: ["jain"],
  vegan: ["vegan"],
};

export type GuestMenu = { main: string; dal: string | null; side: string | null; rotis: number };

/**
 * The menu. `needs(slug)` is how many things a dish still needs from the shop (S8's stillNeeds); fewer wins, then the
 * shorter dish. Guests' diets are unknown, so a veg menu is chosen unless `diets` says otherwise; every dish suits
 * every diet given.
 */
export function guestMenu(dishes: MenuDish[], diets: string[], people: number, needs: (slug: string) => number): GuestMenu | null {
  const fits = (d: MenuDish) => diets.every((x) => (DIET_ALLOWS[x] ?? []).includes(d.diet));
  const time = (d: MenuDish) => d.steps.reduce((a, s) => a + (s.minutes ?? (s.seconds ? s.seconds / 60 : 2)), 0);
  const best = (pool: MenuDish[]) => [...pool].sort((a, b) => needs(a.slug) - needs(b.slug) || time(a) - time(b))[0] ?? null;
  const isDal = (d: MenuDish) => !!d.food_groups?.includes("dal") && !d.food_groups?.includes("grain");
  const ok = dishes.filter(fits);
  // The main is a curry or sabzi: not a dal, and not a one-pot meal like khichdi (dal + grain).
  const main = best(ok.filter((d) => d.course === "main" && !isDal(d) && !d.food_groups?.includes("grain")));
  if (!main) return null;
  const dal = best(ok.filter((d) => (d.course === "main" || d.course === "component") && isDal(d) && d.slug !== main.slug && !/boiled/.test(d.slug)));
  const side = best(ok.filter((d) => d.course === "side"));
  return { main: main.slug, dal: dal?.slug ?? null, side: side?.slug ?? null, rotis: people * 3 };
}

export type MenuItem = PlanItem & { dish: string };

/**
 * One timeline for the whole menu: each dish worked back from dinner, rotis with the main. With one stove, dishes
 * that would overlap are not rearranged; the plan shows them side by side and the cook knows the kitchen.
 */
export function menuTimeline(
  menu: GuestMenu,
  bySlug: (slug: string) => MenuDish | undefined,
  dinner: number,
  stoves: number,
): { start: number; items: MenuItem[] } {
  const out: MenuItem[] = [];
  let start = dinner;
  for (const slug of [menu.main, menu.dal, menu.side]) {
    const d = slug ? bySlug(slug) : undefined;
    if (!d) continue;
    const plan = planDinner(d.steps, (n) => {
      const s = d.steps[n - 1];
      return s ? (s.seconds ?? (s.minutes ? s.minutes * 60 : null)) : null;
    }, dinner, { stoves, rotis: slug === menu.main ? menu.rotis : 0 });
    start = Math.min(start, plan.start);
    // "Dinner is ready" once, at the end.
    out.push(...plan.items.filter((i) => i.kind !== "serve").map((i) => ({ ...i, dish: d.slug })));
  }
  out.push({ at: dinner, kind: "serve", dish: menu.main });
  out.sort((a, b) => a.at - b.at);
  return { start, items: out };
}

// --- tomorrow's tiffin --------------------------------------------------------------------------------------------

export type TiffinIdea = "dal_paratha" | "rajma_rice" | "aloo_roll" | "paneer_roll" | "chicken_roll" | "khichdi_cutlet" | "kadhi_rice";

const TIFFIN: Record<string, TiffinIdea> = {
  "dal-tadka": "dal_paratha",
  "plain-dal": "dal_paratha",
  rajma: "rajma_rice",
  "jeera-aloo": "aloo_roll",
  "matar-paneer": "paneer_roll",
  "chicken-curry": "chicken_roll",
  "moong-dal-khichdi": "khichdi_cutlet",
  "kadhi-pakora": "kadhi_rice",
};

/** What a little extra of tonight's dish becomes in tomorrow's tiffin, and how many more portions to cook. */
export function tiffinFrom(slug: string, tiffins: number): { idea: TiffinIdea; extra: number } | null {
  const idea = TIFFIN[slug];
  return idea && tiffins > 0 ? { idea, extra: tiffins } : null;
}
