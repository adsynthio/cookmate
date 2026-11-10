// Cook tab: pick up a dish you were in the middle of (KIT-079), with its timers still running, or go and choose one.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";

import { TimerChips } from "@/components/cook/TimerChips";
import { useNow } from "@/components/cook/useNow";
import { illustrations } from "@/design-system/media";
import { Button, Card, Screen, StateView, Text } from "@/design-system/primitives";
import { space } from "@/design-system/tokens";
import { recipeTitle } from "@/domain/recipes";
import { getLocale, t, useLocale } from "@/i18n";
import { services } from "@/services";
import { useSession } from "@/state/session";
import { useTimers } from "@/state/timers";

export default function CookTab() {
  useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const householdId = useSession((s) => s.householdId)!;

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
    <Screen>
      <Text variant="display" accessibilityRole="header">
        {t("cook.title")}
      </Text>
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
          <Card hero style={{ gap: space.md }}>
            <Text variant="title">{t("cook.resume.title", { dish: recipeTitle(recipe.data, getLocale()) })}</Text>
            <Text>{t("cook.resume.step", { n: Math.min(session.currentStep, recipe.data.steps.length), total: recipe.data.steps.length })}</Text>
            <Button size="cook" label={t("cook.resume.go")} onPress={() => router.push(`/cook/${session.id}`)} />
          </Card>
          <TimerChips timers={timers} now={now} onStop={(id) => void stopTimer(id)} />
          {stop.isError ? <Text>{t("state.error.body")}</Text> : null}
          <View>
            <Button kind="quiet" label={t("cook.resume.stop")} disabled={stop.isPending} onPress={() => stop.mutate(session.id)} />
          </View>
        </>
      ) : (
        <StateView
          state="empty"
          illustration={illustrations.emptyPicks}
          title={t("cook.empty")}
          actionLabel={t("cook.pick")}
          onAction={() => router.navigate("/")}
        />
      )}
    </Screen>
  );
}
