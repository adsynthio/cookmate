// Something's wrong (KIT-090/091/092): one tap to say what went wrong, then at most three things to do now for
// this dish with what is in the kitchen. The pinned safety line, when one applies, is shown word for word and read
// first. If the rescue function can't be reached, the same reviewed rules run on the phone.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { Button, Card, Chip, IconButton, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space, touch } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { PROBLEMS, type Problem } from "@/domain/rescue";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type RescueFix } from "@/services";
import { hush, say } from "@/services/feedback";
import { localRescue } from "@/services/rescue";
import { useSession } from "@/state/session";

export default function RescueScreen() {
  useLocale();
  const { colors } = useTheme();
  const router = useRouter();
  const locale = getLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const householdId = useSession((s) => s.householdId);
  const [problem, setProblem] = useState<Problem | null>(null);
  useEffect(() => hush, []);

  const session = useQuery({ queryKey: ["cook", id], queryFn: () => services.cooking.getSession(id!), enabled: !!id });
  const recipeId = session.data?.recipeId;
  const recipe = useQuery({ queryKey: ["recipe", recipeId], queryFn: () => services.recipe.getRecipe(recipeId!), enabled: !!recipeId });
  const kitchen = useQuery({
    queryKey: ["kitchen", householdId],
    queryFn: () => services.kitchen.getKitchen(householdId!),
    enabled: !!householdId,
  });

  const fix = useMutation({
    mutationFn: async (input: { problem: Problem; missing?: string }): Promise<RescueFix & { offline?: boolean }> => {
      try {
        return await services.cooking.rescue({ sessionId: id!, ...input, languageCode: LANGUAGE_CODES[locale] });
      } catch (err) {
        // No network at the stove is normal: answer from the playbook on the phone.
        if (!recipe.data) throw err;
        return { ...localRescue(recipe.data, kitchen.data ?? [], input, locale), offline: true };
      }
    },
  });

  const choose = (p: Problem) => {
    setProblem(p);
    if (p !== "missing_ingredient") fix.mutate({ problem: p });
  };
  const startOver = () => {
    hush();
    setProblem(null);
    fix.reset();
  };
  const nameOf = (key: string) => displayName(catalogEntry(key), key, locale);

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton label={t("rescue.close")} onPress={() => router.back()}>
          <Icon name="close" />
        </IconButton>
      </View>

      {session.isPending || recipe.isPending ? (
        <StateView state="loading" title={t("rescue.title")} />
      ) : session.isError || recipe.isError ? (
        <StateView
          state="error"
          title={t("cook.notFound")}
          body={t("state.error.body")}
          actionLabel={t("state.retry")}
          onAction={() => void (session.isError ? session.refetch() : recipe.refetch())}
        />
      ) : fix.isPending ? (
        <StateView state="loading" title={t("rescue.finding")} />
      ) : fix.isSuccess ? (
        <>
          <Text variant="title" accessibilityRole="header">
            {t("rescue.doThis")}
          </Text>
          {fix.data.safetyNote ? (
            <View style={[styles.note, { backgroundColor: colors.alertSoft }]} accessibilityRole="alert">
              <Text variant="bodyStrong" color={colors.alert}>
                {t("recipe.safety")}
              </Text>
              <Text color={colors.alert}>{fix.data.safetyNote}</Text>
            </View>
          ) : null}
          {fix.data.steps.map((s, i) => (
            <Card key={i} style={styles.step}>
              <View style={[styles.stepNo, { backgroundColor: colors.limeSoft }]}>
                <Text variant="bodyStrong">{i + 1}</Text>
              </View>
              <Text variant="heading" style={{ flex: 1 }}>
                {s}
              </Text>
            </Card>
          ))}
          {fix.data.offline ? (
            <Text variant="caption" muted>
              {t("rescue.offline")}
            </Text>
          ) : null}
          <Button
            kind="secondary"
            label={t("rescue.read")}
            onPress={() => say([fix.data.safetyNote, ...fix.data.steps].filter(Boolean).join(" "))}
          />
          <Button size="cook" label={t("rescue.back")} onPress={() => router.back()} />
          <Button kind="quiet" label={t("rescue.other")} onPress={startOver} />
        </>
      ) : problem === "missing_ingredient" ? (
        <>
          <Text variant="title" accessibilityRole="header">
            {t("rescue.which")}
          </Text>
          <View style={styles.chips}>
            {[...new Set(recipe.data.ingredients.map((i) => i.ingredient))].map((key) => (
              <Chip key={key} label={nameOf(key)} onPress={() => fix.mutate({ problem: "missing_ingredient", missing: key })} />
            ))}
          </View>
          <Button kind="quiet" label={t("rescue.other")} onPress={startOver} />
        </>
      ) : (
        <>
          <Text variant="title" accessibilityRole="header">
            {t("rescue.title")}
          </Text>
          <Text muted>{t("rescue.body")}</Text>
          {fix.isError ? <Text color={colors.alert}>{t("state.error.body")}</Text> : null}
          {PROBLEMS.map((p) => (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityLabel={t(`rescue.problem.${p}` as StringKey)}
              onPress={() => choose(p)}
              style={({ pressed }) => [styles.option, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {t(`rescue.problem.${p}` as StringKey)}
              </Text>
              <Icon name="forward" size={20} muted />
            </Pressable>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  option: { flexDirection: "row", alignItems: "center", minHeight: touch.cook, borderRadius: radius.card, paddingHorizontal: space.lg, gap: space.md },
  note: { borderRadius: radius.card, padding: space.lg, gap: space.xs },
  step: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  stepNo: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
