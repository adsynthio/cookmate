// Floating tab bar from the Stitch design: a frosted white capsule above the bottom edge. The active tab sits in an
// olive pill that glides from tab to tab. The mic lives in AppHeader, in the same place on every tab (VOICE-01).
import type { BottomTabBarProps } from "expo-router/js-tabs";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/design-system/icons";
import { Animated, useReducedMotion } from "@/design-system/motion";
import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { motion, radius, shadow, space } from "@/design-system/tokens";
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { useDrinks } from "@/state/drinks";

const ICONS: Record<string, IconName> = { index: "home", kitchen: "kitchen", list: "list", cook: "cook", drinks: "drop", community: "users", you: "you" };
/** Tabs that are screens of their own but not in the bar (the shopping list opens from Kitchen and Home). */
const HIDDEN = new Set(["list"]);

export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  // Drinks is off until the cook turns it on (setup or You).
  const drinksOn = useDrinks((st) => st.enabled);
  const visible = state.routes.filter((r) => !HIDDEN.has(r.name) && (r.name !== "drinks" || drinksOn));
  const count = visible.length;
  const active = visible.findIndex((r) => r.key === state.routes[state.index]?.key);
  const tabW = width / Math.max(count, 1);
  const x = useSharedValue(0);

  useEffect(() => {
    if (!tabW) return;
    if (active < 0) return;
    const to = active * tabW;
    x.value = reduce ? withTiming(to, { duration: 0 }) : withSpring(to, motion.spring);
  }, [active, tabW, reduce, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <View
        accessibilityRole="tablist"
        style={[
          styles.bar,
          shadow.float,
          {
            backgroundColor: scheme === "dark" ? "rgba(31,30,25,0.94)" : "rgba(255,255,255,0.94)",
            borderColor: scheme === "dark" ? colors.line : "rgba(232,201,170,0.45)",
          },
        ]}
      >
        <View style={styles.row} onLayout={onLayout}>
          {tabW && active >= 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.pill, { width: tabW - 6, backgroundColor: colors.primary }, pill]}
            />
          ) : null}
          {visible.map((route) => {
            const focused = state.routes[state.index]?.key === route.key;
            const title = descriptors[route.key]?.options.title;
            const label = typeof title === "string" ? title : route.name;
            const onPress = () => {
              const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => undefined);
                navigateToTab(route.key);
              }
            };
            const fg = focused ? colors.onPrimary : colors.inkSecondary;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                onPress={onPress}
                style={styles.tab}
              >
                <Icon name={ICONS[route.name] ?? "home"} size={22} color={fg} />
                <Text variant="overline" color={fg} numberOfLines={1} style={[styles.label, count > 5 && styles.labelTight]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingHorizontal: space.lg },
  bar: { width: "100%", maxWidth: 420, borderRadius: radius.pill, borderWidth: 1, padding: 4 },
  row: { flexDirection: "row" },
  pill: { position: "absolute", left: 3, top: 0, bottom: 0, borderRadius: radius.pill },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, minHeight: 56, paddingVertical: 6 },
  label: { letterSpacing: 0, textTransform: "none", maxWidth: "100%" },
  // Six tabs (Drinks on): a touch smaller so every name fits.
  labelTight: { fontSize: 9, letterSpacing: -0.1 },
});
