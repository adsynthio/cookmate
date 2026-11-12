// Home's hero, full width and under the status bar: which meal and how full the kitchen is, the search bar with the
// mic on top, then a big greeting with food gently floating around it and a button down to tonight's picks.
// Floating stops when the phone asks for less motion.
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Image, type ImageSourcePropType, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import { Icon } from "@/design-system/icons";
import { ingredientImage } from "@/design-system/media";
import { Animated, Enter, PressableScale, useReducedMotion } from "@/design-system/motion";
import { Text, textStyle } from "@/design-system/primitives";
import { radius, space } from "@/design-system/tokens";
import { t } from "@/i18n";
import { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, Easing } from "react-native-reanimated";

const TOP = "#56652B";
const BOTTOM = "#33401A";
const ON = "#FFFFFF";
const ON_SOFT = "rgba(255,255,255,0.82)";
const GLASS = "rgba(255,255,255,0.16)";

function partOfDay(h = new Date().getHours()): "morning" | "afternoon" | "evening" {
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

/** One piece of food bobbing and tilting on its own slow loop. */
function Floater({ source, size, style, delay, tilt }: { source: ImageSourcePropType | null; size: number; style: object; delay: number; tilt: number }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  const r = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    const ease = Easing.inOut(Easing.sin);
    y.value = withDelay(delay, withRepeat(withSequence(withTiming(-10, { duration: 1800, easing: ease }), withTiming(0, { duration: 1800, easing: ease })), -1));
    r.value = withDelay(delay, withRepeat(withSequence(withTiming(tilt, { duration: 2400, easing: ease }), withTiming(-tilt, { duration: 2400, easing: ease })), -1, true));
  }, [reduce, delay, tilt, y, r]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { rotate: `${r.value}deg` }] }));
  if (!source) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.floater, { width: size, height: size, borderRadius: size / 2 }, style, anim]}>
      <Image source={source} style={{ width: "100%", height: "100%" }} resizeMode="cover" accessible={false} />
    </Animated.View>
  );
}

/** Soft rings that breathe behind the greeting. Drawn in their own layer the size of the hero, so they never spill
 * out of it; they pulse in brightness rather than size. */
function Rings() {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.value = withRepeat(withSequence(withTiming(0.45, { duration: 2600 }), withTiming(1, { duration: 2600 })), -1);
  }, [reduce, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }, anim]}>
      <Svg width="100%" height="100%" style={{ overflow: "hidden" }}>
        <Circle cx="50%" cy="66%" r="185" stroke="rgba(255,255,255,0.10)" strokeWidth="26" fill="none" />
        <Circle cx="50%" cy="66%" r="125" stroke="rgba(255,255,255,0.08)" strokeWidth="18" fill="none" />
      </Svg>
    </Animated.View>
  );
}

