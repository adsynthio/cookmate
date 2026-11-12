// "Your way" (KIT-051): change spice, servings, missing items, equipment, diet or time for a recipe. The service
// applies the reviewed rules first and validates every result; the new version opens in place of the base recipe.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { Button, Card, Chip, IconButton, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { pantryMatch, type Diet } from "@/domain/ranking";
import { toRankRecipe, type RecipeDoc } from "@/domain/recipes";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services } from "@/services";
import { pantryEntries, STAPLES } from "@/services/picks";
import { useSession } from "@/state/session";

export default function AdaptScreen() {
  useLocale();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const householdId = useSession((s) => s.householdId);
  const recipe = useQuery({ queryKey: ["recipe", id], queryFn: () => services.recipe.getRecipe(id!), enabled: !!id });
  const kitchen = useQuery({
    queryKey: ["kitchen", householdId],
    queryFn: () => services.kitchen.getKitchen(householdId!),
    enabled: !!householdId,
  });

  return (
    <Screen>
      <View style={styles.top}>
        <IconButton label={t("onb.back")} onPress={() => router.back()}>
          <Icon name="close" />
        </IconButton>
      </View>
      {recipe.isPending ? (
        <StateView state="loading" title={t("adapt.title")} />
      ) : recipe.isError ? (
        <StateView state="error" title={t("recipe.notFound")} actionLabel={t("state.retry")} onAction={() => recipe.refetch()} />
      ) : (
        <AdaptForm doc={recipe.data} items={kitchen.data ?? []} householdId={householdId!} />
      )}
    </Screen>
  );
}

const SPICE: { label: StringKey; value: (base: number) => number }[] = [
  { label: "adapt.noChilli", value: () => 1 },
  { label: "adapt.milder", value: (b) => Math.max(1, b - 1) },
  { label: "adapt.asWritten", value: (b) => b },
  { label: "adapt.hotter", value: (b) => Math.min(5, b + 1) },
];

function AdaptForm({ doc, items, householdId }: { doc: RecipeDoc; items: Parameters<typeof pantryEntries>[0]; householdId: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const locale = getLocale();
  const rules = doc.variation_rules ?? [];

  const match = useMemo(() => pantryMatch(toRankRecipe(doc), pantryEntries(items), STAPLES), [doc, items]);
  const essentials = doc.ingredients.filter((i) => !i.optional);
  const [missing, setMissing] = useState<string[]>(match.items.filter((m) => m.status === "missing").map((m) => m.key));
  const [spice, setSpice] = useState(doc.spice_level);
  const equipmentOptions = [...new Set(rules.filter((r) => r.type === "equipment" && typeof r.condition?.missing_equipment === "string").map((r) => r.condition!.missing_equipment as string))];
  const [noEquipment, setNoEquipment] = useState<string[]>([]);
  const dietOptions = [...new Set(rules.filter((r) => r.type === "diet" && typeof r.condition?.diet === "string").map((r) => r.condition!.diet as Diet))];
  const [diet, setDiet] = useState<Diet | null>(null);
  const timeRule = rules.find((r) => r.type === "omit" && typeof r.condition?.max_time_min === "number");
  const quickMin = timeRule ? (timeRule.condition!.max_time_min as number) : null;
  const [quick, setQuick] = useState(false);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const changed = spice !== doc.spice_level || noEquipment.length > 0 || diet !== null || quick || missing.length > 0;

  const adapt = useMutation({
    mutationFn: () =>
      services.recipe.adaptRecipe({
        householdId,
        recipeId: doc.id ?? doc.slug,
        missing,
        spice: spice !== doc.spice_level ? spice : undefined,
        missingEquipment: noEquipment,
        diet: diet ?? undefined,
        maxTimeMin: quick && quickMin ? quickMin : undefined,
      }),
    onSuccess: (r) => {
      if (r.adaptedRecipeId) router.replace(`/recipe/${r.adaptedRecipeId}`);
    },
  });
  const addToList = useMutation({
    mutationFn: (keys: string[]) => services.kitchen.addToList(householdId, keys.map((k) => ({ name: k, reason: "manual" as const }))),
  });
  const nameOf = (k: string) => displayName(catalogEntry(k), k, locale);
  const unresolved = adapt.data && !adapt.data.adaptedRecipeId ? adapt.data.unresolved : [];

  return (
    <>
      <Text variant="title" accessibilityRole="header">
        {t("adapt.title")}
      </Text>
      <Text muted>{t("adapt.body")}</Text>

      <Text variant="heading">{t("adapt.spice")}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {SPICE.map((s) => {
          const v = s.value(doc.spice_level);
          return <Chip key={s.label} label={t(s.label)} selected={spice === v} onPress={() => setSpice(v)} />;
        })}
      </View>

      <Text variant="heading">{t("adapt.dontHave")}</Text>
      <View style={styles.chips}>
        {essentials.map((i) => (
          <Chip key={i.ingredient} label={nameOf(i.ingredient)} selected={missing.includes(i.ingredient)} onPress={() => setMissing((m) => toggle(m, i.ingredient))} />
        ))}
      </View>

      {equipmentOptions.length ? (
        <>
          <Text variant="heading">{t("adapt.equipment")}</Text>
          <View style={styles.chips}>
            {equipmentOptions.map((e) => (
              <Chip
                key={e}
                label={t("adapt.noEquipment", { item: t(`equip.${e}` as StringKey) })}
                selected={noEquipment.includes(e)}
                onPress={() => setNoEquipment((l) => toggle(l, e))}
              />
            ))}
          </View>
        </>
      ) : null}

      {dietOptions.length || quickMin ? (
        <>
          <Text variant="heading">{t("adapt.diet")}</Text>
          <View style={styles.chips}>
            {dietOptions.map((d) => (
              <Chip key={d} label={t(`diet.${d}` as StringKey)} selected={diet === d} onPress={() => setDiet(diet === d ? null : d)} />
            ))}
            {quickMin ? <Chip label={t("adapt.quick", { min: quickMin })} selected={quick} onPress={() => setQuick((q) => !q)} /> : null}
          </View>
        </>
      ) : null}

      {unresolved.length ? (
        <Card tint={colors.peach} style={{ borderRadius: radius.card }}>
          <Text accessibilityLiveRegion="polite">{t("adapt.unresolved", { items: unresolved.map(nameOf).join(", ") })}</Text>
          <Button
            kind="secondary"
            label={addToList.isSuccess ? t("recipe.added") : t("recipe.addOne")}
            disabled={addToList.isPending || addToList.isSuccess}
            onPress={() => addToList.mutate(unresolved)}
          />
        </Card>
      ) : null}
      {adapt.isError ? <Text color={colors.alert}>{t("state.error.body")}</Text> : null}

      <Button
        label={adapt.isPending ? t("adapt.working") : changed ? t("adapt.apply") : t("adapt.noChange")}
        size="cook"
        disabled={!changed || adapt.isPending}
        onPress={() => adapt.mutate()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
