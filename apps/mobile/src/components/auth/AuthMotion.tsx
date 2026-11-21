// Movement for the sign-up screens. The loops (stickers bobbing, the ingredient ticker) are CSS animations, so on the
// web they run in the browser's compositor and on phones on the UI thread: smooth, and no JavaScript every frame.
// "Reduce motion" turns all of it off: stickers sit still and the ticker stands.
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  css,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const POP = css.keyframes({
  "0%": { opacity: 0, transform: [{ translateY: 30 }, { scale: 0.4 }, { rotate: "-14deg" }] },
  "55%": { opacity: 1, transform: [{ translateY: -8 }, { scale: 1.1 }, { rotate: "5deg" }] },
  "78%": { opacity: 1, transform: [{ translateY: 2 }, { scale: 0.96 }, { rotate: "-2deg" }] },
  "100%": { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }, { rotate: "0deg" }] },
});

const RISE = css.keyframes({
  "0%": { opacity: 0, transform: [{ translateY: 18 }] },
  "100%": { opacity: 1, transform: [{ translateY: 0 }] },
});

/** Drops in with a little overshoot, like a sticker slapped on. */
export function PopIn({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  if (reduce) return <View style={style}>{children}</View>;
  return (
    <Animated.View
      style={[
        style,
        { animationName: POP, animationDuration: "720ms", animationDelay: `${delay}ms`, animationFillMode: "both", animationTimingFunction: "ease-out" },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Eases up into place: text and buttons, after the stickers. */
export function Rise({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  if (reduce) return <View style={style}>{children}</View>;
  return (
    <Animated.View
      style={[
        style,
        { animationName: RISE, animationDuration: "520ms", animationDelay: `${delay}ms`, animationFillMode: "both", animationTimingFunction: "ease-out" },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Bobs up and down and rocks a little, forever. Each sticker gets its own period so they never move in step. */
export function Bob({
  amp = 7,
  rock = 4,
  period = 3800,
  delay = 0,
  children,
}: {
  amp?: number;
  rock?: number;
  period?: number;
  delay?: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const name = useMemo(
    () =>
      css.keyframes({
        "0%": { transform: [{ translateY: 0 }, { rotate: `${-rock}deg` }] },
        "50%": { transform: [{ translateY: -amp }, { rotate: `${rock}deg` }] },
        "100%": { transform: [{ translateY: 0 }, { rotate: `${-rock}deg` }] },
      }),
    [amp, rock],
  );
  if (reduce) return <View>{children}</View>;
  return (
    <Animated.View
      style={{
        animationName: name,
        animationDuration: `${period}ms`,
        animationDelay: `${delay}ms`,
        animationIterationCount: "infinite",
        animationTimingFunction: "ease-in-out",
        animationFillMode: "both",
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Tap a sticker and it squishes and wobbles (just for fun; screen readers skip it). */
export function Squish({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const turn = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: `${turn.value}deg` }] }));
  return (
    <Pressable
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onPress={() => {
        if (reduce) return;
        scale.value = withSequence(withTiming(1.22, { duration: 110 }), withSpring(1, { damping: 6, stiffness: 240 }));
        turn.value = withSequence(withTiming(14, { duration: 90 }), withTiming(-11, { duration: 120 }), withSpring(0, { damping: 5, stiffness: 200 }));
      }}
    >
      <Animated.View style={style}>{children}</Animated.View>
    </Pressable>
  );
}

/** A band of words that scrolls sideways without end, like market tape. Three copies cover any phone width. */
export function Ticker({
  text,
  textStyle,
  style,
  speed = 34,
}: {
  text: string;
  textStyle: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  /** Points per second. */
  speed?: number;
}) {
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const name = useMemo(
    () => (w > 0 ? css.keyframes({ "0%": { transform: [{ translateX: 0 }] }, "100%": { transform: [{ translateX: -w }] } }) : null),
    [w],
  );
  const piece = `${text}   •   `;
  return (
    <View style={[styles.band, style]} accessible accessibilityLabel={text}>
      <Animated.View
        style={[
          styles.row,
          name && !reduce
            ? { animationName: name, animationDuration: `${Math.round((w / speed) * 1000)}ms`, animationIterationCount: "infinite", animationTimingFunction: "linear" }
            : null,
        ]}
      >
        {[0, 1, 2].map((i) => (
          <Text
            key={i}
            numberOfLines={1}
            onLayout={i === 0 ? (e) => setW(Math.round(e.nativeEvent.layout.width)) : undefined}
            style={[textStyle, styles.piece]}
            importantForAccessibility="no"
            accessibilityElementsHidden
          >
            {piece}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

/** Uncovers its child from left to right (a squiggle "drawn" under the name). */
export function Reveal({ width, height, delay = 0, duration = 700, children }: { width: number; height: number; delay?: number; duration?: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  const name = useMemo(() => css.keyframes({ "0%": { width: 0 }, "100%": { width } }), [width]);
  return (
    <Animated.View
      style={[
        { height, overflow: "hidden", width },
        reduce ? null : { animationName: name, animationDuration: `${duration}ms`, animationDelay: `${delay}ms`, animationFillMode: "both", animationTimingFunction: "ease-in-out" },
      ]}
    >
      <View style={{ width, height }}>{children}</View>
    </Animated.View>
  );
}

const HOP = css.keyframes({
  "0%": { transform: [{ translateY: 0 }] },
  "40%": { transform: [{ translateY: -5 }] },
  "80%": { transform: [{ translateY: 0 }] },
  "100%": { transform: [{ translateY: 0 }] },
});

/** Three little dots hopping in turn: "working on it" on a button. */
export function Hopping({ colors }: { colors: [string, string, string] }) {
  const reduce = useReducedMotion();
  return (
    <View style={styles.dots} accessible={false}>
      {colors.map((c, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: c },
            reduce
              ? null
              : { animationName: HOP, animationDuration: "900ms", animationDelay: `${i * 140}ms`, animationIterationCount: "infinite", animationTimingFunction: "ease-in-out" },
          ]}
        />
      ))}
    </View>
  );
}

/** Shake sideways (a wrong code). */
export function useShake() {
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const shake = () => {
    x.value = withSequence(
      withTiming(-12, { duration: 50 }),
      withTiming(11, { duration: 70 }),
      withTiming(-8, { duration: 70 }),
      withTiming(6, { duration: 70 }),
      withTiming(-3, { duration: 60 }),
      withTiming(0, { duration: 50 }),
    );
  };
  return { style, shake };
}

const styles = StyleSheet.create({
  band: { overflow: "hidden" },
  row: { flexDirection: "row", alignSelf: "flex-start" },
  piece: { flexShrink: 0 },
  dots: { flexDirection: "row", gap: 5, alignItems: "center", height: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
