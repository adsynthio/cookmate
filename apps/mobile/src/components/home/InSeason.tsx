// U15: "In season now" on Home: this month's vegetables and fruit as small pills with their picture. Tapping one finds
// dishes with it. Seasonal produce is fresher and cheaper, and it's how Indian kitchens already cook.
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { FoodPhoto } from "@/design-system/FoodPhoto";
import { PressableScale } from "@/design-system/motion";
import { SectionHeader, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { inSeason, monthOf } from "@/domain/seasons";
import { getLocale, t } from "@/i18n";

export function InSeason({ today }: { today: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const locale = getLocale();
  const items = inSeason(monthOf(today)).slice(0, 8);
  if (!items.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader title={t("home.season.title")} dot={undefined} />
      <Text variant="caption" muted>
        {t("home.season.body")}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((key) => {
          const entry = catalogEntry(key);
          const name = displayName(entry, key, locale);
          return (
            <PressableScale
              key={key}
              accessibilityRole="button"
              accessibilityLabel={t("home.season.find", { item: name })}
              onPress={() => router.push({ pathname: "/search", params: { q: key } })}
              style={[styles.pill, shadow.card, { backgroundColor: colors.surface }]}
            >
              <FoodPhoto name={key} category={entry?.category} size={36} round />
              <Text variant="label" weight={600}>
                {name}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: 4, paddingRight: space.lg },
  pill: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48, borderRadius: radius.pill, paddingLeft: 6, paddingRight: space.lg },
});
