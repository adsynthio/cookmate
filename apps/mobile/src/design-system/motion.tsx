// Motion for the whole app: things press in, ease in, and move between states, never jump.
// Every helper follows the phone's "reduce motion" setting: movement turns into a short fade (or nothing).
import { type ReactNode, useEffect } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
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
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (!reduce) scale.value = withSpring(scaleTo, motion.spring);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, motion.spring);
        rest.onPressOut?.(e);
      }}
      style={(state: { pressed: boolean }) => [typeof style === "function" ? style(state) : style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Eases a block in from slightly below; `index` staggers siblings (cards in a list, rows). */
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
  const entering = reduce
    ? FadeIn.duration(motion.quick).delay(wait)
    : FadeInDown.duration(motion.standard).delay(wait).easing(Easing.out(Easing.cubic)).withInitialValues({ transform: [{ translateY: 14 }] });
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

/** Wrap a list item so that removing or adding neighbours slides the rest into place. */
export function Layout({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  return (
    <Animated.View
      layout={reduce ? undefined : LinearTransition.duration(motion.standard)}
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
