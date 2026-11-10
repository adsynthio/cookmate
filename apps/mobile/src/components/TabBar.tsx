// Bottom bar from the brand kit: four outline tabs on surface-muted around a raised lime mic (VOICE-01:
// one mic, same place on every tab). The mic is wired to the LiveKit voice session in Sprint 4.
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/design-system/icons";
import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { shadow, size, space, touch } from "@/design-system/tokens";
import { t } from "@/i18n";
import { useSession } from "@/state/session";

const ICONS: Record<string, IconName> = { index: "home", kitchen: "kitchen", cook: "cook", you: "you" };

export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabs = state.routes.map((route, index) => {
    const focused = state.index === index;
    const title = descriptors[route.key]?.options.title;
    const label = typeof title === "string" ? title : route.name;
    const onPress = () => {
      const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigateToTab(route.key);
    };
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.tab}
      >
        <Icon name={ICONS[route.name] ?? "home"} muted={!focused} />
        <Text variant="caption" weight={focused ? 500 : 400} muted={!focused} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  });
  const middle = Math.ceil(tabs.length / 2);

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { backgroundColor: colors.surfaceMuted, paddingBottom: Math.max(insets.bottom, space.sm) }]}
    >
      {tabs.slice(0, middle)}
      <View style={styles.tab}>
        <MicFab />
      </View>
      {tabs.slice(middle)}
    </View>
  );
}

function MicFab() {
  const { colors } = useTheme();
  const voice = useSession((s) => s.voice);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("mic.label")}
      accessibilityState={{ busy: voice === "connecting" || voice === "thinking" }}
      onPress={() => {}}
      style={({ pressed }) => [
        styles.fab,
        shadow.glow,
        { backgroundColor: pressed ? colors.limePressed : colors.lime, borderColor: colors.canvas },
      ]}
    >
      <Icon name="mic" size={26} color={colors.onLime} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "flex-start", paddingTop: space.sm, paddingHorizontal: space.sm },
  tab: { flex: 1, alignItems: "center", gap: 2, minHeight: touch.min, justifyContent: "center" },
  fab: {
    width: size.fab,
    height: size.fab,
    borderRadius: size.fab / 2,
    marginTop: -size.fab / 2,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
