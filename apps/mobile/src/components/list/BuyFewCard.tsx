// Sprint 13 S8 on the List tab: "Buy paneer and peas, cook 5 new dishes". The smallest shop that opens up the most
// dishes for everyone eating here, with one tap to add it to the list. Hidden when nothing is worth it, or once the
// items are on the list.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { recipeDocs } from "@/data/recipes";
import { Icon } from "@/design-system/icons";
import { Button, Card, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { bestBuys } from "@/domain/buyFew";
import { displayName } from "@/domain/kitchen";
import { recipeTitle, toRankRecipe } from "@/domain/recipes";
import { getLocale, t } from "@/i18n";
import { services } from "@/services";
import { pantryEntries, STAPLES } from "@/services/picks";

export function BuyFewCard({ householdId, onList }: { householdId: string; onList: string[] }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const locale = getLocale();
  const kitchen = useQuery({ queryKey: ["kitchen", householdId], queryFn: () => services.kitchen.getKitchen(householdId) });
  const members = useQuery({ queryKey: ["members", householdId], queryFn: () => services.preference.listMembers(householdId) });
  const memories = useQuery({ queryKey: ["memories", householdId], queryFn: () => services.preference.listMemories(householdId) });

  const best = useMemo(() => {
    if (!kitchen.data || !members.data) return null;
    const avoid = (memories.data ?? []).filter((m) => m.ingredientKey && m.recipeId === null && m.polarity < 0).map((m) => m.ingredientKey!);
    return bestBuys(recipeDocs.map(toRankRecipe), pantryEntries(kitchen.data), STAPLES, {
      diets: members.data.map((m) => m.diet),
      avoid,
    });
  }, [kitchen.data, members.data, memories.data]);

  const add = useMutation({
    mutationFn: (keys: string[]) => services.kitchen.addToList(householdId, keys.map((k) => ({ name: k, reason: "manual" as const }))),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["list", householdId] }),
  });

  if (!best || best.buy.every((k) => onList.includes(k))) return null;
  // Mid-sentence in English: "Buy paneer and green peas".
  const name = (k: string) => (locale === "en" ? displayName(catalogEntry(k), k, locale).toLowerCase() : displayName(catalogEntry(k), k, locale));
  const items = best.buy.map(name);
  const dishes = best.unlocks
    .map((slug) => recipeDocs.find((d) => d.slug === slug))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => recipeTitle(d, locale));
  const shown = dishes.slice(0, 4).join(", ") + (dishes.length > 4 ? ` ${t("buyFew.more", { n: dishes.length - 4 })}` : "");

  return (
    <Card style={{ gap: space.sm }}>
      <View style={styles.row}>
        <Icon name="sparkle" size={18} color={colors.accentText} />
        <Text variant="subheading" style={{ flex: 1 }}>
          {items.length === 1
            ? t("buyFew.titleOne", { a: items[0]!, n: best.unlocks.length })
            : t("buyFew.titleTwo", { a: items[0]!, b: items[1]!, n: best.unlocks.length })}
        </Text>
      </View>
      <Text variant="caption" muted>
        {shown}
      </Text>
      <View style={{ alignSelf: "flex-start" }}>
        <Button
          kind="secondary"
          size="small"
          icon="cart"
          label={items.length === 1 ? t("buyFew.addOne") : t("buyFew.addBoth")}
          disabled={add.isPending}
          onPress={() => add.mutate(best.buy.filter((k) => !onList.includes(k)))}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
