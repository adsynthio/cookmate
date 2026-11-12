// One drink: what goes in (with what the kitchen already has), the steps, and "add what's missing to the list".
// A cocktail opened without the age confirmation shows nothing but a way back.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image, StyleSheet, View } from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { catalogEntry } from "@/data/catalog";
import { DRINKS } from "@/data/drinks";
import { Icon } from "@/design-system/icons";
import { drinkImage, ingredientImage } from "@/design-system/media";
import { Enter } from "@/design-system/motion";
import { Button, Card, Photo, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { drinkMatch, kitchenHas, say } from "@/domain/drinks";
import { displayName } from "@/domain/kitchen";
import { getLocale, t, useLocale } from "@/i18n";
import { services } from "@/services";
import { STAPLES } from "@/services/picks";
import { useDrinks } from "@/state/drinks";
import { useSession } from "@/state/session";

export default function DrinkScreen() {
  useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const householdId = useSession((s) => s.householdId);
  const adult = useDrinks((s) => s.adult);
  const drink = DRINKS.find((d) => d.id === id);
  const kitchen = useQuery({ queryKey: ["kitchen", householdId], queryFn: () => services.kitchen.getKitchen(householdId!), enabled: !!householdId });
  const have = kitchenHas(kitchen.data ?? [], STAPLES);
  const add = useMutation({
    mutationFn: (keys: string[]) => services.kitchen.addToList(householdId!, keys.map((name) => ({ name, reason: "manual" as const }))),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["list", householdId] }),
  });
  const locale = getLocale();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/drinks"));

  if (!drink || (drink.alcoholic && !adult)) {
    return (
      <Screen header={<AppHeader title={t("tab.drinks")} back mic={false} />} tabBar={false}>
        <StateView state="empty" title={t("drinks.notFound")} actionLabel={t("timers.back")} onAction={back} />
      </Screen>
    );
  }
  const m = drinkMatch(drink, have);
  const nameOf = (key: string) => displayName(catalogEntry(key), key, locale);

  return (
    <Screen header={<AppHeader title={t("tab.drinks")} back mic={false} />} tabBar={false}>
      <Enter>
        <View style={[styles.hero, { backgroundColor: drink.colors[1] }]}>
          {drinkImage(drink.id) ? (
            <Image source={drinkImage(drink.id)!} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : (
            <Icon name={drink.kind === "hot" ? "flame" : "drop"} size={44} color="#FFFFFF" />
          )}
        </View>
      </Enter>
      <Enter index={1} style={{ gap: space.xs }}>
        <Text variant="title" accessibilityRole="header">
          {say(drink.title, locale)}
        </Text>
        <Text muted>{say(drink.about, locale)}</Text>
        <Text variant="label" muted>
          {t("home.minutes", { min: drink.minutes })} · {t("drinks.serves", { n: drink.serves })}
        </Text>
      </Enter>

      <Card style={{ gap: space.sm }}>
        <Text variant="subheading">{t("drinks.ingredients")}</Text>
        {drink.ingredients.map((ing, i) => {
          const name = ing.key ? nameOf(ing.key) : say(ing.name!, locale);
          const has = ing.key ? have.has(ing.key) : null;
          return (
            <View key={i} style={styles.ing}>
              <Photo source={ing.key ? ingredientImage(ing.key, catalogEntry(ing.key)?.category) : null} size={36} radius={radius.tag} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">
                  {name}
                  {ing.optional ? <Text variant="caption" muted>{`  ${t("drinks.optional")}`}</Text> : null}
                </Text>
                {has !== null ? (
                  <Text variant="caption" color={has ? colors.primaryText : colors.accentText}>
                    {has ? t("drinks.inKitchen") : t("drinks.notInKitchen")}
                  </Text>
                ) : null}
              </View>
              <Text variant="label" muted>
                {say(ing.amount, locale)}
              </Text>
            </View>
          );
        })}
        {m.missing.length ? (
          <Button
            kind="secondary"
            icon="cart"
            label={add.isSuccess ? t("drinks.added") : t("drinks.addMissing", { n: m.missing.length })}
            disabled={add.isPending || add.isSuccess}
            onPress={() => add.mutate(m.missing.map((x) => x.key!))}
          />
        ) : null}
      </Card>

      <View style={{ gap: space.md }}>
        <Text variant="subheading">{t("drinks.steps")}</Text>
        {drink.steps.map((s, i) => (
          <Enter key={i} index={i}>
            <View style={styles.step}>
              <View style={[styles.num, { backgroundColor: colors.primary }]}>
                <Text variant="label" weight={600} color={colors.onPrimary}>
                  {i + 1}
                </Text>
              </View>
              <Text style={{ flex: 1 }}>{say(s, locale)}</Text>
            </View>
          </Enter>
        ))}
      </View>
      {drink.alcoholic ? (
        <Text variant="caption" muted style={{ textAlign: "center" }}>
          {t("drinks.responsibly")}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 180, borderRadius: radius.cardLg, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  heroTop: { position: "absolute", top: 0, left: 0, right: 0, height: "55%" },
  ing: { flexDirection: "row", alignItems: "center", gap: space.md },
  step: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});
