// "Make something new from what's here" (KIT-056, REC-06): a dish invented from leftovers, homemade components and
// things about to spoil. The service only returns dishes that passed the food-safety checks; it is saved as the
// household's own recipe and labelled "new creation" wherever it appears.
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";
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
  const invent = useMutation({ mutationFn: () => services.recipe.inventDish(householdId!) });
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
        {t("invent.title")}
      </Text>
      {invent.isPending || (!result && !invent.isError) ? (
        <StateView state="loading" title={t("invent.loading")} />
      ) : invent.isError ? (
        <StateView state="error" title={t("state.error.title")} body={t("state.error.body")} actionLabel={t("state.retry")} onAction={() => mutate()} />
      ) : failure ? (
        <StateView
          state="empty"
          illustration={illustrations.emptyPicks}
          title={t(failure.title)}
          body={t(failure.body)}
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
            <Text variant="label" muted>
              {t("invent.uses", { items: result.uses.map((k) => displayName(catalogEntry(k), k, l)).join(", ") })}
            </Text>
            <Button label={t("invent.open")} onPress={() => router.replace(`/recipe/${result.recipeId}`)} />
          </Card>
          <Text variant="label" muted>
            {t("invent.note")}
          </Text>
          <View style={{ alignSelf: "flex-start" }}>
            <Button kind="quiet" label={t("invent.again")} onPress={() => mutate()} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "flex-end" },
  badge: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
});
