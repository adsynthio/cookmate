import { Tabs } from "expo-router";

import { TabBar } from "@/components/TabBar";
import { t, useLocale } from "@/i18n";

export default function TabsLayout() {
  useLocale();
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: t("tab.home") }} />
      <Tabs.Screen name="kitchen" options={{ title: t("tab.kitchen") }} />
      <Tabs.Screen name="cook" options={{ title: t("tab.cook") }} />
      <Tabs.Screen name="you" options={{ title: t("tab.you") }} />
    </Tabs>
  );
}
