// KIT-171: this week's plate on You. Meals cooked to the end, counted by food group as bars that fill toward a gentle
// weekly aim; no calories anywhere. This week / Last week, then at most two tips for next week.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Enter, PressableScale, ProgressBar } from "@/design-system/motion";
import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { WEEKLY_AIM, aimShare, weeklyTips, type FoodGroup, type PlateWeek } from "@/domain/plate";
import { t, type StringKey } from "@/i18n";
import { services } from "@/services";

/** The order on the card: the groups with an aim first, then the ones that just come along. */
const ROWS: FoodGroup[] = ["dal", "sabzi", "greens", "dairy", "fruit", "protein", "grain"];

export function PlateCard({ householdId }: { householdId: string }) {
  const { colors } = useTheme();
  const [which, setWhich] = useState<0 | 1>(0);
  const plate = useQuery({ queryKey: ["plate", householdId], queryFn: () => services.cooking.weeklyPlate(householdId, 2) });
  const week: PlateWeek | undefined = plate.data?.[which];
  if (!plate.data) return null;
  const tips = week ? weeklyTips(week) : [];
  const tone = (g: FoodGroup) => (g === "greens" || g === "sabzi" ? colors.primary : g === "dal" || g === "protein" ? colors.accent : colors.inkSecondary);

  return (
    <Enter>
      <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]}>
        <View style={{ gap: space.sm }}>
          <View style={{ gap: 2 }}>
            <Text variant="heading">{which === 0 ? t("plate.title") : t("plate.lastTitle")}</Text>
            <Text variant="label" muted>
              {week?.meals === 1 ? t("plate.meal") : t("plate.meals", { n: week?.meals ?? 0 })}
            </Text>
          </View>
          <View style={[styles.segment, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="radiogroup">
            {([0, 1] as const).map((i) => {
              const on = which === i;
              const label = i === 0 ? t("plate.thisWeek") : t("plate.lastWeek");
              return (
                <PressableScale
                  key={i}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={label}
                  onPress={() => setWhich(i)}
                  style={[styles.segmentItem, on && [shadow.card, { backgroundColor: colors.primary }]]}
                >
                  <Text variant="caption" weight={600} color={on ? colors.onPrimary : colors.inkSecondary}>
                    {label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {!week?.meals ? (
          <Text muted>{t("plate.empty")}</Text>
        ) : (
          <View style={{ gap: space.md }}>
            {ROWS.map((g) => {
              const aim = WEEKLY_AIM[g];
              const n = week.counts[g];
              return (
                <View key={g} style={{ gap: 6 }} accessible accessibilityLabel={`${t(`plate.group.${g}` as StringKey)}: ${aim ? t("plate.ofAim", { n, aim }) : t("plate.times", { n })}`}>
                  <View style={styles.between}>
                    <Text variant="label">{t(`plate.group.${g}` as StringKey)}</Text>
                    <Text variant="label" weight={600} color={n ? colors.ink : colors.inkSecondary}>
                      {aim ? t("plate.ofAim", { n, aim }) : t("plate.times", { n })}
                    </Text>
                  </View>
                  <ProgressBar value={aimShare(week, g)} color={tone(g)} track={colors.surfaceHigh} height={8} />
                </View>
              );
            })}
          </View>
        )}

        {week?.meals ? (
          tips.length ? (
            <View style={[styles.tips, { backgroundColor: colors.primaryPale }]}>
              <Text variant="overline" color={colors.primaryText}>
                {t("plate.nextWeek").toUpperCase()}
              </Text>
              {tips.map((tip) => (
                <View key={tip} style={styles.tip}>
                  <Icon name="leaf" size={16} color={colors.primaryText} />
                  <Text color={colors.primaryText} style={{ flex: 1 }}>
                    {t(`plate.tip.${tip}` as StringKey)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.tip}>
              <Icon name={week.meals >= 3 ? "checkCircle" : "sparkle"} size={16} color={colors.primaryText} />
              <Text variant="label" color={colors.primaryText} style={{ flex: 1 }}>
                {week.meals >= 3 ? t("plate.balanced") : t("plate.thin")}
              </Text>
            </View>
          )
        ) : null}
        <Text variant="caption" muted>
          {t("plate.note")}
        </Text>
      </View>
    </Enter>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.cardLg, padding: space.lg, gap: space.md },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  segment: { flexDirection: "row", alignSelf: "flex-start", borderRadius: radius.pill, padding: 3, gap: 2 },
  segmentItem: { borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 8 },
  tips: { borderRadius: radius.item, padding: space.md, gap: space.sm },
  tip: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
});
