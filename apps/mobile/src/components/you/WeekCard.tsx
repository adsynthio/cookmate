// Your kitchen week (D3): a warm look back at the last seven days. Shown on You, and on Home on Sundays. A week with
// no cooking shows nothing; there is no streak to break and nothing to feel bad about.
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Enter } from "@/design-system/motion";
import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { recapLines } from "@/domain/recap";
import { getLocale, t } from "@/i18n";
import { services } from "@/services";

export function WeekCard({ householdId }: { householdId: string }) {
  const { colors } = useTheme();
  const locale = getLocale();
  const recap = useQuery({ queryKey: ["weekRecap", householdId], queryFn: () => services.cooking.weekRecap(householdId) });
  const text = recap.data
    ? recapLines(recap.data, locale, (d) => (locale === "hi" ? d.titles?.hi : locale === "hinglish" ? d.titles?.["hi-Latn"] : null) ?? d.title)
    : null;
  if (!text) return null;
  return (
    <Enter>
      <View style={[styles.card, { backgroundColor: colors.primary }]} accessibilityRole="summary">
        <View style={styles.row}>
          <View style={[styles.well, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
            <Icon name="sparkle" size={18} color={colors.onPrimary} />
          </View>
          <Text variant="overline" color={colors.onPrimary} style={{ opacity: 0.85 }}>
            {t("recap.overline").toUpperCase()}
          </Text>
        </View>
        <Text variant="title" color={colors.onPrimary}>
          {text.headline}
        </Text>
        {text.lines.map((l) => (
          <View key={l} style={styles.line}>
            <Icon name="check" size={16} color={colors.onPrimary} />
            <Text color={colors.onPrimary} style={{ flex: 1 }}>
              {l}
            </Text>
          </View>
        ))}
      </View>
    </Enter>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.cardLg, padding: space.lg, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  well: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
