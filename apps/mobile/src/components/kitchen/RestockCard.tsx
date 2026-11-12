// KIT-181: "Running low on besan? You usually buy it every 10 days." One question at a time, on Kitchen. Add to list
// puts it on the shopping list (reason "predicted"); Still have it quiets it on this phone for a few days. Never an order.
import "expo-sqlite/localStorage/install";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { ingredientImage } from "@/design-system/media";
import { Enter } from "@/design-system/motion";
import { Button, Photo, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { nextRestock, rhythmKey, snoozeUntil, type RestockDue } from "@/domain/restock";
import { getLocale, t, type StringKey } from "@/i18n";
import { services } from "@/services";

const KEY = "cookmate.restock.snoozed";

function loadSnoozed(): Record<string, string> {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function RestockCard({ householdId }: { householdId: string }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [snoozed, setSnoozed] = useState(loadSnoozed);
  const [added, setAdded] = useState<string | null>(null);
  const due = useQuery({ queryKey: ["restock", householdId], queryFn: () => services.kitchen.restockDue(householdId) });
  const add = useMutation({
    mutationFn: (d: RestockDue) => services.kitchen.addToList(householdId, [{ name: d.ingredientKey, reason: "predicted" }]),
    onSuccess: (_r, d) => {
      setAdded(d.ingredientKey);
      void qc.invalidateQueries({ queryKey: ["list", householdId] });
      void qc.invalidateQueries({ queryKey: ["restock", householdId] });
    },
  });

  const nameOf = (key: string) => displayName(catalogEntry(key), key, getLocale());
  if (added) {
    return (
      <Enter>
        <View style={[styles.done, { backgroundColor: colors.primaryPale }]} accessibilityLiveRegion="polite">
          <Text variant="label" weight={600} color={colors.primaryText}>
            {t("restock.added", { item: nameOf(added) })}
          </Text>
        </View>
      </Enter>
    );
  }
  const q = nextRestock(due.data ?? [], snoozed);
  if (!q) return null;
  const name = nameOf(q.ingredientKey);
  const rhythm = rhythmKey(q.everyDays);
  const notYet = () => {
    const next = { ...snoozed, [q.ingredientKey]: snoozeUntil(q) };
    setSnoozed(next);
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
    } catch {}
  };

  return (
    <Enter>
      <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]}>
        <View style={styles.row}>
          <Photo source={ingredientImage(q.ingredientKey, catalogEntry(q.ingredientKey)?.category)} size={52} round />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="subheading">{t("restock.title", { item: name })}</Text>
            <Text variant="label" muted>
              {t(`restock.${rhythm.key}` as StringKey, { n: rhythm.n })}
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button kind="accent" stretch label={t("restock.add")} disabled={add.isPending} onPress={() => add.mutate(q)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button kind="secondary" stretch label={t("restock.notYet")} onPress={notYet} />
          </View>
        </View>
        <Text variant="caption" muted>
          {t("restock.never")}
        </Text>
      </View>
    </Enter>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.cardLg, padding: space.lg, gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  done: { borderRadius: radius.item, padding: space.md },
});
