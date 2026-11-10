import { Tabs } from "expo-router";

import { useTheme } from "@/design-system/theme";
import { t } from "@/i18n";

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border, minHeight: 64 },
        tabBarLabelStyle: { fontSize: 13, fontWeight: "500" },
        tabBarIcon: () => null,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("tab.home") }} />
      <Tabs.Screen name="kitchen" options={{ title: t("tab.kitchen") }} />
      <Tabs.Screen name="cook" options={{ title: t("tab.cook") }} />
      <Tabs.Screen name="you" options={{ title: t("tab.you") }} />
    </Tabs>
  );
}
