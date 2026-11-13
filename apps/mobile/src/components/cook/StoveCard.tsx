// The setting for this step on the stove in use: "Induction · Level 5 of 8 (about 1200 W)". With both gas and
// induction at home, two small chips switch between them (remembered on this phone). S1: "Too hot" / "Too slow"
// teach the app this household's stove; two taps the same way move its settings one level, said once with Undo.
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Button, Chip, Text } from "@/design-system/primitives";
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
  onVote,
  heard,
  onUndo,
}: {
  stove: Stove;
  line: string;
  note: string | null;
  both: boolean;
  onStove: (s: Stove) => void;
  onVote?: (vote: "hot" | "slow") => void;
  /** What the last tap did: noted once, or moved the settings (then Undo is offered). */
  heard?: { text: string; undo: boolean } | null;
  onUndo?: () => void;
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
      {onVote ? (
        heard ? (
          <View style={[styles.row, { flexWrap: "wrap" }]} accessibilityLiveRegion="polite">
            <Text variant="caption" color={colors.inkSecondary} style={{ flex: 1 }}>
              {heard.text}
            </Text>
            {heard.undo && onUndo ? <Button kind="quiet" size="small" label={t("cook.heat.undo")} onPress={onUndo} /> : null}
          </View>
        ) : (
          <View style={styles.row}>
            <Button kind="secondary" size="small" icon="flame" label={t("cook.heat.hot")} onPress={() => onVote("hot")} />
            <Button kind="secondary" size="small" icon="timer" label={t("cook.heat.slow")} onPress={() => onVote("slow")} />
          </View>
        )
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
