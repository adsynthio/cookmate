// "Your air fryer is still on (4 min left) and your induction can't run with it": shown on a step whose stove or
// machine is taken or can't run alongside what's already on, with the other stove offered for this step when it's free.
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Button, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import type { Check, Device } from "@/domain/kitchenLimits";
import { t, type StringKey } from "@/i18n";

const name = (d: Device) => t(`limits.device.${d}` as StringKey);

/** The words for a check, for the card and for reading aloud. */
export function checkWords(c: Check, need: Device, timeLeft: string): { line: string; next: string } {
  const line =
    c.kind === "busy"
      ? t(need === "gas" ? "limits.busyGas" : "limits.busy", { device: name(need), n: c.with.stepNo, time: timeLeft })
      : t("limits.clash", { other: name(c.with.device), device: name(need), time: timeLeft });
  const next = c.alt ? t("limits.useAlt", { alt: name(c.alt) }) : t("limits.wait", { other: name(c.with.device) });
  return { line, next };
}

export function KitchenCheckCard({ check, need, timeLeft, onAlt }: { check: Check; need: Device; timeLeft: string; onAlt: () => void }) {
  const { colors } = useTheme();
  const { line, next } = checkWords(check, need, timeLeft);
  return (
    <View style={[styles.card, { backgroundColor: colors.alertSoft }]} accessibilityRole="alert">
      <View style={styles.row}>
        <Icon name="warning" size={20} color={colors.alert} />
        <Text variant="bodyStrong" color={colors.alert} style={{ flex: 1 }}>
          {line}
        </Text>
      </View>
      {check.alt ? (
        <Button kind="primary" icon={check.alt === "gas" ? "flame" : "bulb"} label={next} onPress={onAlt} />
      ) : (
        <Text color={colors.inkSecondary}>{next}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: space.md, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
