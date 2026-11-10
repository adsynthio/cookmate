// Quick start from yesterday's meal (KIT-026, ONB-07): pick the dish you cooked, and its ingredients are added as
// unconfirmed guesses (confidence 0.4): they show "Still have this?" in Kitchen, don't count towards picks and never
// reach Use Soon until confirmed. One tap clears them all.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { illustrations } from "@/design-system/media";
import { Button, Card, Field, IconButton, Screen, StateView, Text } from "@/design-system/primitives";
import { space } from "@/design-system/tokens";
import { recipeTitle } from "@/domain/recipes";
import { getLocale, t, useLocale } from "@/i18n";
import { services, type RecipeSummary } from "@/services";
import { useSession } from "@/state/session";

export default function YesterdayScreen() {
  useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const householdId = useSession((s) => s.householdId)!;
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);

  const results = useQuery({
    queryKey: ["search", query],
    queryFn: () => services.recipe.searchRecipes(query),
    enabled: query.length >= 2,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["kitchen", householdId] });
  const guess = useMutation({
    mutationFn: (r: RecipeSummary) => services.kitchen.guessFromRecipe(householdId, r.id),
    onSuccess: refresh,
  });
  const clear = useMutation({
    mutationFn: (ids: string[]) => services.kitchen.clearGuesses(householdId, ids),
    onSuccess: refresh,
  });

  const dish = guess.variables ? recipeTitle(guess.variables, getLocale()) : "";

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton label={t("onb.back")} onPress={() => router.back()}>
          <Icon name="close" />
        </IconButton>
      </View>
      <Text variant="title" accessibilityRole="header">
        {t("quick.title")}
      </Text>

      {guess.isSuccess ? (
        <Card hero>
          <Text variant="heading" accessibilityLiveRegion="polite">
            {guess.data.length ? t("quick.added", { n: guess.data.length, dish }) : t("quick.none", { dish })}
          </Text>
          {guess.data.length ? <Text>{t("quick.addedBody")}</Text> : null}
          <View style={styles.row}>
            {guess.data.length ? (
              <View style={{ flex: 1 }}>
                <Button
                  kind="secondary"
                  label={clear.isSuccess ? t("quick.cleared") : t("quick.clear")}
                  disabled={clear.isPending || clear.isSuccess}
                  onPress={() => clear.mutate(guess.data)}
                />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button label={t("quick.done")} onPress={() => router.back()} />
            </View>
          </View>
        </Card>
      ) : (
        <>
          <Text muted>{t("quick.body")}</Text>
          <Field
            value={text}
            onChangeText={setText}
            placeholder={t("search.placeholder")}
            accessibilityLabel={t("quick.title")}
            autoFocus
            autoCapitalize="none"
          />
          {guess.isError ? <Text>{t("state.error.body")}</Text> : null}
          {query.length < 2 ? null : results.isPending ? (
            <StateView state="loading" title={t("search.title")} />
          ) : results.isError ? (
            <StateView state="error" title={t("state.error.title")} actionLabel={t("state.retry")} onAction={() => results.refetch()} />
          ) : results.data.length === 0 ? (
            <StateView state="empty" illustration={illustrations.emptyPicks} title={t("search.none", { q: query })} body={t("search.noneBody")} />
          ) : (
            results.data.map((r) => (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={recipeTitle(r, getLocale())}
                disabled={guess.isPending}
                onPress={() => guess.mutate(r)}
              >
                {({ pressed }) => (
                  <Card style={[styles.result, { opacity: pressed || guess.isPending ? 0.7 : 1 }]}>
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {recipeTitle(r, getLocale())}
                    </Text>
                    <Icon name="plus" />
                  </Card>
                )}
              </Pressable>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row" },
  row: { flexDirection: "row", gap: space.sm },
  result: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
});
