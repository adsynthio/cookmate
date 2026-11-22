// U27: while the cook types on Add items, what Cookmate already understands, worked out on the phone (no AI, no
// credits): a chip per item with its picture and amount. Something it doesn't know yet gets a dashed chip; the full
// read-back still comes on "Check items", so nothing here is final.
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { catalogEntry, catalogIndex } from "@/data/catalog";
import { FoodPhoto } from "@/design-system/FoodPhoto";
import { Enter } from "@/design-system/motion";
import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { displayName, formatQuantity } from "@/domain/kitchen";
import { parsePantryText } from "@/domain/pantryParse";
import { getAppLocale, getLocale, t } from "@/i18n";

export function LivePreview({ text }: { text: string }) {
  const { colors } = useTheme();
  // A beat after the last key, so chips don't flicker on every letter.
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const id = setTimeout(() => setSettled(text), 250);
    return () => clearTimeout(id);
  }, [text]);
  const items = useMemo(() => (settled.trim() ? parsePantryText(settled, catalogIndex).slice(0, 40) : []), [settled]);
  if (!items.length) return null;
  const locale = getLocale();
  const app = getAppLocale();
  return (
    <View style={{ gap: space.sm }} accessibilityLiveRegion="polite">
      <Text variant="overline" muted>
        {t("kitchen.preview.title").toUpperCase()}
      </Text>
      <View style={styles.chips}>
        {items.map((it, i) => {
          const entry = it.ingredientKey ? catalogEntry(it.ingredientKey) : undefined;
          const known = !!it.ingredientKey;
          const name = known ? displayName(entry, it.ingredientKey!, locale) : it.said;
          const amount = it.out ? t("kitchen.preview.out") : formatQuantity(it.quantity, it.unit, app);
          return (
            <Enter key={`${i}-${it.said}`}>
              <View
                style={[
                  styles.chip,
                  { backgroundColor: colors.surface, borderColor: known ? colors.line : colors.accent, borderStyle: known ? "solid" : "dashed" },
                ]}
                accessible
                accessibilityLabel={amount ? `${name}, ${amount}` : name}
              >
                <FoodPhoto name={it.ingredientKey ?? it.said} category={entry?.category} size={24} round />
                <Text variant="label" weight={600} numberOfLines={1}>
                  {name}
                </Text>
                {amount ? (
                  <Text variant="label" muted numberOfLines={1}>
                    {amount}
                  </Text>
                ) : null}
              </View>
            </Enter>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingLeft: 4, paddingRight: space.md, paddingVertical: 4, maxWidth: "100%" },
});
