// Cookmate primitives, styled from the brand kit: canvas + flat white cards, one lime, circles and pills.
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextInputProps,
  type TextProps as RNTextProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getLocale } from "@/i18n";

import { illustrations } from "./media";
import { useTheme } from "./theme";
import { DEVANAGARI_EXTRA_LEADING, fonts, radius, shadow, space, touch, type as typeScale, type Weight } from "./tokens";

export type Variant = keyof typeof typeScale;

/** Font family, size and leading for a type style in the current language. */
export function textStyle(variant: Variant, weight?: Weight) {
  const t = typeScale[variant];
  const hindi = getLocale() === "hi";
  const w = weight ?? t.weight;
  const tight = t.lineHeight < t.fontSize * 1.3;
  return {
    fontFamily: (hindi ? fonts.devanagari : fonts.latin)[w],
    fontSize: t.fontSize,
    lineHeight: hindi && tight ? t.lineHeight + DEVANAGARI_EXTRA_LEADING : t.lineHeight,
    letterSpacing: hindi ? 0 : ("letterSpacing" in t ? t.letterSpacing : 0),
  };
}

export function Text({
  variant = "body",
  weight,
  muted,
  color,
  style,
  ...rest
}: RNTextProps & { variant?: Variant; weight?: Weight; muted?: boolean; color?: string }) {
  const { colors } = useTheme();
  return (
    <RNText
      {...rest}
      style={[textStyle(variant, weight), { color: color ?? (muted ? colors.inkSecondary : colors.ink) }, style]}
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
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
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
  // Secondary buttons get a pale lime fill so they read as buttons on white cards as well as on the canvas.
  const bg = kind === "primary" ? colors.lime : kind === "secondary" ? colors.limePale : "transparent";
  const fg = textColor ?? (kind === "primary" ? colors.onLime : colors.ink);
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
        {
          backgroundColor: kind === "primary" && pressed ? colors.limePressed : bg,
          minHeight: size === "cook" ? touch.cook : touch.min,
          opacity: disabled ? 0.5 : pressed && kind !== "primary" ? 0.7 : 1,
        },
      ]}
    >
      <Text variant="bodyStrong" color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Pill chip: muted when off, soft lime when on (the selected-day treatment). */
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? colors.limeSoft : colors.surfaceMuted, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Text variant="label" weight={selected ? 500 : 400}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Flat white card. `hero` = the one lime-filled card a screen may have. */
export function Card({
  children,
  tint,
  hero,
  style,
}: {
  children: ReactNode;
  tint?: string;
  hero?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        hero && { borderRadius: radius.cardLg },
        { backgroundColor: tint ?? (hero ? colors.limeSoft : colors.surface) },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Round icon button (header actions, add). */
export function IconButton({
  label,
  onPress,
  children,
  muted,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  muted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: muted ? colors.surfaceMuted : colors.surface, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Text field: muted fill, no border until focused, pill-round corners like the rest of the kit. */
export function Field({ variant = "body", style, ...rest }: TextInputProps & { variant?: Variant }) {
  const { colors } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.inkSecondary}
      {...rest}
      style={[styles.field, textStyle(variant), { color: colors.ink, backgroundColor: colors.surfaceMuted }, style]}
    />
  );
}

export type ScreenState = "loading" | "empty" | "offline" | "error";

/** HOME-08 / KIT-012: every state has copy, an illustration slot and a recovery action. */
export function StateView({
  state,
  title,
  body,
  actionLabel,
  onAction,
  illustration,
}: {
  state: ScreenState;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Art for this state (assets/media/illustrations); offline and error have defaults. */
  illustration?: ImageSourcePropType | null;
}) {
  const { colors } = useTheme();
  const art = illustration ?? (state === "offline" ? illustrations.offline : state === "error" ? illustrations.error : null);
  return (
    <View style={styles.state} accessibilityLiveRegion="polite">
      {state === "loading" ? (
        <ActivityIndicator color={colors.limeText} />
      ) : art ? (
        <Image source={art} style={styles.illustration} resizeMode="contain" accessible={false} />
      ) : (
        <View
          style={[styles.illustration, styles.placeholder, { backgroundColor: state === "error" ? colors.alertSoft : colors.limePale }]}
        />
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

export { shadow };

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: space.gutter, paddingTop: space.lg, gap: space.lg, paddingBottom: space.xxxl * 2 },
  button: { borderRadius: radius.pill, paddingHorizontal: space.xl, alignItems: "center", justifyContent: "center" },
  chip: { borderRadius: radius.pill, paddingHorizontal: space.lg, minHeight: 40, justifyContent: "center" },
  card: { borderRadius: radius.card, padding: space.lg, gap: space.sm },
  iconButton: { width: 48, height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  field: { borderRadius: radius.tag, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: touch.min },
  state: { alignItems: "center", gap: space.md, paddingVertical: space.xxxl },
  illustration: { width: 160, height: 160 },
  placeholder: { borderRadius: 80 },
});
