// Cook tab: pick up a dish you were in the middle of (KIT-079), with its timers still running, or go and choose one.
import { KitchenIdeas } from "@/components/cook/KitchenIdeas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { StepProgress } from "@/components/cook/StepParts";
import { TimerChips } from "@/components/cook/TimerChips";
import { useNow } from "@/components/cook/useNow";
import { DishPhoto } from "@/design-system/FoodPhoto";
import { dishImage, illustrations } from "@/design-system/media";
import { Enter, PressableScale } from "@/design-system/motion";
import { Badge, Button, Screen, SectionHeader, StateView, Text } from "@/design-system/primitives";
import { Icon } from "@/design-system/icons";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { Image, ScrollView, StyleSheet } from "react-native";
import { recipeDocs } from "@/data/recipes";
import { GuestsCard } from "@/components/cook/GuestsCard";
import { recipeTitle } from "@/domain/recipes";
import { getLocale, t, useLocale } from "@/i18n";
import { minutesText, recipeTimeText } from "@/i18n/duration";
import { services } from "@/services";
import { useSession } from "@/state/session";
import { useTimers } from "@/state/timers";

const BASICS_ORDER = ["roti", "paratha", "puri", "bhatura", "kulcha", "jeera-rice", "plain-dal", "onion-tomato-masala", "boiled-chana"];