export function HomeHero({
  name,
  slotLabel,
  slotOpen,
  onSlot,
  count,
  dish,
  draft,
  onDraft,
  onSearch,
  onPicks,
}: {
  name?: string;
  slotLabel: string;
  slotOpen: boolean;
  onSlot: () => void;
  count: number;
  /** Tonight's top dish photo, floating with the vegetables. */
  dish: ImageSourcePropType | null;
  draft: string;
  onDraft: (v: string) => void;
  onSearch: () => void;
  onPicks: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hello = t(`home.hello.${partOfDay()}`);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + space.sm }]}>
      <StatusBar style="light" />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={TOP} />
            <Stop offset="1" stopColor={BOTTOM} />
          </LinearGradient>
          <RadialGradient id="glow" cx="75" cy="58" r="55" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#F2B38A" stopOpacity="0.32" />
            <Stop offset="1" stopColor="#F2B38A" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#bg)" />
        <Rect x="0" y="0" width="100" height="100" fill="url(#glow)" />
      </Svg>
      </View>
      <Rings />

      {/* Which meal (tap to change) and the kitchen at a glance; recipe search and You on the right. */}
      <View style={styles.topRow}>
        <PressableScale accessibilityRole="button" accessibilityLabel={`${t("home.slotPicker")}: ${slotLabel}`} onPress={onSlot} style={{ flex: 1, gap: 2 }}>
          <View style={styles.slot}>
            <Icon name="skillet" size={18} color={ON} />
            <Text variant="subheading" color={ON}>
              {slotLabel}
            </Text>
            <View style={{ transform: [{ rotate: slotOpen ? "-90deg" : "90deg" }] }}>
              <Icon name="forward" size={14} color={ON} />
            </View>
          </View>
          <Text variant="caption" color={ON_SOFT} numberOfLines={1}>
            {count ? t("home.hero.kitchen", { n: count }) : t("home.kitchenEmpty")}
          </Text>
        </PressableScale>
        <PressableScale accessibilityRole="button" accessibilityLabel={t("ask.title")} onPress={() => router.push("/ask")} style={[styles.round, { backgroundColor: GLASS }]}>
          <Icon name="sparkle" size={20} color={ON} />
        </PressableScale>
        <PressableScale accessibilityRole="button" accessibilityLabel={t("home.search")} onPress={() => router.push("/search")} style={[styles.round, { backgroundColor: GLASS }]}>
          <Icon name="list" size={20} color={ON} />
        </PressableScale>
        <PressableScale accessibilityRole="button" accessibilityLabel={t("tab.you")} onPress={() => router.navigate("/you")} style={[styles.round, styles.avatar]}>
          <Text variant="subheading" color="#7A3A12">
            {(name ?? "").trim().slice(0, 1).toUpperCase() || "☺"}
          </Text>
        </PressableScale>
      </View>

      {/* Search on top of the hero, with the mic beside it. */}
      <View style={styles.searchRow}>
        <View style={[styles.search, { backgroundColor: GLASS }]}>
          <Icon name="search" size={20} color={ON} />
          <TextInput
            value={draft}
            onChangeText={onDraft}
            onSubmitEditing={onSearch}
            returnKeyType="search"
            placeholder={t("home.moodPlaceholder")}
            placeholderTextColor={ON_SOFT}
            accessibilityLabel={t("home.cravingPrompt")}
            style={[textStyle("body"), styles.input, { color: ON }]}
          />
        </View>
        <PressableScale accessibilityRole="button" accessibilityLabel={t("home.voice")} onPress={() => router.push("/voice")} style={[styles.mic, { backgroundColor: GLASS }]}>
          <Icon name="mic" size={22} color={ON} />
        </PressableScale>
      </View>

      {/* The greeting, with food floating around it. */}
      <View style={styles.banner}>
        <Floater source={ingredientImage("tomato")} size={54} style={{ left: 4, top: 10 }} delay={0} tilt={8} />
        <Floater source={ingredientImage("onion")} size={50} style={{ right: 10, top: 0 }} delay={400} tilt={-10} />
        <Floater source={ingredientImage("garlic")} size={42} style={{ left: 22, bottom: 36 }} delay={800} tilt={12} />
        <Floater source={ingredientImage("capsicum")} size={46} style={{ right: 34, bottom: 70 }} delay={1200} tilt={-8} />
        <Floater source={ingredientImage("carrot")} size={40} style={{ left: "44%", top: -6 }} delay={600} tilt={10} />
        {dish ? (
          <Floater source={dish} size={92} style={{ right: -14, bottom: -4 }} delay={200} tilt={4} />
        ) : null}

        <Enter style={styles.copy}>
          <Text variant="label" weight={600} color={ON_SOFT} style={styles.center}>
            {name ? `${hello}, ${name}` : hello}
          </Text>
          <Text variant="display" weight={600} color={ON} accessibilityRole="header" style={[styles.center, styles.headline]}>
            {t("home.hero.title", { slot: slotLabel.toLowerCase() })}
          </Text>
          <PressableScale accessibilityRole="button" accessibilityLabel={t("home.hero.cta")} onPress={onPicks} style={styles.cta}>
            <Text variant="label" weight={600} color={ON}>
              {t("home.hero.cta")}
            </Text>
            <Icon name="forward" size={14} color={ON} />
          </PressableScale>
        </Enter>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.gutter, paddingBottom: space.xl, gap: space.lg, overflow: "hidden" },
  topRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  slot: { flexDirection: "row", alignItems: "center", gap: 6 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatar: { backgroundColor: "#FBD9BE", borderWidth: 2, borderColor: "rgba(255,255,255,0.7)" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.pill, paddingHorizontal: space.lg, height: 52, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  input: { flex: 1, paddingVertical: 0 },
  mic: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  banner: { height: 250, justifyContent: "center", alignItems: "center" },
  floater: { position: "absolute", overflow: "hidden", borderWidth: 3, borderColor: "rgba(255,255,255,0.85)", backgroundColor: "#FFFFFF" },
  copy: { alignItems: "center", gap: space.sm, paddingHorizontal: space.xxl },
  center: { textAlign: "center" },
  headline: { textShadowColor: "rgba(0,0,0,0.25)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  cta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.xs, backgroundColor: "#1F1E19", borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 10, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.85)" },
});
