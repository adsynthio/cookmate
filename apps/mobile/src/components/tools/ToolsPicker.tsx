// Pick the cooking tools at home: stove, pots, machines, as big tappable tiles. With an induction, one more
// question: how its power is shown, so the cook screen can say "level 5" or "1400 W" instead of "medium".
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { PressableScale } from "@/design-system/motion";
import { Chip, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { has, setPower, TOOL_GROUPS, toggleTool, type InductionPower, type Tool } from "@/domain/tools";
import { t, type StringKey } from "@/i18n";

const POWERS: { key: string; value: InductionPower }[] = [
  { key: "levels8", value: { style: "levels", max: 8 } },
  { key: "levels10", value: { style: "levels", max: 10 } },
  { key: "watts", value: { style: "watts" } },
];

export function ToolsPicker({ tools, onChange }: { tools: Tool[]; onChange: (tools: Tool[]) => void }) {
  const { colors } = useTheme();
  const power = tools.find((x) => x.type === "induction")?.details?.power;
  return (
    <View style={{ gap: space.lg }}>
      {TOOL_GROUPS.map((g) => (
        <View key={g.key} style={{ gap: space.sm }}>
          <Text variant="label" muted>
            {t(`tools.group.${g.key}` as StringKey)}
          </Text>
          <View style={styles.grid}>
            {g.tools.map(({ key, icon }) => {
              const on = has(tools, key);
              const label = t(`tools.${key}` as StringKey);
              return (
                <PressableScale
                  key={key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={label}
                  onPress={() => onChange(toggleTool(tools, key))}
                  style={[styles.tile, { backgroundColor: on ? colors.primaryPale : colors.surfaceMuted, borderColor: on ? colors.primary : "transparent" }]}
                >
                  <Icon name={icon} size={22} color={on ? colors.primaryText : colors.inkSecondary} />
                  <Text variant="caption" weight={600} numberOfLines={2} style={styles.center} color={on ? colors.primaryText : colors.ink}>
                    {label}
                  </Text>
                  {on ? (
                    <View style={styles.tick}>
                      <Icon name="checkCircle" size={16} color={colors.primaryText} />
                    </View>
                  ) : null}
                </PressableScale>
              );
            })}
          </View>
        </View>
      ))}
      {power ? (
        <View style={{ gap: space.sm }}>
          <Text variant="label" muted>
            {t("tools.powerQ")}
          </Text>
          <View style={styles.row}>
            {POWERS.map((p) => (
              <Chip
                key={p.key}
                solid
                label={t(`tools.power.${p.key}` as StringKey)}
                selected={JSON.stringify(power) === JSON.stringify(p.value)}
                onPress={() => onChange(setPower(tools, p.value))}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: { width: "31%", minHeight: 84, borderRadius: radius.item, borderWidth: 1.5, padding: space.sm, alignItems: "center", justifyContent: "center", gap: 6 },
  tick: { position: "absolute", top: 6, right: 6 },
  center: { textAlign: "center" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
