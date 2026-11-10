// How an ingredient amount reads for the number of people being cooked for: the recipe's own spoken measure when
// the servings match, otherwise scaled and turned into katori / chammach / chutki where the catalog knows the weight.
import { catalogEntry } from "@/data/catalog";
import { inLocalUnits, prettyQty, scaleQty, type RecipeIngredientDoc } from "@/domain/recipes";
import { t, type StringKey } from "@/i18n";

const MEASURES = ["katori", "cup", "chammach", "chhota_chammach", "chutki"];

export function amountLabel(ing: Pick<RecipeIngredientDoc, "ingredient" | "qty" | "unit" | "local">, base: number, servings: number): string {
  if (servings === base && ing.local) return ing.local;
  const local = inLocalUnits(scaleQty(ing.qty, base, servings), ing.unit, catalogEntry(ing.ingredient)?.measures);
  if (local.unit === "piece") return prettyQty(local.qty);
  const label = MEASURES.includes(local.unit) ? t(`measure.${local.unit}` as StringKey) : local.unit;
  return `${prettyQty(local.qty)} ${label}`;
}
