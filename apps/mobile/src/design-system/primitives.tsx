import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type TextProps as RNTextProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "./theme";
import { radius, space, touch, type as typeScale } from "./tokens";

type Variant = keyof typeof typeScale;

export function Text({
  variant = "body",
  muted,
  color,
  style,
  ...rest
}: RNTextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  const { colors } = useTheme();
  return (
    <RNText
      {...rest}
      style={[typeScale[variant], { color: color ?? (muted ? colors.textMuted : colors.text) }, style]}
    />
  );
}

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.screenContent}>{children}</ScrollView>
  ) : (
    <View style={[styles.screenContent, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      {body}
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  kind = "primary",
  size = "regular",
  disabled,
  accessibilityHint,
  textColor,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "quiet";
  size?: "regular" | "cook";
  disabled?: boolean;
  accessibilityHint?: string;
  /** Override for quiet buttons on dark surfaces (e.g. the undo snackbar). */
  textColor?: string;
}) {
  const { colors } = useTheme();
  const bg = kind === "primary" ? colors.primary : kind === "secondary" ? colors.surface : "transparent";
  const fg = textColor ?? (kind === "primary" ? colors.onPrimary : colors.text);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, minHeight: size === "cook" ? touch.cook : touch.min, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text variant="label" color={fg} style={{ fontSize: size === "cook" ? 18 : 16 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.tintTomato : colors.surface, borderColor: selected ? colors.primary : colors.border },
      ]}
    >
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}

export function Card({ children, tint, style }: { children: ReactNode; tint?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: tint ?? colors.surface }, style]}>{children}</View>;
}

export type ScreenState = "loading" | "empty" | "offline" | "error";

/** HOME-08 / KIT-012: every state has copy, an illustration slot and a recovery action. */
export function StateView({
  state,
  title,
  body,
  actionLabel,
  onAction,
}: {
  state: ScreenState;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.state} accessibilityLiveRegion="polite">
      {state === "loading" ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={[styles.illustration, { backgroundColor: state === "error" ? colors.tintTomato : colors.tintHaldi }]} />
      )}
      <Text variant="heading" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {body ? (
        <Text muted style={{ textAlign: "center" }}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} kind="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { padding: space.lg, gap: space.lg, paddingBottom: space.xxxl },
  button: { borderRadius: radius.pill, paddingHorizontal: space.xl, alignItems: "center", justifyContent: "center" },
  chip: { borderRadius: radius.chip, borderWidth: 1, paddingHorizontal: space.md, minHeight: touch.min, justifyContent: "center" },
  card: { borderRadius: radius.card, padding: space.lg, gap: space.sm },
  state: { alignItems: "center", gap: space.md, paddingVertical: space.xxxl },
  illustration: { width: 96, height: 96, borderRadius: 48 },
});
