// KIT-078: count pressure-cooker whistles with one big tap each. The count is shown and spoken; the parent moves to
// the next step when the target is reached.
import { Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Button, Card, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { shadow, space } from "@/design-system/tokens";
import { t } from "@/i18n";

export function WhistleCounter({
  count,
  target,
  onWhistle,
  onUndo,
}: {
  count: number;
  target: number;
  onWhistle: () => void;
  onUndo: () => void;
}) {
  const { colors } = useTheme();
  const done = count >= target;
  return (
    <Card hero style={styles.card}>
      <View style={{ flex: 1, gap: space.xs }}>
        <Text variant="bodyStrong">{t("cook.whistle.title")}</Text>
        <Text variant="metric" accessibilityLiveRegion="polite">
          {t("cook.whistle.count", { n: count, target })}
        </Text>
        {done ? (
          <Text>{t("cook.whistle.done", { n: target })}</Text>
        ) : (
          <Text muted>{t("cook.whistle.tap")}</Text>
        )}
        {count > 0 && !done ? (
          <View style={{ alignSelf: "flex-start" }}>
            <Button kind="quiet" label={t("cook.whistle.undo")} onPress={onUndo} />
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("cook.whistle.tap")}
        accessibilityState={{ disabled: done }}
        disabled={done}
        onPress={onWhistle}
        style={({ pressed }) => [styles.tap, shadow.glow, { backgroundColor: pressed ? colors.limePressed : colors.lime, opacity: done ? 0.5 : 1 }]}
      >
        <Icon name={done ? "check" : "plus"} size={36} color={colors.onLime} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: space.lg },
  tap: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center" },
});
