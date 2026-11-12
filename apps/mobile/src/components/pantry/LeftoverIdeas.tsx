// KIT-180: on a leftover, quick ways to turn it into a new meal, with the reheating rule (and the rice rule for rice).
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Enter } from "@/design-system/motion";
import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { ideasFor, needsRiceCare } from "@/domain/leftovers";
import { t, type StringKey } from "@/i18n";

export function LeftoverIdeas({ item }: { item: { name: string; state: string } }) {
  const { colors } = useTheme();
  const found = ideasFor(item);
  if (!found) return null;
  return (
    <Enter>
      <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]}>
        <View style={{ gap: 2 }}>
          <Text variant="subheading">{t("left.title")}</Text>
          <Text variant="label" muted>
            {t("left.body")}
          </Text>
        </View>
        {found.ideas.map((idea, i) => (
          <Enter key={idea} index={i + 1}>
            <View style={[styles.idea, { backgroundColor: colors.surfaceMuted }]}>
              <View style={[styles.num, { backgroundColor: colors.primary }]}>
                <Text variant="label" weight={600} color={colors.onPrimary}>
                  {i + 1}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{t(`left.idea.${idea}.t` as StringKey)}</Text>
                <Text variant="label" muted>
                  {t(`left.idea.${idea}.b` as StringKey)}
                </Text>
              </View>
            </View>
          </Enter>
        ))}
        {needsRiceCare(found.kind) ? (
          <View style={styles.note}>
            <Icon name="warning" size={16} color={colors.alert} />
            <Text variant="label" color={colors.alert} style={{ flex: 1 }}>
              {t("left.riceCare")}
            </Text>
          </View>
        ) : null}
        <View style={styles.note}>
          <Icon name="flame" size={16} color={colors.accentText} />
          <Text variant="label" color={colors.accentText} style={{ flex: 1 }}>
            {t("left.reheat")}
          </Text>
        </View>
      </View>
    </Enter>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.cardLg, padding: space.lg, gap: space.md },
  idea: { flexDirection: "row", alignItems: "flex-start", gap: space.md, borderRadius: radius.item, padding: space.md },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  note: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
});
