import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { t } from "@/i18n";
import { useUndo } from "@/state/undo";

/** Snackbar with an Undo action; sits above the tab bar while an undo is on offer. */
export function UndoBar({ onUndone }: { onUndone?: () => void }) {
  const { colors } = useTheme();
  const pending = useUndo((s) => s.pending);
  // U45: above the floating tab bar (its 66 px plus the same bottom margin the bar keeps), not behind it.
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, space.md) + 66 + space.sm;
  const clear = useUndo((s) => s.clear);
  if (!pending) return null;
  return (
    <View style={[styles.bar, { backgroundColor: colors.ink, bottom }]} accessibilityLiveRegion="polite">
      <Text color={colors.canvas} style={{ flex: 1, paddingVertical: space.md }}>
        {pending.message}
      </Text>
      {pending.undo ? (
        <Button
          kind="quiet"
          textColor={colors.primary}
          label={t("item.undo")}
          onPress={async () => {
            clear(pending.id);
            await pending.undo?.();
            onUndone?.();
          }}
        />
      ) : (
        <View style={{ width: space.lg }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    borderRadius: radius.tag,
    paddingLeft: space.lg,
    flexDirection: "row",
    alignItems: "center",
  },
});
