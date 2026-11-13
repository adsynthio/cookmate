// "Do this in the air fryer": for a frying step, when the household has one. Off by default; turned on, it shows the
// temperature, time and how to do it, and a timer for the air-fryer time.
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Badge, Button, Chip, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import type { AirFry } from "@/domain/airFryer";
import { t } from "@/i18n";

export function AirFryerCard({ plan, on, onToggle, onTimer }: { plan: AirFry; on: boolean; onToggle: () => void; onTimer: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: on ? colors.primaryPale : colors.surfaceMuted }]}>
      <View style={styles.row}>
        <Icon name="drop" size={20} color={colors.primaryText} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {t("air.title")}
        </Text>
        <Chip label={on ? t("air.on") : t("air.use")} selected={on} onPress={onToggle} />
      </View>
      {on ? (
        <>
          <Text variant="caption" muted>
            {t("air.instead")}
          </Text>
          <Text variant="subheading" accessibilityLiveRegion="polite">
            {t("air.setting", { temp: plan.tempC, min: plan.minutes, pre: plan.preheat })}
          </Text>
          {plan.general ? <Badge label={t("air.general")} tone="accent" icon="bulb" /> : null}
          {plan.lines.map((l, i) => (
            <View key={i} style={styles.line}>
              <Text weight={600} color={colors.primaryText}>
                {i + 1}.
              </Text>
              <Text style={{ flex: 1 }}>{l}</Text>
            </View>
          ))}
          <Button kind="primary" icon="timer" label={t("air.timer", { min: plan.minutes })} onPress={onTimer} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: space.md, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  line: { flexDirection: "row", gap: space.sm },
});
