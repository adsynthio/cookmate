// Motion for the whole app: things press in, ease in, and move between states, never jump.
// Every helper follows the phone's "reduce motion" setting: movement turns into a short fade (or nothing).
import { type ReactNode, useEffect, useState } from "react";
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { motion } from "./tokens";

export { Animated, useReducedMotion };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A Pressable that shrinks a little while held and springs back: buttons, cards, chips, rows.
 * `style` may be a function of `pressed` like a normal Pressable.
 */
export function PressableScale({
  children,
  style,
  scaleTo = motion.pressScale,
  disabled,
  ...rest
}: Omit<PressableProps, "style"> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  scaleTo?: number;
}) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  // Animated components don't accept a style function, so the pressed state is tracked here and the style resolved.
  const [pressed, setPressed] = useState(false);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const resolved = typeof style === "function" ? style({ pressed }) : style;
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        if (!reduce) scale.value = withSpring(scaleTo, motion.spring);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        scale.value = withSpring(1, motion.spring);
        rest.onPressOut?.(e);
      }}
      style={[resolved, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Eases a block in from slightly below; `index` staggers siblings (cards in a list, rows). Animated by hand (not a
 * Reanimated "entering" animation), because those pin blocks in place on the web build and they overlap.
 */
export function Enter({
  children,
  index = 0,
  style,
  delay = 0,
}: {
  children: ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const wait = delay + Math.min(index, 8) * motion.stagger;
  const progress = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(wait, withTiming(1, { duration: motion.standard, easing: Easing.out(Easing.cubic) }));
  }, [reduce, wait, progress]);
  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Wrap a list item so that removing or adding neighbours slides the rest into place. */
export function Layout({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  // Layout transitions pin neighbouring blocks in place on the web build; there, new items just fade in.
  if (Platform.OS === "web" || reduce) {
    return <Enter style={style}>{children}</Enter>;
  }
  return (
    <Animated.View
      layout={LinearTransition.duration(motion.standard)}
      entering={FadeIn.duration(motion.quick)}
      exiting={FadeOut.duration(motion.quick)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** A progress bar that glides to its new value. */
export function ProgressBar({
  value,
  color,
  track,
  height = 6,
}: {
  value: number;
  color: string;
  track: string;
  height?: number;
}) {
  const reduce = useReducedMotion();
  const width = useSharedValue(0);
  useEffect(() => {
    const v = Math.max(0, Math.min(1, value));
    width.value = reduce ? v : withTiming(v, { duration: motion.slow, easing: Easing.out(Easing.cubic) });
  }, [value, reduce, width]);
  const fill = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return (
    <Animated.View style={{ height, borderRadius: height, backgroundColor: track, overflow: "hidden" }}>
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: color }, fill]} />
    </Animated.View>
  );
}

/** A soft breathing dot (live, listening, "in stock"). Still when motion is reduced. */
export function Pulse({ color, size = 6 }: { color: string; size?: number }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      o.value = withTiming(0.35, { duration: 900 }, () => {
        o.value = withTiming(1, { duration: 900 });
      });
    };
    loop();
    const id = setInterval(loop, 1800);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [reduce, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}
