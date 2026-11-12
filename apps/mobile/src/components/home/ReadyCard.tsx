// "Ready to eat": when cooked food is waiting in the kitchen, Home says so before suggesting anything new.
// Leftover kadhi and rice is kadhi chawal, heated in five minutes. "Other ideas" opens the leftover's page.
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { itemName } from "@/components/kitchen/names";
import { Icon } from "@/design-system/icons";
import { dishImage, ingredientImage } from "@/design-system/media";
import { Enter } from "@/design-system/motion";
import { Button, Photo, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { daysLeft } from "@/domain/pantry";
import { needsRiceCare, readyMeal, leftoverKind } from "@/domain/leftovers";
import { t, type StringKey } from "@/i18n";
import type { PantryItem } from "@/services";

/** A photo for the kind of dish, from the recipes we have pictures of. */
const KIND_PHOTO: Partial<Record<string, string>> = {
  kadhi: "kadhi-pakora", dal: "dal-tadka", rajma: "rajma", khichdi: "moong-dal-khichdi",
  poha: "kanda-poha", sabzi: "jeera-aloo", curry: "matar-paneer",
};

export function ReadyCard({ items }: { items: PantryItem[] }) {
  const { colors } = useTheme();
  const router = useRouter();
  const fresh = items
    .map((i) => ({ ...i, daysLeft: i.expiryDate ? daysLeft(i.expiryDate) : null }))
    .filter((i) => i.daysLeft === null || i.daysLeft >= 0);
  const meal = readyMeal(fresh);
  if (!meal) return null;
  const dish = itemName(meal.main);
  const title = t(`ready.${meal.key}` as StringKey, { dish });
  const uses = [meal.main, meal.side].filter((x): x is NonNullable<typeof x> => !!x).map(itemName).join(" + ");
  const rice = meal.side && needsRiceCare(leftoverKind(meal.side.name));

  return (
    <Enter>
      <View style={[styles.card, shadow.card, { backgroundColor: colors.primary }]}>
        <View style={styles.row}>
          <Photo source={dishImage(KIND_PHOTO[leftoverKind(meal.main.name)] ?? "") ?? ingredientImage(null, "leftover")} size={56} round />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="overline" color={colors.onPrimary} style={{ opacity: 0.85 }}>
              {t("ready.overline").toUpperCase()}
            </Text>
            <Text variant="heading" color={colors.onPrimary}>
              {title}
            </Text>
          </View>
        </View>
        <Text color={colors.onPrimary}>{t("ready.body", { items: uses })}</Text>
        <View style={styles.note}>
          <Icon name="flame" size={16} color={colors.onPrimary} />
          <Text variant="label" color={colors.onPrimary} style={{ flex: 1 }}>
            {rice ? t("ready.heatRice") : t("left.reheat")}
          </Text>
        </View>
        <Button kind="light" icon="sparkle" label={t("ready.ideas")} onPress={() => router.push(`/pantry/${meal.main.id}`)} />
      </View>
    </Enter>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.cardLg, padding: space.lg, gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  note: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
});
