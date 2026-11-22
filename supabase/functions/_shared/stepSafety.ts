// GENERATED from apps/mobile/src/domain/stepSafety.ts by scripts/sync-shared.py. Do not edit; edit the source and re-run.
// Instructions no recipe may give, because they can make someone ill (raw egg, undercooked meat or rajma, food left
// out overnight...), shared by the recipe safety gate (recipeSafety.ts) and the new-dish check (invent.ts) so the two
// always agree. Everyday Indian methods are not hazards: fermenting idli or jalebi batter overnight, setting curd
// overnight, half-cooking rice for biryani, frying onions till slightly pink, "no need to soak" moong dal, frying in
// oil kept from the last batch. Each was refusing good AI recipes (seen live on 21 Nov 2026 with Motichoor laddu).
// Pure TypeScript with no imports (copied to supabase/functions/_shared by scripts/sync-shared.py).

/**
 * Longest step text: about four sentences. A writer that put a whole method in one step (seen live on 21 Nov 2026)
 * failed twice at 400 because the retry only said "too long"; now the limit is roomier and the message says so.
 */
export const MAX_STEP_CHARS = 600;

/** Meat, fish, egg and kidney beans: where "pink", "rare" and "half-cooked" are real hazards. */
const PROTEIN = "chicken|mutton|meat|keema|lamb|goat|pork|beef|fish|prawns?|shrimps?|crabs?|eggs?|liver|kidney beans?|rajma";
const HAS_PROTEIN = new RegExp(`\\b(${PROTEIN})\\b`);
/** The meat (or egg, or rajma) itself left half-cooked: "half-cooked chicken", "fry the chicken until half cooked". */
const PROTEIN_HALF_COOKED = new RegExp(
  `\\b(half[- ]cooked|undercooked) (${PROTEIN})\\b|\\b(${PROTEIN})\\b[^.]{0,30}\\b(half[- ]cooked|undercook(ed)?)\\b`,
);
/** Par-cooking these is a method (rice for biryani, potatoes before frying), not a shortcut. */
const PARCOOK = /\b(rice|chawal|basmati|biryani|pulao|pasta|noodles|potato(es)?|vegetables?|veggies|par[- ]?boil\w*)\b/;
/** Left out overnight on purpose: fermenting batter, setting curd, soaking or sprouting. */
const ON_PURPOSE = /\b(ferment\w*|batter|to set|until (it )?sets?|soak\w*|sprout\w*)\b/;

/** `protein`: the step or the recipe has meat, fish, egg or rajma. */
/** True when one of these ingredient names is meat, fish, egg or rajma. */
export const anyProtein = (names: string[]) => names.some((n) => HAS_PROTEIN.test(n.toLowerCase()));

type Rule = { re: RegExp; what: string; fine?: (step: string, protein: boolean) => boolean };
const RULES: Rule[] = [
  { re: /\braw egg\b/, what: "raw egg" },
  { re: /\b(half[- ]cooked|undercook(ed)?)\b/, what: "undercooked food", fine: (t) => PARCOOK.test(t) && !PROTEIN_HALF_COOKED.test(t) },
  // Onions fried "till slightly pink" are fine; anything else left pink (in the middle, inside) is not.
  { re: /\b(slightly pink|still pink|pink (in the|inside)|rare)\b/, what: "undercooked food", fine: (t) => /\bonions?\b/.test(t) && !HAS_PROTEIN.test(t) && !/\b(in the middle|inside|juicy)\b/.test(t) },
  { re: /\brunny (yolk|egg)|\b(yolk|egg)s? (is |are )?(still )?(runny|soft in the middle)|\bsoft[- ]boiled\b/, what: "a runny egg" },
  // Skipping the soak or the boil only matters for rajma, meat, fish and egg (anywhere in the recipe); moong dal
  // needs no soaking.
  { re: /\bskip (the )?(soak|soaking|boil|boiling)\b|\bno need to (soak|boil|cook|reheat)\b/, what: "skipping soaking or boiling", fine: (_t, protein) => !protein },
  { re: /\b(room temperature|out) overnight\b|\bleave (it )?out overnight\b/, what: "food left out overnight", fine: (t) => ON_PURPOSE.test(t) },
  { re: /\breheat (it )?(again|twice|a second time)\b/, what: "reheating more than once" },
  { re: /\blukewarm\b.*\b(leftover|reheat)|\b(leftover|reheat)\b.*\blukewarm\b/, what: "lukewarm leftovers" },
  { re: /\b(alcohol|wine|beer|rum|vodka|brandy|whisky)\b/, what: "alcohol" },
];

/**
 * The hazards a step tells the cook to do, as short names ("raw egg"). Doneness checks ("cook until no pink inside",
 * "no runny egg left") and warnings ("never leave rice out overnight") are not instructions. `recipeHasProtein`: the
 * recipe uses meat, fish, egg or rajma, so "skip the boiling" is a hazard even in a step that doesn't name them.
 */
export function unsafeInstructions(text: string, recipeHasProtein = false): string[] {
  const told = text
    .toLowerCase()
    .replace(/\b(no|not|without any|never|nothing) (longer )?(pink|runny|raw|undercooked|half[- ]cooked)( (egg|yolk|inside|in the middle))?/g, "");
  if (/\b(never|don't|do not|avoid)\b/.test(told)) return [];
  const protein = recipeHasProtein || HAS_PROTEIN.test(told);
  return [...new Set(RULES.filter((r) => r.re.test(told) && !r.fine?.(told, protein)).map((r) => r.what))];
}
