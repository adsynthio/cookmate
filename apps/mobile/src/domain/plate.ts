// Health (KIT-170/171): the weekly plate counts the meals cooked this week by food group, never calories, and gives at
// most two gentle tips for next week; the balance tip suggests one thing to put beside a dish. Tips follow the spirit of
// ICMR-NIN's "My Plate for the Day" (dal or other protein, vegetables and greens, fruit, curd or milk at most meals);
// they make no health claims and are only about what to add, never what to cut.

export const FOOD_GROUPS = ["dal", "sabzi", "greens", "fruit", "dairy", "protein", "grain"] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

export type PlateCounts = Record<FoodGroup, number>;
export type PlateWeek = { weekStart: string; meals: number; counts: PlateCounts };
export type CookedMeal = { completedAt: string | Date; groups: readonly string[] };

/** How many meals in a week of about 10 home-cooked meals should bring each group; grain comes with nearly every meal. */
export const WEEKLY_AIM: Partial<Record<FoodGroup, number>> = { dal: 4, sabzi: 5, greens: 2, dairy: 3, fruit: 2 };
/** Below this many meals the week says too little to give tips. */
export const MIN_MEALS_FOR_TIPS = 3;

const IST_OFFSET_MS = 330 * 60 * 1000;

export function emptyCounts(): PlateCounts {
  return { dal: 0, sabzi: 0, greens: 0, fruit: 0, dairy: 0, protein: 0, grain: 0 };
}

/** Monday of the week (India time) a moment falls in, as YYYY-MM-DD; matches the database's `weekly_plate`. */
export function weekStart(when: string | Date | number): string {
  const ist = new Date(new Date(when).getTime() + IST_OFFSET_MS);
  const day = (ist.getUTCDay() + 6) % 7; // Monday = 0
  ist.setUTCDate(ist.getUTCDate() - day);
  return ist.toISOString().slice(0, 10);
}

/** The Monday `n` weeks before the week of `when`. */
export function weeksBefore(when: string | Date | number, n: number): string {
  const d = new Date(`${weekStart(when)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7 * n);
  return d.toISOString().slice(0, 10);
}

function isGroup(g: string): g is FoodGroup {
  return (FOOD_GROUPS as readonly string[]).includes(g);
}

/** Group meals into weeks, newest first; the last `weeks` weeks up to `now` are always there, even when empty. */
export function plateWeeks(meals: readonly CookedMeal[], now: Date | number = Date.now(), weeks = 4): PlateWeek[] {
  const out: PlateWeek[] = Array.from({ length: weeks }, (_, i) => ({ weekStart: weeksBefore(now, i), meals: 0, counts: emptyCounts() }));
  const byWeek = new Map(out.map((w) => [w.weekStart, w]));
  for (const m of meals) {
    const w = byWeek.get(weekStart(m.completedAt));
    if (!w) continue;
    w.meals += 1;
    for (const g of new Set(m.groups)) if (isGroup(g)) w.counts[g] += 1;
  }
  return out;
}

/** 0..1 of the weekly aim reached, for the bars (groups without an aim show their share of meals). */
export function aimShare(week: PlateWeek, group: FoodGroup): number {
  const aim = WEEKLY_AIM[group] ?? Math.max(week.meals, 1);
  return Math.min(1, week.counts[group] / aim);
}

export type PlateTip = "greens" | "sabzi" | "dal" | "dairy" | "fruit";
const TIP_ORDER: PlateTip[] = ["greens", "dal", "sabzi", "dairy", "fruit"];

/** At most two tips: the groups furthest short of the aim, scaled to how many meals were cooked. Nothing for a thin week. */
export function weeklyTips(week: PlateWeek, max = 2): PlateTip[] {
  if (week.meals < MIN_MEALS_FOR_TIPS) return [];
  const scale = Math.min(1, week.meals / 10);
  const short = TIP_ORDER.map((g) => ({ g, gap: (WEEKLY_AIM[g] ?? 0) * scale - week.counts[g] }))
    .filter((x) => x.gap >= 1)
    .sort((a, b) => b.gap - a.gap || TIP_ORDER.indexOf(a.g) - TIP_ORDER.indexOf(b.g));
  return short.slice(0, max).map((x) => x.g);
}

export type BalanceTip = "addVeg" | "addProtein" | "addProteinVegan";

/**
 * KIT-170: one thing to put beside this dish, or nothing when it is already balanced. A dish without dal, egg, meat,
 * paneer or curd gets "dal or dahi on the side" (dal or chana for vegan dishes); one without vegetables gets "a salad
 * or a sabzi". Sides and drinks get no tip: they go with something else.
 */
export function balanceTip(groups: readonly string[] | null | undefined, opts: { course?: string; diet?: string } = {}): BalanceTip | null {
  if (!groups?.length) return null;
  if (opts.course && !["main", "breakfast", "snack", "tiffin"].includes(opts.course)) return null;
  const has = (...g: FoodGroup[]) => g.some((x) => groups.includes(x));
  if (!has("dal", "protein", "dairy")) return opts.diet === "vegan" ? "addProteinVegan" : "addProtein";
  if (!has("sabzi", "greens")) return "addVeg";
  return null;
}

/** The database's `weekly_plate` rows as weeks, with the weeks it had nothing for filled in. */
export function weeksFromRows(
  rows: readonly { week_start: string; meals: number; food_groups: unknown }[],
  now: Date | number = Date.now(),
  weeks = 4,
): PlateWeek[] {
  const out = plateWeeks([], now, weeks);
  for (const r of rows) {
    const w = out.find((x) => x.weekStart === r.week_start.slice(0, 10));
    if (!w) continue;
    w.meals = r.meals;
    const groups = (r.food_groups ?? {}) as Record<string, unknown>;
    for (const g of FOOD_GROUPS) w.counts[g] = typeof groups[g] === "number" ? (groups[g] as number) : 0;
  }
  return out;
}
