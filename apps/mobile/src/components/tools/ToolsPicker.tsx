// Pick the cooking tools at home: stove, pots, machines, as big tappable tiles. With an induction, one more
// question: how its power is shown, so the cook screen can say "level 5" or "1400 W" instead of "medium". With gas,
// how many burners; with two or more power-hungry machines, which ones can't run together (one socket, or the
// switch trips), so the cook screen never asks for both at once.
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { PressableScale } from "@/design-system/motion";
import { Chip, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { burners, electricPairs, clash, setBurners, setClash } from "@/domain/kitchenLimits";
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
  const pairs = electricPairs(tools);
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
      {has(tools, "gas_stove") ? (
        <View style={{ gap: space.sm }}>
          <Text variant="label" muted>
            {t("tools.burnersQ")}
          </Text>
          <View style={styles.row}>
            {[1, 2, 3, 4].map((n) => (
              <Chip key={n} solid label={String(n)} selected={burners(tools) === n} onPress={() => onChange(setBurners(tools, n))} />
            ))}
          </View>
        </View>
      ) : null}
      {pairs.length ? (
        <View style={{ gap: space.sm }}>
          <Text variant="label" muted>
            {t("tools.togetherQ")}
          </Text>
          <Text variant="caption" muted>
            {t("tools.togetherHint")}
          </Text>
          {pairs.map(([a, b]) => {
            const one = clash(tools, a, b);
            return (
              <View key={`${a}-${b}`} style={[styles.pair, { backgroundColor: colors.surfaceMuted }]}>
                <Text variant="bodyStrong" style={{ flexBasis: "100%" }}>
                  {t("tools.pair", { a: t(`tools.${a}` as StringKey), b: t(`tools.${b}` as StringKey) })}
                </Text>
                <Chip solid label={t("tools.together")} selected={!one} onPress={() => onChange(setClash(tools, a, b, false))} />
                <Chip solid icon="warning" label={t("tools.oneAtATime")} selected={one} onPress={() => onChange(setClash(tools, a, b, true))} />
              </View>
            );
          })}
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
  pair: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, borderRadius: radius.item, padding: space.md },
});
