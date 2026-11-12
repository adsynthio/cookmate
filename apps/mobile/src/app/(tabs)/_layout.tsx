import { Tabs } from "expo-router";

import { TabBar } from "@/components/TabBar";
import { useReducedMotion } from "@/design-system/motion";
import { useTheme } from "@/design-system/theme";
import { t, useLocale } from "@/i18n";

export default function TabsLayout() {
  useLocale();
  // Tabs slide and fade into place (the "shift" transition); off when the phone asks for less motion.
  const reduce = useReducedMotion();
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: reduce ? "none" : "shift", sceneStyle: { backgroundColor: colors.canvas } }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: t("tab.home") }} />
      <Tabs.Screen name="kitchen" options={{ title: t("tab.kitchen") }} />
      <Tabs.Screen name="list" options={{ title: t("tab.list") }} />
      <Tabs.Screen name="cook" options={{ title: t("tab.cook") }} />
      <Tabs.Screen name="you" options={{ title: t("tab.you") }} />
    </Tabs>
  );
}
