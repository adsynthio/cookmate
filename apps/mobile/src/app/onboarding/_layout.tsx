import { Stack } from "expo-router";

import { useTheme } from "@/design-system/theme";

export default function OnboardingLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />;
}
