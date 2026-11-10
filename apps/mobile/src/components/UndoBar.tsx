import { StyleSheet, View } from "react-native";

import { Button, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { t } from "@/i18n";
import { useUndo } from "@/state/undo";

/** Snackbar with an Undo action; sits above the tab bar while an undo is on offer. */
export function UndoBar({ onUndone }: { onUndone?: () => void }) {
  const { colors } = useTheme();
  const pending = useUndo((s) => s.pending);
  const clear = useUndo((s) => s.clear);
  if (!pending) return null;
  return (
    <View style={[styles.bar, { backgroundColor: colors.text }]} accessibilityLiveRegion="polite">
      <Text color={colors.bg} style={{ flex: 1 }}>
        {pending.message}
      </Text>
      <Button
        kind="quiet"
        textColor={colors.highlight}
        label={t("item.undo")}
        onPress={async () => {
          clear(pending.id);
          await pending.undo();
          onUndone?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
    borderRadius: radius.chip,
    paddingLeft: space.lg,
    flexDirection: "row",
    alignItems: "center",
  },
});
