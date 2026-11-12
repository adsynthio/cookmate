// Something's wrong (KIT-090/091/092): one tap to say what went wrong, then at most three things to do now for
// this dish with what is in the kitchen. The pinned safety line, when one applies, is shown word for word and read
// first. If the rescue function can't be reached, the same reviewed rules run on the phone.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { Icon, type IconName } from "@/design-system/icons";
import { Enter, PressableScale } from "@/design-system/motion";
import { Badge, Button, Card, Chip, IconButton, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space, touch } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { PROBLEMS, type Problem } from "@/domain/rescue";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type RescueFix } from "@/services";
import { hush, say } from "@/services/feedback";
import { localRescue } from "@/services/rescue";
import { useSession } from "@/state/session";

const PROBLEM_ICON: Record<Problem, IconName> = {
  too_salty: "spoon",
  burning: "flame",
  too_watery: "drop",
  too_thick: "skillet",
  too_spicy: "chilli",
  undercooked: "timer",
  missing_ingredient: "search",
};

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
  const stepNo = session.data?.currentStep ?? 1;
  // How to tell the pan is back on track: this step's own cues, good sign and bad sign side by side.
  const current = recipe.data?.steps[stepNo - 1];
  const good = current?.cues?.look ?? current?.cues?.smell ?? current?.cue;
  const bad = current?.cues?.avoid;

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton label={t("rescue.close")} onPress={() => router.back()}>
          <Icon name="close" />
        </IconButton>
        {session.data ? <Badge tone="accent" icon="flame" label={t("rescue.badge", { n: stepNo })} /> : null}
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
          <Enter>
            <View style={[styles.first, shadow.card, { backgroundColor: colors.surface }]}>
              <View style={styles.label}>
                <Icon name="hand" size={18} color={colors.alert} />
                <Text variant="overline" color={colors.alert}>
                  {t("rescue.first").toUpperCase()}
                </Text>
              </View>
              <Text variant="title" accessibilityRole="header">
                {fix.data.steps[0] ?? t("rescue.doThis")}
              </Text>
              <Text muted>{t("rescue.calm")}</Text>
              {fix.data.safetyNote ? (
                <View style={[styles.note, { backgroundColor: colors.alertSoft }]} accessibilityRole="alert">
                  <View style={styles.label}>
                    <Icon name="shield" size={18} color={colors.alert} />
                    <Text variant="bodyStrong" color={colors.alert}>
                      {t("recipe.safety")}
                    </Text>
                  </View>
                  <Text color={colors.alert}>{fix.data.safetyNote}</Text>
                </View>
              ) : null}
            </View>
          </Enter>

          {fix.data.steps.length > 1 ? (
            <>
              <Text variant="heading">{t("rescue.thenTitle")}</Text>
              {fix.data.steps.slice(1).map((s, i) => (
                <Enter key={i} index={i + 1}>
                  <View style={[styles.step, i === 0 ? [shadow.card, { backgroundColor: colors.surface }] : { backgroundColor: colors.surfaceMuted }]}>
                    <View style={[styles.stepNo, { backgroundColor: i === 0 ? colors.accent : colors.surfaceHigh }]}>
                      <Text variant="bodyStrong" color={i === 0 ? colors.onAccent : colors.inkSecondary}>
                        {i + 2}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: space.xs }}>
                      {i === 0 ? <Badge tone="accent" label={t("rescue.now")} /> : null}
                      <Text variant="bodyStrong">{s}</Text>
                    </View>
                  </View>
                </Enter>
              ))}
            </>
          ) : null}

          {good || bad ? (
            <Enter index={3}>
              <Card style={{ gap: space.md }}>
                <View style={styles.label}>
                  <Icon name="eye" size={20} color={colors.primaryText} />
                  <Text variant="heading">{t("rescue.check")}</Text>
                </View>
                <View style={styles.signs}>
                  {good ? (
                    <View style={[styles.sign, { backgroundColor: colors.primaryPale }]}>
                      <Icon name="checkCircle" size={20} color={colors.primaryText} />
                      <Text variant="overline" color={colors.primaryText}>
                        {t("rescue.goodSign").toUpperCase()}
                      </Text>
                      <Text>{good}</Text>
                    </View>
                  ) : null}
                  {bad ? (
                    <View style={[styles.sign, { backgroundColor: colors.accentSoft }]}>
                      <Icon name="warning" size={20} color={colors.accentText} />
                      <Text variant="overline" color={colors.accentText}>
                        {t("rescue.badSign").toUpperCase()}
                      </Text>
                      <Text color={colors.accentText}>{bad}</Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            </Enter>
          ) : null}

          {fix.data.offline ? (
            <Text variant="caption" muted>
              {t("rescue.offline")}
            </Text>
          ) : null}
          <Button size="cook" stretch iconAfter="arrowRight" label={t("rescue.fixed", { n: stepNo })} onPress={() => router.back()} />
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              <Button
                kind="secondary"
                stretch
                icon="speaker"
                label={t("rescue.read")}
                onPress={() => say([fix.data.safetyNote, ...fix.data.steps].filter(Boolean).join(" "))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" stretch icon="undo" label={t("rescue.otherShort")} onPress={startOver} />
            </View>
          </View>
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
          <View style={styles.grid}>
            {PROBLEMS.map((p, i) => (
              <Enter key={p} index={i} style={styles.cell}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={t(`rescue.problem.${p}` as StringKey)}
                  onPress={() => choose(p)}
                  style={[styles.option, shadow.card, { backgroundColor: colors.surface }]}
                >
                  <View style={[styles.well, { backgroundColor: p === "burning" ? colors.accentSoft : colors.surfaceMuted }]}>
                    <Icon name={PROBLEM_ICON[p]} size={22} color={p === "burning" ? colors.accentText : colors.primaryText} />
                  </View>
                  <Text variant="bodyStrong">{t(`rescue.problem.${p}` as StringKey)}</Text>
                </PressableScale>
              </Enter>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  cell: { width: "47%", flexGrow: 1 },
  option: { minHeight: touch.cook * 1.6, borderRadius: radius.card, padding: space.lg, gap: space.md, justifyContent: "space-between" },
  well: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  first: { borderRadius: radius.cardLg, padding: space.xl, gap: space.md },
  label: { flexDirection: "row", alignItems: "center", gap: space.sm },
  note: { borderRadius: radius.card, padding: space.lg, gap: space.xs },
  step: { flexDirection: "row", alignItems: "flex-start", gap: space.md, borderRadius: radius.card, padding: space.lg },
  signs: { flexDirection: "row", gap: space.md },
  sign: { flex: 1, borderRadius: radius.item, padding: space.md, gap: space.xs },
  pair: { flexDirection: "row", gap: space.md },
  stepNo: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
