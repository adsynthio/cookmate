// Onboarding progress from the brand kit: short pills, the current one lime.
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/design-system/theme";
import { radius } from "@/design-system/tokens";

export function Dashes({ count, current }: { count: number; current: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: count, now: current + 1 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dash, { backgroundColor: i === current ? colors.primary : colors.line }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6 },
  dash: { width: 22, height: 6, borderRadius: radius.pill },
});
