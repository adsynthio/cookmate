// "I want to make rajma": the dish the cook typed on Home, with what they have and what they'd need to buy,
// one tap to put the missing things on the list, and the recipe. If there's no such recipe, say so plainly.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { dishImage, ingredientImage } from "@/design-system/media";
import { Enter } from "@/design-system/motion";
import { Badge, Button, Photo, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { pantryMatch } from "@/domain/ranking";
import { recipeTitle, toRankRecipe } from "@/domain/recipes";
import { getLocale, t } from "@/i18n";
import { services, type PantryItem } from "@/services";
import { pantryEntries, STAPLES } from "@/services/picks";

export function WantDish({
  query,
  householdId,
  items,
  onOpen,
  onInvent,
}: {
  query: string;
  householdId: string;
  items: PantryItem[];
  onOpen: (recipeId: string) => void;
  onInvent: () => void;
}) {
  const { colors } = useTheme();
  const locale = getLocale();
  const found = useQuery({ queryKey: ["want", query], queryFn: () => services.recipe.searchRecipes(query) });
  const top = found.data?.[0];
  const recipe = useQuery({ queryKey: ["recipe", top?.id], queryFn: () => services.recipe.getRecipe(top!.id), enabled: !!top });
  const [listed, setListed] = useState(false);

  const match = useMemo(() => (recipe.data ? pantryMatch(toRankRecipe(recipe.data), pantryEntries(items), STAPLES) : null), [recipe.data, items]);
  const missing = match?.items.filter((m) => m.status === "missing") ?? [];
  const addToList = useMutation({
    mutationFn: () => services.kitchen.addToList(householdId, missing.map((m) => ({ name: m.key, reason: "manual" as const }))),
    onSuccess: () => setListed(true),
  });

  if (found.isPending || (top && recipe.isPending)) return null;

  if (!top || !recipe.data || !match) {
    return (
      <Enter>
        <View style={[styles.card, { backgroundColor: colors.surfaceMuted }]}>
          <Text variant="bodyStrong">{t("home.want.none", { dish: query })}</Text>
          <Text variant="label" muted>
            {t("home.want.noneBody")}
          </Text>
          <View style={{ alignSelf: "flex-start" }}>
            <Button kind="secondary" size="small" icon="sparkle" label={t("home.invent")} onPress={onInvent} />
          </View>
        </View>
      </Enter>
    );
  }

  const name = recipeTitle(recipe.data, locale);
  const nameOf = (key: string) => displayName(catalogEntry(key), key, locale);
  return (
    <Enter>
      <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]} accessibilityLabel={t("home.want.title", { dish: name })}>
        <View style={styles.top}>
          <Photo source={dishImage(recipe.data.slug)} size={64} round />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="overline" color={colors.accentText}>
              {t("home.want.overline").toUpperCase()}
            </Text>
            <Text variant="subheading">{name}</Text>
            <Text variant="label" muted>
              {missing.length ? t("recipe.haveOf", { have: match.have, total: match.total }) : t("recipe.haveAll")}
            </Text>
          </View>
          {missing.length ? null : <Badge tone="primary" label={t("home.canMake")} />}
        </View>
        {missing.length ? (
          <View style={{ gap: space.sm }}>
            <Text variant="label" weight={600} color={colors.accentText}>
              {t("home.want.need", { n: missing.length })}
            </Text>
            <View style={styles.chips}>
              {missing.map((m) => (
                <View key={m.key} style={[styles.chip, { borderColor: colors.accent }]}>
                  {ingredientImage(m.key) ? <Photo source={ingredientImage(m.key)} size={22} round /> : <Icon name="cart" size={14} color={colors.accentText} />}
                  <Text variant="label" color={colors.accentText}>
                    {nameOf(m.key)}
                    {m.substitute ? ` · ${t("recipe.orUse", { item: nameOf(m.substitute) })}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.actions}>
          {missing.length ? (
            <View style={{ flex: 1 }}>
              <Button
                kind="secondary"
                stretch
                icon={listed ? "check" : "cart"}
                label={listed ? t("recipe.added") : t("recipe.addMissing", { n: missing.length })}
                disabled={listed || addToList.isPending}
                onPress={() => addToList.mutate()}
              />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button kind="accent" stretch iconAfter="arrowRight" label={t("home.viewRecipe")} onPress={() => onOpen(top.id)} />
          </View>
        </View>
      </View>
    </Enter>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.cardLg, padding: space.lg, gap: space.md },
  top: { flexDirection: "row", alignItems: "center", gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderStyle: "dashed", borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  actions: { flexDirection: "row", gap: space.sm },
});
