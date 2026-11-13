// Sprint 14 G6: what the cook sees about safety on a recipe. Every recipe shows its allergens (from the ingredient
// catalog, never from model text). A recipe Cookmate's AI wrote also says so plainly ("check as you cook") and has
// "Something's off with this recipe": the household hides it at once and it goes for review (G5).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";

import { catalog } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { Badge, Button, Card, Text } from "@/design-system/primitives";
import { space } from "@/design-system/tokens";
import type { CatalogEntry } from "@/domain/invent";
import { recipeAllergens } from "@/domain/recipeSafety";
import type { RecipeDoc } from "@/domain/recipes";
import { t, type StringKey } from "@/i18n";
import { services } from "@/services";
import type { RecipeReportReason } from "@/services/types";

const CATALOG = new Map((catalog as unknown as CatalogEntry[]).map((c) => [c.name, c]));
const REASONS: RecipeReportReason[] = ["unsafe", "wrong", "didnt_work", "other"];

/** True for a recipe Cookmate's AI wrote for this household. */
export function isAiRecipe(doc: RecipeDoc): boolean {
  return !!doc.tags?.includes("new_creation") || !!doc.tags?.includes("family_recipe");
}

export function SafetyNotes({ doc, householdId, onReported }: { doc: RecipeDoc; householdId: string | null; onReported: () => void }) {
  const allergens = recipeAllergens(doc, CATALOG);
  const ai = isAiRecipe(doc);
  const [asking, setAsking] = useState(false);
  const qc = useQueryClient();
  const report = useMutation({
    mutationFn: (reason: RecipeReportReason) => services.recipe.reportRecipe(householdId!, doc.id ?? doc.slug, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipe", doc.id ?? doc.slug] });
      onReported();
    },
  });
  if (!allergens.length && !ai) return null;

  return (
    <Card style={{ gap: space.sm }}>
      {ai ? (
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
          <Icon name="sparkle" size={18} />
          <Text style={{ flex: 1 }}>{t(doc.tags?.includes("family_recipe") ? "safety.familyLabel" : "safety.aiLabel")}</Text>
        </View>
      ) : null}
      {allergens.length ? (
        <View style={{ gap: space.xs }}>
          <Text variant="caption" muted>
            {t("safety.contains")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {allergens.map((a) => (
              <Badge key={a} tone="peach" label={t(`allergen.${a}` as StringKey)} />
            ))}
          </View>
        </View>
      ) : null}
      {ai && householdId ? (
        asking ? (
          <View style={{ gap: space.xs }}>
            <Text weight={600}>{t("safety.report.title")}</Text>
            {REASONS.map((r) => (
              <Button
                key={r}
                kind="secondary"
                label={t(`safety.report.${r}` as StringKey)}
                disabled={report.isPending}
                onPress={() => report.mutate(r)}
              />
            ))}
            {report.isError ? <Text muted>{t("state.error.body")}</Text> : null}
            <Button kind="quiet" label={t("onb.back")} onPress={() => setAsking(false)} />
          </View>
        ) : (
          <Button kind="quiet" icon="warning" label={t("safety.report.open")} onPress={() => setAsking(true)} />
        )
      ) : null}
    </Card>
  );
}
