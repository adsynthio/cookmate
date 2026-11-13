// F2, family recipes: tell Cookmate a family recipe in any language (type it, or dictate with the keyboard's mic),
// and it is written down their way, private to this family. Where their way breaks a food-safety rule, the recipe
// keeps it but adds the safe step and says why; anything unclear comes back as a question.
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Button, Card, Field, IconButton, Screen, StateView, Text } from "@/design-system/primitives";
import { space } from "@/design-system/tokens";
import { getLocale, t, useLocale } from "@/i18n";
import { services } from "@/services";
import { useSession } from "@/state/session";

export default function FamilyRecipeScreen() {
  useLocale();
  const router = useRouter();
  const householdId = useSession((s) => s.householdId);
  const [telling, setTelling] = useState("");
  const [owner, setOwner] = useState("");
  const save = useMutation({ mutationFn: () => services.recipe.saveFamilyRecipe(householdId!, telling, owner) });
  const r = save.data;
  const l = getLocale();

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <IconButton label={t("onb.back")} onPress={() => router.back()}>
          <Icon name="close" />
        </IconButton>
      </View>
      <Text variant="display" accessibilityRole="header">
        {t("family.title")}
      </Text>
      {save.isPending ? (
        <StateView state="loading" title={t("family.loading")} />
      ) : r?.recipeId ? (
        <Card hero style={{ gap: space.sm }}>
          <Text variant="title">{(l === "hi" ? r.titles?.hi : l === "hinglish" ? r.titles?.["hi-Latn"] : null) ?? r.title}</Text>
          <Text muted>{t("family.saved")}</Text>
          {r.safetyAdded.length ? (
            <View style={{ gap: space.xs }}>
              <Text weight={600}>{t("family.safetyAdded")}</Text>
              {r.safetyAdded.map((x) => (
                <Text key={x}>• {x}</Text>
              ))}
            </View>
          ) : null}
          {r.questions.length ? (
            <View style={{ gap: space.xs }}>
              <Text weight={600}>{t("family.questions")}</Text>
              {r.questions.map((x) => (
                <Text key={x}>• {x}</Text>
              ))}
            </View>
          ) : null}
          <Button label={t("invent.open")} onPress={() => router.replace(`/recipe/${r.recipeId}`)} />
        </Card>
      ) : (
        <>
          <Text muted>{t("family.body")}</Text>
          <Field value={owner} onChangeText={setOwner} placeholder={t("family.ownerPlaceholder")} maxLength={30} accessibilityLabel={t("family.owner")} />
          <Field
            value={telling}
            onChangeText={setTelling}
            placeholder={t("family.placeholder")}
            multiline
            maxLength={3000}
            style={{ minHeight: 160, textAlignVertical: "top" }}
            accessibilityLabel={t("family.title")}
          />
          {r && r.recipeId === null ? (
            <Text muted>{t(r.reason === "unavailable" ? "family.unavailable" : r.reason === "invalid" ? "family.invalid" : "family.unsafe")}</Text>
          ) : null}
          {save.isError ? <Text muted>{t("state.error.body")}</Text> : null}
          <Button label={t("family.save")} disabled={!householdId || telling.trim().length < 20} onPress={() => save.mutate()} />
        </>
      )}
    </Screen>
  );
}
