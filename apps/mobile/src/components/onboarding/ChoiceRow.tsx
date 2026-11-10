// A large, full-width choice (language, spice, diet): a flat white card that turns soft lime with a lime check
// disc when chosen (colour plus the check, never colour alone), announced to screen readers as a radio button.
import { Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
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
          backgroundColor: selected ? colors.limeSoft : colors.surface,
          borderColor: selected ? colors.lime : "transparent",
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text variant={large ? "title" : "heading"}>{label}</Text>
        {detail ? <Text muted>{detail}</Text> : null}
      </View>
      <View
        style={[styles.dot, { borderColor: selected ? colors.lime : colors.line, backgroundColor: selected ? colors.lime : "transparent" }]}
      >
        {selected ? <Icon name="check" size={18} color={colors.onLime} /> : null}
      </View>
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
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
