// Sprint 13 S6: "Make it different with what you have" on recipe detail. Restaurant-style twists (shahi, kofta, tikka,
// dum) the dish can take from what's in the kitchen, and cheaper swaps for costly things it uses. Only shown when
// there is something to offer; nothing here changes the recipe until the cook chooses to.
import { swapSaving } from "@/domain/cost";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Card, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import type { RecipeDoc } from "@/domain/recipes";
import { cheaperSwaps, twistsFor } from "@/domain/swaps";
import { t } from "@/i18n";

type Props = {
  doc: RecipeDoc;
  has: (key: string) => boolean;
  avoid: string[];
  nameOf: (key: string) => string;
};

export function MakeItDifferent({ doc, has, avoid, nameOf }: Props) {
  const { colors } = useTheme();
  const keys = doc.ingredients.filter((i) => !i.optional).map((i) => i.ingredient);
  const twists = twistsFor({ course: doc.course, diet: doc.diet, tags: doc.tags ?? [], ingredients: keys }, has, avoid);
  const cheaper = cheaperSwaps(keys.filter(has), has, avoid);
  if (!twists.length && !cheaper.length) return null;
  const list = (ks: string[]) => ks.map(nameOf).join(", ");

  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.row}>
        <Icon name="sparkle" size={18} color={colors.accentText} />
        <Text variant="subheading" style={{ flex: 1 }}>
          {t("swaps.title")}
        </Text>
      </View>
      {twists.map((o) => (
        <View key={o.twist} style={[styles.twist, { backgroundColor: colors.surfaceMuted }]}>
          <Text variant="bodyStrong">{t(`swaps.twist.${o.twist}`)}</Text>
          <Text>{t(`swaps.twistHow.${o.twist}`)}</Text>
          <Text variant="label" muted>
            {t("swaps.uses", { items: list(o.uses) })}
          </Text>
        </View>
      ))}
      {cheaper.length ? (
        <View style={{ gap: space.xs }}>
          <Text variant="label" muted>
            {t("swaps.save")}
          </Text>
          {cheaper.map((x) => (
            <Text key={x.id}>
              {t("swaps.saveLine", { to: nameOf(x.to), from: nameOf(x.from), taste: t(`swaps.taste.${x.taste}`) })}
              {/* F6: what the swap saves, at the recipe's own servings. */}
              {swapSaving(doc, doc.base_servings, x) > 0 ? ` ${t("cost.saves", { n: swapSaving(doc, doc.base_servings, x) })}` : ""}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  twist: { borderRadius: radius.item, padding: space.md, gap: space.xs },
});
