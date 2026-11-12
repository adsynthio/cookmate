// Recipe search in any language and script (KIT-054, REC-08): "rajma", "राजमा" or "kidney bean curry".
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { dishImage, illustrations } from "@/design-system/media";
import { Card, Field, IconButton, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { recipeTitle } from "@/domain/recipes";
import { getLocale, t, useLocale } from "@/i18n";
import { services, type RecipeSummary } from "@/services";

export default function SearchScreen() {
  useLocale();
  const router = useRouter();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");

  // Search as you type, a beat after the last key.
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);

  const results = useQuery({
    queryKey: ["search", query],
    queryFn: () => services.recipe.searchRecipes(query),
    enabled: query.length >= 2,
  });

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton label={t("onb.back")} onPress={() => router.back()}>
          <Icon name="back" />
        </IconButton>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          {t("search.title")}
        </Text>
      </View>
      <Field
        value={text}
        onChangeText={setText}
        placeholder={t("search.placeholder")}
        accessibilityLabel={t("search.title")}
        autoFocus
        returnKeyType="search"
        autoCapitalize="none"
      />
      {query.length < 2 ? (
        <Text muted>{t("search.hint")}</Text>
      ) : results.isPending ? (
        <StateView state="loading" title={t("search.title")} />
      ) : results.isError ? (
        <StateView
          state="error"
          title={t("state.error.title")}
          body={t("state.error.body")}
          actionLabel={t("state.retry")}
          onAction={() => results.refetch()}
        />
      ) : results.data.length === 0 ? (
        <StateView
          state="empty"
          illustration={illustrations.emptyPicks}
          title={t("search.none", { q: query })}
          body={t("search.noneBody")}
        />
      ) : (
        results.data.map((r) => <ResultRow key={r.id} recipe={r} onPress={() => router.push(`/recipe/${r.id}`)} />)
      )}
    </Screen>
  );
}

function ResultRow({ recipe, onPress }: { recipe: RecipeSummary; onPress: () => void }) {
  const { colors } = useTheme();
  const photo = dishImage(recipe.slug);
  const title = recipeTitle(recipe, getLocale());
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
      {({ pressed }) => (
        <Card style={[styles.row, { opacity: pressed ? 0.8 : 1 }]}>
          {photo ? (
            <Image source={photo} style={styles.thumb} accessible={false} />
          ) : (
            <View style={[styles.thumb, { backgroundColor: colors.primaryPale }]} accessible={false} />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{title}</Text>
            {recipe.totalTimeMin ? (
              <Text variant="label" muted>
                {t("home.minutes", { min: recipe.totalTimeMin })}
              </Text>
            ) : null}
          </View>
          <Icon name="forward" muted />
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  thumb: { width: 48, height: 48, borderRadius: 24 },
});
