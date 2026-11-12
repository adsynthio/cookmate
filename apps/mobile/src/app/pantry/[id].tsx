// KIT-032 / KIT-035: one item. Change how much and where, see how long it keeps in each place, and mark it
// finished or thrown away (with Undo for 5 seconds; every change is logged as an inventory event).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { itemName } from "@/components/kitchen/names";
import { catalogEntry } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { Button, Card, Chip, Field, IconButton, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { formatQuantity, parseQuantity, roughDuration, shelfLife } from "@/domain/kitchen";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type ItemChanges, type LocationKind, type PantryItem } from "@/services";
import { useSession } from "@/state/session";
import { useUndo } from "@/state/undo";

const PLACES: LocationKind[] = ["fridge", "pantry", "freezer", "staples", "ready_made"];

export default function ItemScreen() {
  useLocale();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const householdId = useSession((s) => s.householdId);
  const kitchen = useQuery({
    queryKey: ["kitchen", householdId],
    queryFn: () => services.kitchen.getKitchen(householdId!),
    enabled: !!householdId,
  });
  const item = kitchen.data?.find((i) => i.id === id);

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton label={t("onb.back")} onPress={() => router.back()}>
          <Icon name="back" />
        </IconButton>
      </View>
      {kitchen.isPending ? (
        <StateView state="loading" title={t("state.loading.home")} />
      ) : kitchen.isError ? (
        <StateView state="error" title={t("state.error.title")} body={t("state.error.body")} actionLabel={t("state.retry")} onAction={() => kitchen.refetch()} />
      ) : !item ? (
        <StateView state="empty" title={t("item.notFound")} actionLabel={t("onb.back")} onAction={() => router.back()} />
      ) : (
        <ItemDetail key={item.id} item={item} householdId={householdId!} />
      )}
    </Screen>
  );
}

function ItemDetail({ item, householdId }: { item: PantryItem; householdId: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const offerUndo = useUndo((s) => s.offer);
  const entry = catalogEntry(item.ingredientKey);
  const name = itemName(item);

  const [qty, setQty] = useState(item.quantity === null ? "" : String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "");
  const [place, setPlace] = useState<LocationKind>(item.location === "counter" ? "pantry" : item.location);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["kitchen", householdId] }),
      queryClient.invalidateQueries({ queryKey: ["useSoon", householdId] }),
    ]);

  const parsedQty = parseQuantity(qty);
  const changes: ItemChanges = {};
  if (parsedQty !== undefined && parsedQty !== item.quantity) changes.quantity = parsedQty;
  if (unit.trim() !== (item.unit ?? "") && unit.trim() !== "") changes.unit = unit.trim();
  if (place !== item.location) changes.locationKind = place;
  const dirty = Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: () => services.kitchen.updateItem(item.id, changes),
    onSuccess: refresh,
  });
  const finish = useMutation({
    mutationFn: (discarded: boolean) => services.kitchen.finishItem(item.id, discarded),
    onSuccess: async (_, discarded) => {
      offerUndo(t(discarded ? "item.discardedToast" : "item.finishedToast", { name }), async () => {
        await services.kitchen.reopenItem(item.id);
        await refresh();
      });
      await refresh();
      router.back();
    },
  });

  const keeps = shelfLife(entry);
  const useBy = item.expiryDate
    ? new Intl.DateTimeFormat(LANGUAGE_CODES[getLocale()], { day: "numeric", month: "long" }).format(new Date(item.expiryDate))
    : null;

  return (
    <>
      <View style={{ gap: space.xs }}>
        <Text variant="display" accessibilityRole="header">
          {name}
        </Text>
        <Text muted>
          {[formatQuantity(item.quantity, item.unit), t(`kitchen.location.${item.location}` as StringKey)].filter(Boolean).join(" · ")}
        </Text>
        {useBy ? (
          <Text color={colors.primaryText}>
            {t("item.useBy", { date: useBy })} {item.expiryEstimated ? t("item.estimated") : ""}
          </Text>
        ) : null}
      </View>

      <Card>
        <Text variant="label" muted>
          {t("kitchen.quantity")}
        </Text>
        <View style={styles.row}>
          <Field value={qty} onChangeText={setQty} keyboardType="decimal-pad" accessibilityLabel={t("kitchen.quantity")} style={styles.half} />
          <Field value={unit} onChangeText={setUnit} autoCapitalize="none" placeholder="kg / g / packet" accessibilityLabel={t("kitchen.unit")} style={styles.half} />
        </View>
        <Text variant="label" muted>
          {t("item.where")}
        </Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {PLACES.map((p) => (
            <Chip key={p} label={t(`kitchen.location.${p}` as StringKey)} selected={place === p} onPress={() => setPlace(p)} />
          ))}
        </View>
        {save.isError ? <Text color={colors.alert}>{t("state.error.body")}</Text> : null}
        <Button label={t("item.save")} disabled={!dirty || save.isPending} onPress={() => save.mutate()} />
      </Card>

      {keeps.length ? (
        <Card>
          <Text variant="label" muted>
            {t("item.keeps")}
          </Text>
          {keeps.map((k, i) => {
            const d = roughDuration(k.days);
            return (
              <Text key={k.kind}>
                {t("item.keepsIn", {
                  place: t(`kitchen.location.${k.kind}` as StringKey),
                  duration: t(`duration.${d.unit}` as StringKey, { n: d.n }),
                })}
                {i === 0 ? ` (${t("item.usual")})` : ""}
              </Text>
            );
          })}
        </Card>
      ) : null}

      {finish.isError ? <Text color={colors.alert}>{t("state.error.body")}</Text> : null}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" label={t("item.finished")} disabled={finish.isPending} onPress={() => finish.mutate(false)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" label={t("item.discard")} disabled={finish.isPending} onPress={() => finish.mutate(true)} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row" },
  row: { flexDirection: "row", gap: space.sm },
  half: { flex: 1, minWidth: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
