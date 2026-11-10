// Home: "Tonight, decided" (HOME-01), craving chips (HOME-03), Use Soon strip (HOME-04), all states (HOME-08).
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";

import { itemName } from "@/components/kitchen/names";
import { daysLeft } from "@/domain/pantry";
import { dishImage } from "@/design-system/media";
import { Button, Card, Chip, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { size, space } from "@/design-system/tokens";
import { t, useLocale, type StringKey } from "@/i18n";
import { services, type PantryItem, type Pick } from "@/services";
import { useSession } from "@/state/session";

const CHIPS: { key: string; label: StringKey }[] = [
  { key: "comforting", label: "chip.comforting" },
  { key: "under_20", label: "chip.under20" },
  { key: "high_protein", label: "chip.highProtein" },
  { key: "kids_friendly", label: "chip.kidsFriendly" },
  { key: "light", label: "chip.light" },
];

export default function HomeScreen() {
  useLocale();
  const { householdId, memberId, mealSlot } = useSession();
  const [chips, setChips] = useState<string[]>([]);

  const picks = useQuery({
    queryKey: ["picks", householdId, mealSlot, chips],
    queryFn: () => services.recipe.getPicks({ householdId: householdId!, memberId: memberId!, mealSlot, chips }),
    enabled: !!householdId && !!memberId,
  });
  const useSoon = useQuery({
    queryKey: ["useSoon", householdId],
    queryFn: () => services.kitchen.getUseSoon(householdId!),
    enabled: !!householdId,
  });

  const toggleChip = (key: string) =>
    setChips((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]));

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" muted>
            {t(`home.slot.${mealSlot}` as StringKey)}
          </Text>
          <Text variant="display">{t("home.greeting")}</Text>
        </View>
      </View>

      {picks.isPending ? (
        <StateView state="loading" title={t("state.loading.home")} />
      ) : picks.isError ? (
        <StateView
          state="error"
          title={t("state.error.title")}
          body={t("state.error.body")}
          actionLabel={t("state.retry")}
          onAction={() => picks.refetch()}
        />
      ) : (
        <>
          <HeroPick pick={picks.data.hero} />
          <Text variant="label" muted>
            {t("home.alternates")}
          </Text>
          {picks.data.alternates.map((p) => (
            <AlternatePick key={p.recommendationId} pick={p} />
          ))}
        </>
      )}

      <Text variant="heading">{t("home.cravingPrompt")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {CHIPS.map((c) => (
          <Chip key={c.key} label={t(c.label)} selected={chips.includes(c.key)} onPress={() => toggleChip(c.key)} />
        ))}
      </ScrollView>

      {useSoon.data && useSoon.data.length > 0 ? <UseSoonStrip items={useSoon.data} /> : null}
    </Screen>
  );
}

/** The screen's one lime card (brand kit HighlightCard): title and reason on the left, the dish in a circle. */
function HeroPick({ pick }: { pick: Pick }) {
  const { colors } = useTheme();
  const photo = pick.imageUrl ? { uri: pick.imageUrl } : dishImage(pick.recipeId);
  return (
    <Card hero style={{ gap: space.md }}>
      <View style={styles.heroRow}>
        <View style={{ flex: 1, gap: space.sm }}>
          <Text variant="title">{pick.title}</Text>
          <Text muted>{pick.reason}</Text>
        </View>
        {photo ? (
          <Image source={photo} style={styles.heroImage} accessible={false} />
        ) : (
          <View style={[styles.heroImage, { backgroundColor: colors.limePale }]} accessible={false} />
        )}
      </View>
      {pick.missing.length > 0 ? (
        <Text variant="label" muted>
          {t("home.missing", { items: pick.missing.join(", ") })}
        </Text>
      ) : null}
      <Button label={t("home.cookThis")} onPress={() => {}} accessibilityHint={pick.title} />
    </Card>
  );
}

function AlternatePick({ pick }: { pick: Pick }) {
  return (
    <Card style={{ paddingVertical: space.md }}>
      <Text variant="heading">{pick.title}</Text>
      <Text variant="caption" muted>
        {pick.reason}
      </Text>
    </Card>
  );
}

function UseSoonStrip({ items }: { items: PantryItem[] }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="heading">{t("home.useSoon")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {items.map((item) => {
          const days = item.expiryDate ? daysLeft(item.expiryDate) : null;
          const label =
            days === 0 ? t("home.today") : days === 1 ? t("home.dayLeft") : t("home.daysLeft", { days: days ?? "?" });
          return (
            <Card key={item.id} style={styles.useSoonCard}>
              <Text variant="label">{itemName(item)}</Text>
              <Text variant="caption" muted>
                {label}
                {item.expiryEstimated ? ` · ${t("kitchen.estimated")}` : ""}
              </Text>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-end", gap: space.md },
  heroRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroImage: { width: size.ring, height: size.ring, borderRadius: size.ring / 2 },
  useSoonCard: { minWidth: 120, paddingVertical: space.md },
});