export default function CookTab() {
  useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const householdId = useSession((s) => s.householdId)!;
  const { colors } = useTheme();
  // S5: the basics anyone can learn, living alone or not (roti, paratha, puri, bhatura, kulcha, rice, dal).
  const basics = recipeDocs
    .filter((d) => d.tags?.includes("basics"))
    .sort((a, b) => BASICS_ORDER.indexOf(a.slug) - BASICS_ORDER.indexOf(b.slug));
  // With nothing on the stove: the household's saved dishes, one tap from cooking.
  const saved = useQuery({ queryKey: ["favourites", householdId], queryFn: () => services.recipe.listFavourites(householdId) });

  const active = useQuery({
    queryKey: ["cook-active", householdId],
    queryFn: () => services.cooking.getActiveSession(householdId),
    staleTime: 0,
  });
  const { refetch } = active;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const session = active.data ?? null;
  const recipe = useQuery({
    queryKey: ["recipe", session?.recipeId],
    queryFn: () => services.recipe.getRecipe(session!.recipeId),
    enabled: !!session,
  });

  const allTimers = useTimers((s) => s.timers);
  const stopTimer = useTimers((s) => s.cancel);
  const clearTimers = useTimers((s) => s.clearSession);
  const timers = session ? allTimers.filter((x) => x.sessionId === session.id) : [];
  const now = useNow(timers.length > 0);

  const stop = useMutation({
    mutationFn: (sessionId: string) => services.cooking.abandonSession(sessionId),
    onSuccess: (_, sessionId) => {
      void clearTimers(sessionId);
      void queryClient.invalidateQueries({ queryKey: ["cook-active"] });
    },
  });

  return (
    <Screen header={<AppHeader title={t("cook.title")} />}>
      {active.isPending || (session && recipe.isPending) ? (
        <StateView state="loading" title={t("cook.title")} />
      ) : active.isError || recipe.isError ? (
        <StateView
          state="error"
          title={t("state.error.title")}
          body={t("state.error.body")}
          actionLabel={t("state.retry")}
          onAction={() => void (active.isError ? active.refetch() : recipe.refetch())}
        />
      ) : session && recipe.data ? (
        <>
          <Enter>
            <View style={[styles.resume, shadow.card, { backgroundColor: colors.surface }]}>
              <View style={[styles.photo, { backgroundColor: colors.primaryPale }]}>
                {/* U18: no photo yet? The dish's own emoji on its tint, not an empty block. */}
                {dishImage(recipe.data.slug) ? (
                  <Image source={dishImage(recipe.data.slug)!} style={styles.photoFill} resizeMode="cover" accessible={false} />
                ) : (
                  <DishPhoto slug={recipe.data.slug} name={recipe.data.title} course={recipe.data.course} size={120} round />
                )}
                <View style={styles.photoTag}>
                  <Badge tone="onColor" icon="cook" label={t("cook.resume.badge")} />
                </View>
              </View>
              <View style={{ padding: space.lg, gap: space.md }}>
                <Text variant="title">{t("cook.resume.title", { dish: recipeTitle(recipe.data, getLocale()) })}</Text>
                <Text muted>{t("cook.resume.step", { n: Math.min(session.currentStep, recipe.data.steps.length), total: recipe.data.steps.length })}</Text>
                <StepProgress n={Math.min(session.currentStep, recipe.data.steps.length)} total={recipe.data.steps.length} />
                <Button kind="accent" size="cook" stretch iconAfter="arrowRight" label={t("cook.resume.go")} onPress={() => router.push(`/cook/${session.id}`)} />
              </View>
            </View>
          </Enter>
          <TimerChips timers={timers} now={now} onStop={(id) => void stopTimer(id)} />
          {timers.length ? (
            <View style={{ alignSelf: "flex-start" }}>
              <Button kind="secondary" size="small" icon="timer" label={t("timers.open")} onPress={() => router.push(`/timers/${session.id}`)} />
            </View>
          ) : null}
          {stop.isError ? <Text>{t("state.error.body")}</Text> : null}
          <View style={{ alignSelf: "flex-start" }}>
            <Button kind="quiet" size="small" icon="close" label={t("cook.resume.stop")} disabled={stop.isPending} onPress={() => stop.mutate(session.id)} />
          </View>
        </>
      ) : (
        <>
          {/* U18: one compact card instead of a screen-high empty state, so what you can cook shows straight away. */}
          <Enter>
            <View style={[styles.stove, { backgroundColor: colors.surfaceMuted }]}>
              {illustrations.emptyPicks ? <Image source={illustrations.emptyPicks} style={styles.stoveArt} accessible={false} /> : null}
              <View style={{ flex: 1, gap: space.xs }}>
                <Text variant="subheading">{t("cook.stoveTitle")}</Text>
                <Text variant="label" muted>
                  {t("cook.empty")}
                </Text>
                <View style={{ alignSelf: "flex-start", marginTop: space.xs }}>
                  <Button kind="accent" size="small" iconAfter="arrowRight" label={t("cook.pick")} onPress={() => router.navigate("/")} />
                </View>
              </View>
            </View>
          </Enter>
          {saved.data?.length ? (
            <>
              <SectionHeader title={t("cook.savedTitle")} dot={undefined} />
              {saved.data.map((d, i) => (
                <Enter key={d.id} index={i}>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={recipeTitle(d, getLocale())}
                    onPress={() => router.push(`/recipe/${d.id}`)}
                    style={[styles.row, shadow.card, { backgroundColor: colors.surface }]}
                  >
                    <DishPhoto slug={d.slug} name={d.title} course={d.course} size={56} round />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyStrong">{recipeTitle(d, getLocale())}</Text>
                      {d.totalTimeMin ? (
                        <Text variant="caption" muted>
                          {minutesText(d.totalTimeMin)}
                        </Text>
                      ) : null}
                    </View>
                    <Icon name="forward" size={20} color={colors.inkSecondary} />
                  </PressableScale>
                </Enter>
              ))}
            </>
          ) : null}
          {/* M4: what this kitchen can make right now, and what's one swap away. */}
          <KitchenIdeas householdId={householdId} />
          {/* F2: a family recipe, told in any language, written down their way. */}
          <View style={{ alignSelf: "flex-start" }}>
            <Button kind="secondary" icon="edit" label={t("family.open")} onPress={() => router.push("/family-recipe")} />
          </View>
          {/* S10: guests tonight, one menu and one timeline. */}
          <GuestsCard householdId={householdId} />
          {basics.length ? (
            <>
              <SectionHeader title={t("cook.basicsTitle")} dot={undefined} />
              <Text variant="label" muted>
                {t("cook.basicsBody")}
              </Text>
              {/* U18: a shelf of tiles you swipe through, not a second long list (some are also in the ideas above). */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.shelf}>
                {basics.map((d, i) => (
                  <Enter key={d.slug} index={i}>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`${recipeTitle(d, getLocale())}, ${recipeTimeText(d)}`}
                      onPress={() => router.push(`/recipe/${d.slug}`)}
                      style={[styles.tile, shadow.card, { backgroundColor: colors.surface }]}
                    >
                      <DishPhoto slug={d.slug} name={d.title} course={d.course} size={76} round />
                      <Text variant="bodyStrong" numberOfLines={2} style={styles.tileName}>
                        {recipeTitle(d, getLocale())}
                      </Text>
                      <Text variant="caption" muted numberOfLines={1}>
                        {recipeTimeText(d)}
                      </Text>
                    </PressableScale>
                  </Enter>
                ))}
              </ScrollView>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  resume: { borderRadius: radius.cardLg, overflow: "hidden" },
  photo: { height: 180, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  photoFill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  photoTag: { position: "absolute", left: space.md, bottom: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.card, padding: space.md },
  stove: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.cardLg, padding: space.lg },
  stoveArt: { width: 84, height: 84 },
  // The shelf runs to the screen edges, so the next tile peeks in from the side.
  bleed: { marginHorizontal: -space.gutter },
  shelf: { gap: space.sm, paddingVertical: 6, paddingHorizontal: space.gutter },
  tile: { width: 128, alignItems: "center", gap: 4, borderRadius: radius.card, paddingVertical: space.md, paddingHorizontal: space.sm },
  tileName: { textAlign: "center", minHeight: 40 },
});
