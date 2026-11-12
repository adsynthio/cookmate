// Drinks tab (shown only when turned on): everyday Indian drinks and mocktails, and cocktails once the cook has said
// they are of legal drinking age. Each card shows how much of it the kitchen already has.
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { DRINKS, type Drink } from "@/data/drinks";
import { Icon } from "@/design-system/icons";
import { Enter, PressableScale } from "@/design-system/motion";
import { Badge, Button, Card, Chip, Screen, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { drinkMatch, kitchenHas, drinksFor, say, type DrinkFilter } from "@/domain/drinks";
import { getLocale, t, useLocale } from "@/i18n";
import { services } from "@/services";
import { STAPLES } from "@/services/picks";
import { useDrinks } from "@/state/drinks";
import { useSession } from "@/state/session";

export default function DrinksScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const householdId = useSession((s) => s.householdId);
  const adult = useDrinks((s) => s.adult);
  const setAdult = useDrinks((s) => s.setAdult);
  const [filter, setFilter] = useState<DrinkFilter>("all");
  const [asking, setAsking] = useState(false);
  const kitchen = useQuery({ queryKey: ["kitchen", householdId], queryFn: () => services.kitchen.getKitchen(householdId!), enabled: !!householdId });
  const have = kitchenHas(kitchen.data ?? [], STAPLES);
  const list = drinksFor(DRINKS, filter, adult);
  const locale = getLocale();

  const pick = (f: DrinkFilter) => {
    if (f === "cocktails" && !adult) setAsking(true);
    else setFilter(f);
  };

  return (
    <Screen header={<AppHeader title={t("tab.drinks")} />}>
      <Enter style={{ gap: space.xs }}>
        <Text variant="title">{t("drinks.title")}</Text>
        <Text muted>{t("drinks.sub")}</Text>
      </Enter>

      <View style={styles.chips} accessibilityRole="radiogroup">
        {(["all", "everyday", "cocktails"] as DrinkFilter[]).map((f) => (
          <Chip key={f} solid label={t(`drinks.filter.${f}`)} selected={filter === f && !asking} onPress={() => pick(f)} />
        ))}
      </View>

      {asking ? (
        <Enter>
          <Card tone="accent" style={{ gap: space.md }}>
            <Text variant="subheading" color={colors.onAccent}>
              {t("drinks.age.title")}
            </Text>
            <Text color={colors.onAccent}>{t("drinks.age.body")}</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button
                  kind="light"
                  stretch
                  label={t("drinks.age.yes")}
                  onPress={() => {
                    setAdult(true);
                    setAsking(false);
                    setFilter("cocktails");
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button kind="quiet" stretch label={t("drinks.age.no")} onPress={() => setAsking(false)} />
              </View>
            </View>
          </Card>
        </Enter>
      ) : null}

      <View style={{ gap: space.md }}>
        {list.map((d, i) => (
          <DrinkCard key={d.id} drink={d} index={i} locale={locale} have={have} onOpen={() => router.push(`/drink/${d.id}`)} />
        ))}
      </View>
      {adult && filter !== "everyday" ? (
        <Text variant="caption" muted style={{ textAlign: "center" }}>
          {t("drinks.responsibly")}
        </Text>
      ) : null}
    </Screen>
  );
}

function DrinkCard({ drink, index, locale, have, onOpen }: { drink: Drink; index: number; locale: string; have: Set<string>; onOpen: () => void }) {
  const { colors } = useTheme();
  const m = drinkMatch(drink, have);
  const title = say(drink.title, locale);
  return (
    <Enter index={index}>
      <PressableScale accessibilityRole="button" accessibilityLabel={title} onPress={onOpen} style={[styles.card, shadow.card, { backgroundColor: colors.surface }]}>
        <View style={[styles.swatch, { backgroundColor: drink.colors[1] }]}>
          <Icon name={drink.kind === "hot" ? "flame" : "drop"} size={22} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.row}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {title}
            </Text>
            {drink.alcoholic ? <Badge label={t("drinks.cocktail")} tone="accent" /> : null}
          </View>
          <Text variant="caption" muted numberOfLines={2}>
            {say(drink.about, locale)}
          </Text>
          <Text variant="caption" weight={600} color={m.missing.length ? colors.accentText : colors.primaryText}>
            {t("home.minutes", { min: drink.minutes })} · {m.missing.length ? t("drinks.have", { have: m.have, total: m.total }) : t("drinks.haveAll")}
          </Text>
        </View>
      </PressableScale>
    </Enter>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  card: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.card, padding: space.md },
  swatch: { width: 64, height: 64, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  swatchTop: { position: "absolute", top: 0, left: 0, right: 0, height: "50%" },
});
