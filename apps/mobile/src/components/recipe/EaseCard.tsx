// M2, "the cook's mind": a dish as the few parts you already know. Shows "Looks fancy, is easy: 4 parts, you've done
// 3 of them", each part with a short how-to card on tap, and the dish you last did it in.
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Card, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { ease } from "@/domain/blueprint";
import type { RecipeDoc } from "@/domain/recipes";
import { t, type StringKey } from "@/i18n";
import { useTechniques } from "@/state/techniques";

export function EaseCard({ doc }: { doc: RecipeDoc }) {
  const { colors } = useTheme();
  const done = useTechniques((s) => s.done);
  const [open, setOpen] = useState<string | null>(null);
  const e = ease(doc, done);
  // One part is just a recipe; the card helps when a dish has a few.
  if (e.parts.length < 2) return null;
  const known = new Map(e.known.map((k) => [k.technique, k.dish]));

  return (
    <Card style={{ gap: space.sm }}>
      <Text variant="subheading">
        {e.feel === "easy" ? t("ease.title.easy", { n: e.parts.length }) : t("ease.title.stretch", { n: e.parts.length })}
      </Text>
      {e.known.length ? (
        <Text muted>{t("ease.known", { k: e.known.length, n: e.parts.length })}</Text>
      ) : (
        <Text muted>{t("ease.none")}</Text>
      )}
      <View style={{ gap: space.xs }}>
        {e.parts.map((p, i) => {
          const dish = known.get(p.technique);
          const isOpen = open === p.technique;
          return (
            <Pressable
              key={p.technique}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              onPress={() => setOpen(isOpen ? null : p.technique)}
              style={{ padding: space.sm, borderRadius: radius.item, backgroundColor: colors.surfaceMuted, gap: space.xs }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text weight={600}>{i + 1}.</Text>
                <Text weight={600} style={{ flex: 1 }}>
                  {t(`technique.${p.technique}` as StringKey)}
                </Text>
                {dish ? <Icon name="checkCircle" size={18} color={colors.primary} /> : null}
              </View>
              {dish ? <Text variant="caption" muted>{t("ease.didIn", { dish })}</Text> : null}
              {isOpen ? <Text>{t(`technique.${p.technique}.how` as StringKey)}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
