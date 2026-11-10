// A large, full-width choice (language, spice, diet). Selected state is shown by colour, border and a check,
// and announced to screen readers as a radio button.
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space, touch } from "@/design-system/tokens";

export function ChoiceRow({
  label,
  detail,
  selected,
  onPress,
  large,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  large?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: large ? 72 : touch.cook,
          backgroundColor: selected ? colors.tintTomato : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text variant={large ? "title" : "heading"}>{label}</Text>
        {detail ? <Text muted>{detail}</Text> : null}
      </View>
      <View
        style={[styles.dot, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : "transparent" }]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 2,
    borderRadius: radius.card,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2 },
});
