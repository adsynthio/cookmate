// Kitchen (KIT-030/033/034): one tab per storage place, staples as Full / Low / Out, live across phones.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { UndoBar } from "@/components/UndoBar";
import { Icon } from "@/design-system/icons";
import { itemName } from "@/components/kitchen/names";
import { illustrations } from "@/design-system/media";
import { Button, Card, Chip, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space, touch } from "@/design-system/tokens";
import { expiryInfo, formatQuantity, LOW_CONFIDENCE } from "@/domain/kitchen";
import { t, useLocale, type StringKey } from "@/i18n";
import { services, type LocationKind, type PantryItem, type StapleLevel } from "@/services";
import { useSession } from "@/state/session";

const ORDER: LocationKind[] = ["fridge", "pantry", "freezer", "staples", "ready_made"];
const LEVELS: StapleLevel[] = ["full", "low", "out"];

export default function KitchenScreen() {
  useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const householdId = useSession((s) => s.householdId);
  const [place, setPlace] = useState<LocationKind>("fridge");
  const clearGuesses = useMutation({
    mutationFn: () => services.kitchen.clearGuesses(householdId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kitchen", householdId] }),
  });

  const kitchen = useQuery({
    queryKey: ["kitchen", householdId],
    queryFn: () => services.kitchen.getKitchen(householdId!),
    enabled: !!householdId,
  });

  // KIT-030: changes from other phones in the household arrive over Realtime.
  useEffect(() => {
    if (!householdId) return;
    return services.kitchen.subscribe(householdId, () => {
      void queryClient.invalidateQueries({ queryKey: ["kitchen", householdId] });
      void queryClient.invalidateQueries({ queryKey: ["useSoon", householdId] });
    });
  }, [householdId, queryClient]);

  const counts = useMemo(() => {
    const c = new Map<LocationKind, number>();
    for (const i of kitchen.data ?? []) {
      const kind = i.location === "counter" ? "pantry" : i.location;
      c.set(kind, (c.get(kind) ?? 0) + 1);
    }
    return c;
  }, [kitchen.data]);
  const items = (kitchen.data ?? []).filter((i) => (i.location === "counter" ? "pantry" : i.location) === place);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={styles.header}>
          <Text variant="display" style={{ flex: 1 }} accessibilityRole="header">
            {t("kitchen.title")}
          </Text>
        </View>
        <Button label={t("kitchen.add")} onPress={() => router.push("/pantry/add")} />
        {kitchen.data && kitchen.data.length < 12 ? (
          <Pressable accessibilityRole="button" onPress={() => router.push("/pantry/yesterday")}>
            {({ pressed }) => (
              <Card style={[styles.quick, { opacity: pressed ? 0.8 : 1 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{t("quick.cta")}</Text>
                  <Text variant="label" muted>
                    {t("quick.ctaBody")}
                  </Text>
                </View>
                <Icon name="forward" muted />
              </Card>
            )}
          </Pressable>
        ) : null}
        {kitchen.data?.some((i) => i.guess) ? (
          <Button kind="quiet" label={t("quick.clearAll")} onPress={() => clearGuesses.mutate()} disabled={clearGuesses.isPending} />
        ) : null}

        {kitchen.isPending ? (
          <StateView state="loading" title={t("state.loading.home")} />
        ) : kitchen.isError ? (
          <StateView
            state="error"
            title={t("state.error.title")}
            body={t("state.error.body")}
            actionLabel={t("state.retry")}
            onAction={() => kitchen.refetch()}
          />
        ) : kitchen.data.length === 0 ? (
          <StateView
            state="empty"
            illustration={illustrations.emptyKitchen}
            title={t("state.empty.kitchen.title")}
            body={t("state.empty.kitchen.body")}
            actionLabel={t("state.empty.kitchen.action")}
            onAction={() => router.push("/pantry/add")}
          />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
              {ORDER.map((loc) => (
                <Chip
                  key={loc}
                  label={`${t(`kitchen.location.${loc}` as StringKey)} ${counts.get(loc) ?? 0}`}
                  selected={place === loc}
                  onPress={() => setPlace(loc)}
                />
              ))}
            </ScrollView>
            <Card>
              {items.length === 0 ? (
                <Text muted>{t("state.empty.kitchen.body")}</Text>
              ) : (
                items.map((item) =>
                  item.stapleLevel ? (
                    <StapleRow key={item.id} item={item} householdId={householdId!} />
                  ) : (
                    <ItemRow key={item.id} item={item} />
                  ),
                )
              )}
            </Card>
          </>
        )}
      </Screen>
      <UndoBar />
    </View>
  );
}

function ItemRow({ item }: { item: PantryItem }) {
  const { colors } = useTheme();
  const router = useRouter();
  const confirm = useMutation({ mutationFn: () => services.kitchen.updateItem(item.id, { confirm: true }) });
  const expiry = expiryInfo(item.expiryDate, item.expiryEstimated);
  const expiryText =
    expiry?.kind === "expired"
      ? t("kitchen.expiry.expired")
      : expiry?.kind === "today"
        ? t("kitchen.expiry.today")
        : expiry?.kind === "soon"
          ? expiry.days === 1
            ? t("kitchen.expiry.dayOne")
            : t("kitchen.expiry.days", { days: expiry.days })
          : null;
  const roles = item.flavorRoles.map((r) => t(`flavor.${r}` as StringKey));
  const sub = [
    item.state === "homemade" ? t("kitchen.homemade") : null,
    roles.length ? roles.join(", ") : null,
    expiryText ? `${expiry?.estimated ? "~" : ""}${expiryText}` : null,
  ].filter(Boolean);
  const unsure = item.confidence < LOW_CONFIDENCE && !confirm.isSuccess;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[itemName(item), formatQuantity(item.quantity, item.unit), ...sub].filter(Boolean).join(", ")}
      onPress={() => router.push(`/pantry/${item.id}`)}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="heading">{itemName(item)}</Text>
        {sub.length ? (
          <Text variant="caption" color={expiry && expiry.kind !== "later" ? colors.limeText : colors.inkSecondary}>
            {sub.join(" · ")}
          </Text>
        ) : null}
        {unsure ? (
          <View style={styles.unsure}>
            <Text variant="caption" muted>
              {t("kitchen.stillHave")}
            </Text>
            <Button kind="secondary" label={t("kitchen.yes")} onPress={() => confirm.mutate()} />
          </View>
        ) : null}
      </View>
      <Text variant="label" muted>
        {formatQuantity(item.quantity, item.unit)}
      </Text>
    </Pressable>
  );
}

function StapleRow({ item, householdId }: { item: PantryItem; householdId: string }) {
  const queryClient = useQueryClient();
  const [onList, setOnList] = useState(false);
  const setLevel = useMutation({
    mutationFn: (level: StapleLevel) => services.kitchen.updateItem(item.id, { stapleLevel: level }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kitchen", householdId] }),
  });
  const addToList = useMutation({
    mutationFn: () => services.kitchen.addToList(householdId, [{ name: item.ingredientKey ?? item.name, reason: "running_low" }]),
    onSuccess: () => setOnList(true),
  });
  const level = setLevel.isPending ? setLevel.variables : item.stapleLevel;
  return (
    <View style={[styles.row, { flexDirection: "column", alignItems: "stretch" }]}>
      <Text variant="heading">{itemName(item)}</Text>
      <View style={styles.levels} accessibilityRole="radiogroup">
        {LEVELS.map((l) => (
          <Chip key={l} label={t(`kitchen.staple.${l}` as StringKey)} selected={level === l} onPress={() => setLevel.mutate(l)} />
        ))}
        {level === "low" || level === "out" ? (
          <Button
            kind="quiet"
            label={onList ? `✓ ${t("kitchen.addedToList")}` : `+ ${t("kitchen.addToList")}`}
            disabled={onList || addToList.isPending}
            onPress={() => addToList.mutate()}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center" },
  quick: { flexDirection: "row", alignItems: "center", gap: space.md },
  tabs: { gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: touch.cook, paddingVertical: space.sm },
  unsure: { flexDirection: "row", alignItems: "center", gap: space.sm },
  levels: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
});
