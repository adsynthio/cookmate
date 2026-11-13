// F1, house-cook handoff: "Send to the cook" shares tonight's dish as a plain message (WhatsApp or any app) in the
// language the cook reads: the family's allergies and dislikes first, tonight's amounts, the steps and their safety
// notes, and what this family remembers about the dish. Built from the checked recipe (domain/handoff), no AI.
import { useState } from "react";
import { Share, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { Button, Text } from "@/design-system/primitives";
import { space } from "@/design-system/tokens";
import { handoffText } from "@/domain/handoff";
import { displayName } from "@/domain/kitchen";
import { inLocalUnits, localStep, prettyQty, recipeTitle, scaleQty, type RecipeDoc } from "@/domain/recipes";
import { t, tIn, type StringKey } from "@/i18n";
import { type AppLocale, contentLocale } from "@/i18n/locale";

const LANGS: AppLocale[] = ["hi", "hinglish", "en", "kn"];
const MEASURES = ["katori", "cup", "chammach", "chhota_chammach", "chutki", "clove", "inch"];

export function HandoffButton({
  doc, servings, avoid, notes, skips,
}: { doc: RecipeDoc; servings: number; avoid: string[]; notes: { key: string; more: boolean }[]; skips: string[] }) {
  const [choosing, setChoosing] = useState(false);
  const [copied, setCopied] = useState(false);

  const send = async (app: AppLocale) => {
    // The app's own words in the chosen language; recipe text and names in the nearest written language (Kannada
    // recipe text doesn't exist yet, so it reads English).
    const l = contentLocale(app);
    const name = (k: string) => displayName(catalogEntry(k), k, l);
    const amount = (ing: RecipeDoc["ingredients"][number]) => {
      const entry = catalogEntry(ing.ingredient);
      const sized = entry?.category === "vegetable" || entry?.category === "fruit";
      const local = inLocalUnits(scaleQty(ing.qty, doc.base_servings, servings), ing.unit, entry?.measures, sized);
      const unit = local.unit === "piece" ? "" : MEASURES.includes(local.unit) ? tIn(app, `measure.${local.unit}` as StringKey) : local.unit;
      return `${prettyQty(local.qty)} ${unit}`.trim();
    };
    const message = handoffText({
      title: recipeTitle(doc, l),
      servings,
      avoid: avoid.map(name),
      notes: notes.map((n) => tIn(app, n.more ? "handoff.more" : "handoff.less", { item: name(n.key) })),
      ingredients: doc.ingredients.filter((i) => !skips.includes(i.ingredient)).map((i) => ({ name: name(i.ingredient), amount: amount(i) })),
      steps: doc.steps.map((s) => {
        const x = localStep(s, l);
        return { text: x.text, safety: x.safety };
      }),
      words: {
        heading: tIn(app, "handoff.heading", { dish: recipeTitle(doc, l), n: servings }),
        avoid: tIn(app, "handoff.avoid"),
        notes: tIn(app, "handoff.notes"),
        ingredients: tIn(app, "handoff.ingredients"),
        steps: tIn(app, "handoff.steps"),
        safety: tIn(app, "handoff.safety"),
        footer: tIn(app, "handoff.footer"),
      },
    });
    setChoosing(false);
    try {
      await Share.share({ message });
    } catch {
      try {
        await (globalThis.navigator as { clipboard?: { writeText(s: string): Promise<void> } } | undefined)?.clipboard?.writeText(message);
        setCopied(true);
      } catch {}
    }
  };

  return (
    <View style={{ gap: space.xs }}>
      {choosing ? (
        <>
          <Text weight={600}>{t("handoff.which")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {LANGS.map((l) => (
              <Button key={l} kind="secondary" size="small" label={t(`handoff.lang.${l}` as StringKey)} onPress={() => void send(l)} />
            ))}
          </View>
        </>
      ) : (
        <View style={{ alignSelf: "flex-start" }}>
          <Button kind="quiet" icon="share" label={t("handoff.open")} onPress={() => setChoosing(true)} />
        </View>
      )}
      {copied ? <Text muted>{t("list.copied")}</Text> : null}
    </View>
  );
}
