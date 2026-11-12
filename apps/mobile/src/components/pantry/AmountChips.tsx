// One-tap amounts for an item ("500 g · 1 kg · 2 kg"), shown wherever Cookmate asks "How much?".
import { StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { Chip, Text } from "@/design-system/primitives";
import { space } from "@/design-system/tokens";
import { amountChoices, type Amount } from "@/domain/amounts";
import { t, type StringKey } from "@/i18n";

export function amountLabel(a: Pick<Amount, "n" | "word">): string {
  return t(`amt.${a.word}` as StringKey, { n: a.n });
}

export function AmountChips({
  ingredientKey,
  quantity,
  unit,
  onPick,
  ask,
}: {
  ingredientKey: string | null;
  quantity: number | null;
  unit: string | null;
  onPick: (a: Amount) => void;
  /** Show the "How much?" prompt above the chips. */
  ask?: boolean;
}) {
  const choices = amountChoices(catalogEntry(ingredientKey));
  if (!choices.length) return null;
  return (
    <View style={{ gap: space.xs }}>
      {ask ? (
        <Text variant="label" muted>
          {t("amt.howMuch")}
        </Text>
      ) : null}
      <View style={styles.row} accessibilityRole="radiogroup">
        {choices.map((a) => (
          <Chip
            key={`${a.quantity}${a.unit}`}
            label={amountLabel(a)}
            selected={quantity === a.quantity && unit === a.unit}
            onPress={() => onPick(a)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
