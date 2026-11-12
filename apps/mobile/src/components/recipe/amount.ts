// How an ingredient amount reads for the number of people being cooked for: the recipe's own spoken measure when
// the servings match, otherwise scaled and turned into katori / chammach / chutki where the catalog knows the weight.
import { catalogEntry } from "@/data/catalog";
import { useQuery } from "@tanstack/react-query";

import { amountChanges, type AmountChange } from "@/domain/learning";
import { inLocalUnits, prettyQty, scaleQty, type LocalAmount, type PieceSize, type RecipeDoc, type RecipeIngredientDoc } from "@/domain/recipes";
import { getLocale as locale, t, type StringKey } from "@/i18n";
import { services } from "@/services";

const MEASURES = ["katori", "cup", "chammach", "chhota_chammach", "chutki", "clove", "inch"];

function count(qty: number, size?: PieceSize): string {
  return size ? `${prettyQty(qty)} ${t(`measure.${size}` as StringKey)}` : prettyQty(qty);
}

/** "1 big + 1 small", "½", "3 cloves", "1 katori". */
export function localLabel(local: LocalAmount): string {
  if (local.unit === "piece") return local.and ? `${count(local.qty, local.size)} + ${count(local.and.qty, local.and.size)}` : count(local.qty, local.size);
  const label = MEASURES.includes(local.unit) ? t(`measure.${local.unit}` as StringKey) : local.unit;
  return `${prettyQty(local.qty)} ${label}`;
}

export function amountLabel(ing: Pick<RecipeIngredientDoc, "ingredient" | "qty" | "unit" | "local">, base: number, servings: number): string {
  const entry = catalogEntry(ing.ingredient);
  const sized = entry?.category === "vegetable" || entry?.category === "fruit";
  const local = inLocalUnits(scaleQty(ing.qty, base, servings), ing.unit, entry?.measures, sized);
  // The recipe's own Hinglish words ("1 bada pyaaz") for Hinglish, when cooking for the servings it was written for.
  if (servings === base && ing.local && !/\d\s*(g|ml)\b/.test(ing.local) && locale() === "hinglish") return ing.local;
  return localLabel(local);
}

/** The amount with a remembered change applied (KIT-104): "more garlic" is one step up, never a rewrite. */
export function rememberedAmount(
  ing: Pick<RecipeIngredientDoc, "ingredient" | "qty" | "unit" | "local">,
  base: number,
  servings: number,
  change: AmountChange | undefined,
): { label: string; note: string | null } {
  if (!change) return { label: amountLabel(ing, base, servings), note: null };
  return {
    label: amountLabel({ ...ing, qty: ing.qty * change.factor, local: undefined }, base, servings),
    note: t(change.amount === "more" ? "recipe.more" : "recipe.less"),
  };
}

/** Remembered changes for this dish, from the household's memories. */
export function useAmountChanges(householdId: string | null, doc: Pick<RecipeDoc, "id" | "parent_id" | "slug"> | undefined): Map<string, AmountChange> {
  const memories = useQuery({
    queryKey: ["memories", householdId],
    queryFn: () => services.preference.listMemories(householdId!),
    enabled: !!householdId,
  });
  if (!doc || !memories.data) return new Map();
  return amountChanges(memories.data, [doc.id, doc.parent_id, doc.slug].filter((x): x is string => !!x));
}
