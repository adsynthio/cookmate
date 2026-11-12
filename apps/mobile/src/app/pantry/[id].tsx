// KIT-032 / KIT-035: one item. Change how much and where, see how long it keeps in each place, and mark it
// finished or thrown away (with Undo for 5 seconds; every change is logged as an inventory event).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { itemName } from "@/components/kitchen/names";
import { catalogEntry } from "@/data/catalog";
import { Icon, type IconName } from "@/design-system/icons";
import { ingredientImage } from "@/design-system/media";
import { Enter } from "@/design-system/motion";
import { Button, Card, Chip, Field, Photo, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { expiryInfo, formatQuantity, parseQuantity, roughDuration, shelfLife } from "@/domain/kitchen";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type ItemChanges, type LocationKind, type PantryItem } from "@/services";
import { useSession } from "@/state/session";
import { useUndo } from "@/state/undo";

const PLACES: LocationKind[] = ["fridge", "pantry", "freezer", "staples", "ready_made"];
const PLACE_ICON: Record<LocationKind, IconName> = { fridge: "fridge", pantry: "pantry", freezer: "freezer", staples: "box", ready_made: "cart", counter: "counter" };

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
    <Screen tabBar={false} header={<AppHeader title={t("item.header")} back />}>
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
  const heroSize = Math.min(useWindowDimensions().width - space.gutter * 2, 360);

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

  const expiry = expiryInfo(item.expiryDate, item.expiryEstimated);
  return (
    <>
      <Enter>
        <View style={[styles.hero, { backgroundColor: colors.surfaceMuted }]}>
          <Photo
            source={ingredientImage(item.ingredientKey, entry?.category ?? (item.state === "leftover" ? "leftover" : "homemade"))}
            size={heroSize}
            radius={radius.cardLg}
          />
        </View>
      </Enter>
      <Enter index={1} style={{ gap: space.xs }}>
        <Text variant="title" accessibilityRole="header">
          {name}
        </Text>
        <Text muted>
          {[formatQuantity(item.quantity, item.unit), t(`kitchen.location.${item.location}` as StringKey)].filter(Boolean).join(" · ")}
        </Text>
        {useBy ? (
          <View style={styles.useBy}>
            <Icon name="alarm" size={16} color={expiry && expiry.kind !== "later" ? colors.accentText : colors.primaryText} />
            <Text weight={500} color={expiry && expiry.kind !== "later" ? colors.accentText : colors.primaryText}>
              {t("item.useBy", { date: useBy })} {item.expiryEstimated ? t("item.estimated") : ""}
            </Text>
          </View>
        ) : null}
      </Enter>

      <Button
        kind="accent"
        stretch
        icon="skillet"
        label={t("item.cookWith")}
        onPress={() => router.navigate({ pathname: "/", params: { use: item.id } })}
      />

      <Card>
        <Text variant="subheading">{t("item.edit")}</Text>
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
            <Chip key={p} solid icon={PLACE_ICON[p]} label={t(`kitchen.location.${p}` as StringKey)} selected={place === p} onPress={() => setPlace(p)} />
          ))}
        </View>
        {save.isError ? <Text color={colors.alert}>{t("state.error.body")}</Text> : null}
        <Button kind="primary" stretch label={t("item.save")} disabled={!dirty || save.isPending} onPress={() => save.mutate()} />
      </Card>

      {keeps.length ? (
        <Card tone="muted">
          <View style={styles.useBy}>
            <Icon name="clock" size={18} color={colors.primaryText} />
            <Text variant="subheading">{t("item.keeps")}</Text>
          </View>
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
      <Text variant="overline" muted style={styles.upper}>
        {t("item.done")}
      </Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" icon="checkCircle" label={t("item.finished")} disabled={finish.isPending} onPress={() => finish.mutate(false)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" icon="trash" label={t("item.discard")} disabled={finish.isPending} onPress={() => finish.mutate(true)} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.cardLg, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  useBy: { flexDirection: "row", alignItems: "center", gap: 6 },
  upper: { textTransform: "uppercase" },
  row: { flexDirection: "row", gap: space.sm },
  half: { flex: 1, minWidth: 0 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
