// The setting for this step on the stove in use: "Induction · Level 5 of 8 (about 1200 W)". With both gas and
// induction at home, two small chips switch between them (remembered on this phone).
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Chip, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import type { Stove } from "@/domain/stoveGuide";
import { t } from "@/i18n";

export function StoveCard({
  stove,
  line,
  note,
  both,
  onStove,
}: {
  stove: Stove;
  line: string;
  note: string | null;
  both: boolean;
  onStove: (s: Stove) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.accentSoft }]} accessibilityLabel={`${t(`cook.stove.${stove}`)}: ${line}. ${note ?? ""}`}>
      <View style={styles.row}>
        <Icon name={stove === "gas" ? "flame" : "bulb"} size={20} color={colors.accentText} />
        <View style={{ flex: 1 }}>
          <Text variant="overline" color={colors.accentText}>
            {t(`cook.stove.${stove}`).toUpperCase()}
          </Text>
          <Text variant="bodyStrong">{line}</Text>
        </View>
      </View>
      {note ? (
        <Text variant="caption" color={colors.inkSecondary}>
          {note}
        </Text>
      ) : null}
      {both ? (
        <View style={styles.row}>
          {(["gas", "induction"] as const).map((s) => (
            <Chip key={s} label={t(`cook.stove.${s}`)} selected={stove === s} onPress={() => onStove(s)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: space.md, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
