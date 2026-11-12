// KIT-170: one gentle tip to make this dish a full meal (dal or curd beside a sabzi, a sabzi or salad beside a dal),
// or nothing when it already is one. Hiding it is remembered on this phone for this dish.
import "expo-sqlite/localStorage/install";

import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Enter, PressableScale } from "@/design-system/motion";
import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { balanceTip } from "@/domain/plate";
import { t } from "@/i18n";

const KEY = "cookmate.balance.hidden";

function hidden(): string[] {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function BalanceTip({ slug, groups, course, diet }: { slug: string; groups?: readonly string[] | null; course?: string; diet?: string }) {
  const { colors } = useTheme();
  const [gone, setGone] = useState(() => hidden().includes(slug));
  const tip = balanceTip(groups, { course, diet });
  if (!tip || gone) return null;
  const hide = () => {
    setGone(true);
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify([...hidden(), slug].slice(-100)));
    } catch {}
  };
  return (
    <Enter>
      <View style={[styles.box, { backgroundColor: colors.primaryPale }]} accessibilityRole="summary">
        <View style={[styles.well, { backgroundColor: colors.surface }]}>
          <Icon name="leaf" size={18} color={colors.primaryText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" weight={600} color={colors.primaryText}>
            {t("balance.title")}
          </Text>
          <Text color={colors.primaryText}>{t(`balance.${tip}`)}</Text>
        </View>
        <PressableScale onPress={hide} accessibilityRole="button" accessibilityLabel={t("balance.hide")} hitSlop={12} style={styles.close}>
          <Icon name="close" size={16} color={colors.primaryText} />
        </PressableScale>
      </View>
    </Enter>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "flex-start", gap: space.md, borderRadius: radius.card, padding: space.md },
  well: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  close: { padding: 4 },
});
