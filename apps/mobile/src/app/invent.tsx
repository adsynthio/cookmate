// "Make something new from what's here" (KIT-056, REC-06): a dish invented from leftovers, homemade components and
// things about to spoil. The service only returns dishes that passed the food-safety checks; it is saved as the
// household's own recipe and labelled "new creation" wherever it appears. With `?dish=Aloo Methi` (Home's new-dish
// idea, or a typed dish Cookmate has no recipe for) it writes that dish for this kitchen instead, with what to buy.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { illustrations } from "@/design-system/media";
import { Icon } from "@/design-system/icons";
import { Button, Card, IconButton, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { catalogEntry } from "@/data/catalog";
import { displayName } from "@/domain/kitchen";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services } from "@/services";
import { useSession } from "@/state/session";

export default function InventScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const householdId = useSession((s) => s.householdId);
  const qc = useQueryClient();
  const { dish } = useLocalSearchParams<{ dish?: string }>();
  const invent = useMutation({ mutationFn: () => services.recipe.inventDish(householdId!, dish || undefined) });
  const [listed, setListed] = useState(false);
  const addToList = useMutation({
    mutationFn: (items: string[]) => services.kitchen.addToList(householdId!, items.map((name) => ({ name, reason: "manual" as const }))),
    onSuccess: () => {
      setListed(true);
      void qc.invalidateQueries({ queryKey: ["list", householdId] });
    },
  });
  const { mutate } = invent;
  useEffect(() => {
    if (householdId) mutate();
  }, [householdId, mutate]);

  const result = invent.data;
  const reason = result && result.recipeId === null ? result.reason : null;
  const failure: { title: StringKey; body: StringKey } | null =
    reason === "too_little"
      ? { title: "invent.tooLittle.title", body: "invent.tooLittle.body" }
      : reason === "unavailable"
        ? { title: "invent.unavailable.title", body: "invent.unavailable.body" }
        : reason
          ? { title: "invent.unsafe.title", body: "invent.unsafe.body" }
          : null;
  const l = getLocale();

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton label={t("onb.back")} onPress={() => router.back()}>
          <Icon name="close" />
        </IconButton>
      </View>
      <Text variant="display" accessibilityRole="header">
        {dish ? t("invent.named.title", { dish }) : t("invent.title")}
      </Text>
      {invent.isPending || (!result && !invent.isError) ? (
        <StateView state="loading" title={dish ? t("invent.named.loading", { dish }) : t("invent.loading")} />
      ) : invent.isError ? (
        <StateView state="error" title={t("state.error.title")} body={t("state.error.body")} actionLabel={t("state.retry")} onAction={() => mutate()} />
      ) : failure ? (
        <StateView
          state="empty"
          illustration={illustrations.emptyPicks}
          title={dish && reason === "nothing_safe" ? t("invent.named.fail.title", { dish }) : t(failure.title)}
          body={dish && reason === "nothing_safe" ? t("invent.named.fail.body") : t(failure.body)}
          actionLabel={reason === "nothing_safe" ? t("state.retry") : t("onb.back")}
          onAction={() => (reason === "nothing_safe" ? mutate() : router.back())}
        />
      ) : result?.recipeId ? (
        <>
          <Card hero style={{ gap: space.sm }}>
            <View style={[styles.badge, { backgroundColor: colors.surface }]}>
              <Text variant="caption">{t("invent.badge")}</Text>
            </View>
            <Text variant="title">{(l === "hi" ? result.titles?.hi : l === "hinglish" ? result.titles?.["hi-Latn"] : null) ?? result.title}</Text>
            <Text>{result.description}</Text>
            {result.uses.length ? (
              <Text variant="label" muted>
                {t("invent.uses", { items: result.uses.map((k) => displayName(catalogEntry(k), k, l)).join(", ") })}
              </Text>
            ) : null}
            {result.toBuy?.length ? (
              <View style={{ gap: space.sm }}>
                <Text variant="label" weight={600} color={colors.accentText}>
                  {t("invent.named.toBuy", { items: result.toBuy.map((k) => displayName(catalogEntry(k), k, l)).join(", ") })}
                </Text>
                <View style={{ alignSelf: "flex-start" }}>
                  <Button
                    kind="secondary"
                    size="small"
                    icon={listed ? "check" : "cart"}
                    label={listed ? t("recipe.added") : t("recipe.addMissing", { n: result.toBuy.length })}
                    disabled={listed || addToList.isPending}
                    onPress={() => addToList.mutate(result.toBuy!)}
                  />
                </View>
              </View>
            ) : null}
            <Button label={t("invent.open")} onPress={() => router.replace(`/recipe/${result.recipeId}`)} />
          </Card>
          <Text variant="label" muted>
            {t(result.named ? "invent.named.note" : "invent.note")}
          </Text>
          {result.named ? null : (
            <View style={{ alignSelf: "flex-start" }}>
              <Button kind="quiet" label={t("invent.again")} onPress={() => mutate()} />
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "flex-end" },
  badge: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
});
