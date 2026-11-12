// The brand kit's slide-to-start pill: lime knob with chevrons on the left, centred label, a quiet check circle on
// the right. It is a plain tap target (a slide gesture would shut out switch and screen-reader users).
import { Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, size, space } from "@/design-system/tokens";

export function StartPill({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  const { colors } = useTheme();
  const knob = size.cta - space.sm * 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        shadow.float,
        { backgroundColor: colors.surface, opacity: busy ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.knob, { width: knob, height: knob, borderRadius: knob / 2, backgroundColor: colors.primary }]}>
        <View style={styles.chevrons}>
          <Icon name="forward" size={18} color={colors.onPrimary} />
          <View style={{ marginLeft: -10 }}>
            <Icon name="forward" size={18} color={colors.onPrimary} />
          </View>
        </View>
      </View>
      <Text variant="bodyStrong" style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.check, { width: knob, height: knob, borderRadius: knob / 2, borderColor: colors.line }]}>
        <Icon name="check" size={20} muted />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: size.cta,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
  },
  knob: { alignItems: "center", justifyContent: "center" },
  chevrons: { flexDirection: "row", alignItems: "center" },
  label: { flex: 1, textAlign: "center" },
  check: { borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
