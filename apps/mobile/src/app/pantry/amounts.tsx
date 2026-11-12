// "How much do you have?": every kitchen item without an amount, one tap each. Opened from the Kitchen card. Each
// tap saves at once and the item slides away; staples (Full / Low / Out) and leftovers are not asked about.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { itemName } from "@/components/kitchen/names";
import { AmountChips } from "@/components/pantry/AmountChips";
import { catalogEntry } from "@/data/catalog";
import { ingredientImage } from "@/design-system/media";
import { Enter, Layout } from "@/design-system/motion";
import { Button, Card, Photo, Screen, StateView, Text } from "@/design-system/primitives";
import { radius, space } from "@/design-system/tokens";
import { amountChoices, needsAmount, type Amount } from "@/domain/amounts";
import { t, useLocale } from "@/i18n";
import { services } from "@/services";
import { useSession } from "@/state/session";

export default function AmountsScreen() {
  useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const householdId = useSession((s) => s.householdId)!;
  const kitchen = useQuery({ queryKey: ["kitchen", householdId], queryFn: () => services.kitchen.getKitchen(householdId) });
  const [done, setDone] = useState<string[]>([]);
  const save = useMutation({
    mutationFn: ({ id, a }: { id: string; a: Amount }) => services.kitchen.updateItem(id, { quantity: a.quantity, unit: a.unit, confirm: true }),
    onMutate: ({ id }) => setDone((d) => [...d, id]),
    onError: (_e, { id }) => setDone((d) => d.filter((x) => x !== id)),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["kitchen", householdId] }),
  });
  const close = () => (router.canGoBack() ? router.back() : router.replace("/kitchen"));

  // Only items Cookmate can offer amounts for; anything unknown keeps its own quantity field on the item screen.
  const todo = (kitchen.data ?? []).filter((i) => needsAmount(i) && amountChoices(catalogEntry(i.ingredientKey)).length && !done.includes(i.id));

  return (
    <Screen header={<AppHeader title={t("amt.title")} back mic={false} />} tabBar={false}>
      {kitchen.isPending ? (
        <StateView state="loading" title={t("amt.title")} />
      ) : !todo.length ? (
        <Enter style={{ gap: space.lg }}>
          <StateView state="empty" title={t("amt.allSet")} />
          <Button kind="accent" stretch label={t("amt.done")} onPress={close} />
        </Enter>
      ) : (
        <>
          <Text muted>{t("amt.body")}</Text>
          <Layout style={{ gap: space.md }}>
            {todo.map((item, i) => (
              <Enter key={item.id} index={i}>
                <Card style={{ gap: space.md }}>
                  <View style={styles.head}>
                    <Photo source={ingredientImage(item.ingredientKey, catalogEntry(item.ingredientKey)?.category)} size={44} radius={radius.tag} />
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {itemName(item)}
                    </Text>
                  </View>
                  <AmountChips ingredientKey={item.ingredientKey} quantity={null} unit={null} onPick={(a) => save.mutate({ id: item.id, a })} />
                </Card>
              </Enter>
            ))}
          </Layout>
          <Button kind="quiet" label={t("amt.skip")} onPress={close} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
});
