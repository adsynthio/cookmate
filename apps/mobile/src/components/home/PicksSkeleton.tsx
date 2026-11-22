// U5: while picks load, two softly breathing cards in the shape of the real ones, instead of a spinner. The page
// keeps its layout, so nothing jumps when the dishes arrive.
import { StyleSheet, View, type DimensionValue } from "react-native";

import { Breathe } from "@/design-system/motion";
import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { t } from "@/i18n";

export function PicksSkeleton() {
  const { colors } = useTheme();
  const bar = (width: DimensionValue, height: number) => (
    <View style={{ width, height, borderRadius: height / 2, backgroundColor: colors.surfaceMuted }} />
  );
  return (
    <View style={{ gap: space.md }} accessibilityLiveRegion="polite" accessibilityLabel={t("state.loading.home")}>
      <Text variant="caption" muted>
        {t("state.loading.home")}
      </Text>
      {[104, 88].map((size, i) => (
        <Breathe key={size} style={[styles.card, shadow.card, { backgroundColor: colors.surface, opacity: i ? 0.8 : 1 }]}>
          <View style={styles.row}>
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceMuted }} />
            <View style={styles.lines}>
              {bar(76, 18)}
              {bar("80%", 22)}
              {bar("95%", 12)}
              {bar("60%", 12)}
            </View>
          </View>
          {bar("100%", 44)}
        </Breathe>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.cardLg, padding: space.lg, gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  lines: { flex: 1, gap: space.sm },
});
