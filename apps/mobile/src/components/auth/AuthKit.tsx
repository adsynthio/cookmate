// Building blocks of the sign-up and log-in screens: big display words, chunky outlined buttons that press down onto
// their coloured shadow, a round back button, and the coloured top block with its scalloped edge and stickers.
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text as RNText, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Icon } from "@/design-system/icons";
import { textStyle } from "@/design-system/primitives";
import { APP_LOCALES, t, type AppLocale, type StringKey } from "@/i18n";

import { Bob, Hopping, PopIn, Squish } from "./AuthMotion";
import { Fruit } from "./Fruit";
import { type FruitKind } from "./fruitArt";
import { displayType, SCENE, useAuthLook } from "./look";

/** Big words in the display face. `latin` keeps it for Latin-only text (digits, the name) in every language. */
export function Display({
  size,
  color,
  latin,
  style,
  ...rest
}: TextProps & { size: number; color: string; latin?: boolean; style?: StyleProp<TextStyle> }) {
  const { display } = useAuthLook();
  return <RNText {...rest} style={[displayType(size, display, latin), { color }, style]} />;
}

const LIFT = 5;

/**
 * The main buttons: an outlined face sitting on a hard shadow in a fruit colour. Pressing pushes the face down onto
 * its shadow. `tone` "ink" is dark with light words (the main action); "light" is white with dark words.
 */
export function ChunkyButton({
  label,
  onPress,
  tone = "ink",
  shadow = SCENE.melon,
  disabled,
  busy,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  tone?: "ink" | "light";
  shadow?: string;
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}) {
  const { colors } = useAuthLook();
  const reduce = useReducedMotion();
  const press = useSharedValue(0);
  const face = useAnimatedStyle(() => ({ transform: [{ translateX: press.value * LIFT }, { translateY: press.value * LIFT }] }));
  const fill = tone === "ink" ? colors.ink : colors.surface;
  const fg = tone === "ink" ? colors.canvas : colors.ink;
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      onPressIn={() => {
        press.value = reduce ? 1 : withTiming(1, { duration: 70 });
      }}
      onPressOut={() => {
        press.value = reduce ? 0 : withSpring(0, { damping: 11, stiffness: 320 });
      }}
      style={[styles.chunky, { opacity: disabled ? 0.45 : 1 }]}
    >
      <View style={[styles.chunkyShadow, { backgroundColor: shadow, borderColor: colors.line }]} />
      <Animated.View style={[styles.chunkyFace, { backgroundColor: fill, borderColor: colors.line }, face]}>
        <Display size={19} color={fg} numberOfLines={2} style={styles.chunkyLabel}>
          {label}
        </Display>
        {busy ? <Hopping colors={[SCENE.mango, SCENE.melon, SCENE.lime]} /> : null}
      </Animated.View>
    </Pressable>
  );
}

/** Round outlined back button for the top of a coloured block. */
export function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useAuthLook();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.back")}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.back, { backgroundColor: colors.surface, borderColor: colors.line, transform: [{ translateY: pressed ? 2 : 0 }] }]}
    >
      <Icon name="back" size={22} color={colors.ink} />
    </Pressable>
  );
}

/** A tilted sticker label. */
export function Tag({ text, tilt = -3, bg = "#FFFFFF" }: { text: string; tilt?: number; bg?: string }) {
  const { colors } = useAuthLook();
  return (
    <View style={[styles.tag, { backgroundColor: bg, borderColor: colors.line, transform: [{ rotate: `${tilt}deg` }] }]}>
      <Display size={15} color="#2A1B12">
        {text}
      </Display>
    </View>
  );
}

/** English · हिन्दी · Hinglish · ಕನ್ನಡ on the coloured block: white pills, the chosen one filled in ink. */
export function LanguagePills({ value, onChange }: { value: AppLocale; onChange: (l: AppLocale) => void }) {
  const order: AppLocale[] = (["en", "hi", "hinglish", "kn"] as AppLocale[]).filter((l) => (APP_LOCALES as readonly string[]).includes(l));
  return (
    <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel={t("you.language")}>
      {order.map((l) => {
        const on = value === l;
        return (
          <Pressable
            key={l}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={t(`lang.${l}` as StringKey)}
            onPress={() => onChange(l)}
            style={[styles.pill, { backgroundColor: on ? "#2A1B12" : "#FFFFFF" }]}
          >
            <RNText style={[textStyle("caption", 600), { color: on ? "#FFFFFF" : "#2A1B12" }]}>{t(`lang.${l}` as StringKey)}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

export type Sticker = {
  kind: FruitKind;
  /** Centre, as a share of the block's width and height (below the status bar). */
  x: number;
  y: number;
  /** Size on a 390-point-wide phone; scaled with the screen. */
  size: number;
  tilt?: number;
};

const SCALLOP = 26;
const DEPTH = 13;

/** The scalloped bottom edge of a coloured block, like a market awning, outlined in ink. */
function Scallops({ width, color, line }: { width: number; color: string; line: string }) {
  const n = Math.max(4, Math.round(width / SCALLOP));
  const w = width / n;
  const arcs = Array.from({ length: n }, () => `a${(w / 2).toFixed(2)} ${DEPTH} 0 0 0 ${w.toFixed(2)} 0`).join(" ");
  return (
    <Svg width={width} height={DEPTH + 3} style={styles.scallops} pointerEvents="none" accessible={false}>
      <Path d={`M0 0 ${arcs} Z`} fill={color} />
      <Path d={`M0 0 ${arcs}`} fill="none" stroke={line} strokeWidth={2.5} strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * The coloured top of each screen. It runs under the status bar (white clock and battery stay readable on these
 * colours), the stickers pop in one after another and then bob, and `children` sit on top (title, back button).
 */
export function AuthHero({
  color,
  height,
  stickers,
  children,
  stickerDelay = 0,
  style,
}: {
  color: string;
  height: number;
  stickers: Sticker[];
  children?: ReactNode;
  stickerDelay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAuthLook();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const scale = width > 0 ? Math.min(1.25, Math.max(0.8, width / 390)) : 1;
  return (
    <View
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={[styles.hero, { backgroundColor: color, paddingTop: insets.top, height: height + insets.top }, style]}
    >
      {width > 0 ? <Scallops width={width} color={color} line={colors.line} /> : null}
      {width > 0
        ? stickers.map((s, i) => {
            const size = Math.round(s.size * scale);
            return (
              <View
                key={`${s.kind}${i}`}
                style={[styles.sticker, { left: s.x * width - size / 2, top: insets.top + s.y * height - size / 2, transform: [{ rotate: `${s.tilt ?? 0}deg` }] }]}
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
              >
                <PopIn delay={stickerDelay + i * 85}>
                  <Bob amp={5 + (i % 3) * 2} rock={2 + (i % 4)} period={3300 + ((i * 577) % 1900)} delay={stickerDelay + 800 + i * 85}>
                    <Squish>
                      <Fruit kind={s.kind} size={size} />
                    </Squish>
                  </Bob>
                </PopIn>
              </View>
            );
          })
        : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chunky: { alignSelf: "stretch", paddingRight: LIFT, paddingBottom: LIFT },
  chunkyShadow: { position: "absolute", left: LIFT, top: LIFT, right: 0, bottom: 0, borderRadius: 20, borderWidth: 2.5 },
  chunkyFace: {
    minHeight: 58,
    borderRadius: 20,
    borderWidth: 2.5,
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  chunkyLabel: { textAlign: "center", flexShrink: 1 },
  back: { width: 46, height: 46, borderRadius: 23, borderWidth: 2.5, alignItems: "center", justifyContent: "center" },
  tag: { borderWidth: 2.5, borderRadius: 999, paddingHorizontal: 14, paddingTop: 3, paddingBottom: 1, alignSelf: "center" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" },
  pill: { borderRadius: 999, borderWidth: 2, borderColor: "#2A1B12", paddingHorizontal: 11, minHeight: 34, justifyContent: "center" },
  hero: { zIndex: 1 },
  sticker: { position: "absolute" },
  scallops: { position: "absolute", left: 0, bottom: -DEPTH },
});
