// Cookmate primitives in the Stitch look: cream page, white cards with soft warm shadows, olive and terracotta, pills.
import { type ReactNode, type RefObject, useState } from "react";
import {
  ActivityIndicator,
  Platform,
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

import { Icon, type IconName } from "./icons";
import { illustrations } from "./media";
import { PressableScale } from "./motion";
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

/** Room left under scrolling content for the floating tab bar. */
export const TAB_BAR_SPACE = 120;

/** What a page scroller can do from code. */
export type Scroller = { scrollTo: (o: { y: number; animated?: boolean }) => void };

export function Screen({
  children,
  scroll = true,
  header,
  footer,
  tabBar = true,
  top,
  scrollRef,
}: {
  /** To scroll the page from code (Home's "See today's picks"). */
  scrollRef?: RefObject<Scroller | null>;
  children: ReactNode;
  /** Full-width block at the very top that scrolls with the page and runs under the status bar (Home's hero). */
  top?: ReactNode;
  scroll?: boolean;
  /** Sticky header (AppHeader) above the scrolling content. */
  header?: ReactNode;
  /** Fixed bar under the scrolling content (the recipe's Cook with me). */
  footer?: ReactNode;
  /** Leave room for the floating tab bar (tabs only). */
  tabBar?: boolean;
}) {
  const { colors } = useTheme();
  const bottom = tabBar ? TAB_BAR_SPACE : footer ? space.xl : space.xxxl;
  const body = scroll ? (
    top ? (
      <ScrollView ref={scrollRef as never} contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        {top}
        <View style={styles.screenContent}>{children}</View>
      </ScrollView>
    ) : (
      <ScrollView ref={scrollRef as never} contentContainerStyle={[styles.screenContent, { paddingBottom: bottom }]} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    )
  ) : (
    <View style={[styles.screenContent, { flex: 1, paddingBottom: bottom }]}>{children}</View>
  );
  return (
    <SafeAreaView edges={top ? (footer ? ["bottom"] : []) : footer ? ["top", "bottom"] : ["top"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
      {header}
      {body}
      {footer}
    </SafeAreaView>
  );
}

export type ButtonKind = "primary" | "accent" | "secondary" | "quiet" | "light";

export function Button({
  label,
  onPress,
  kind = "primary",
  size = "regular",
  disabled,
  accessibilityHint,
  textColor,
  icon,
  iconAfter,
  stretch,
}: {
  label: string;
  onPress: () => void;
  /** primary = olive; accent = terracotta (cooking, timers, the main call to action); light = white on a coloured card. */
  kind?: ButtonKind;
  size?: "small" | "regular" | "cook";
  disabled?: boolean;
  accessibilityHint?: string;
  /** Override for quiet buttons on dark surfaces (e.g. the undo snackbar). */
  textColor?: string;
  icon?: IconName;
  iconAfter?: IconName;
  /** Take the full width of the row. */
  stretch?: boolean;
}) {
  const { colors } = useTheme();
  const bg = {
    primary: colors.primary,
    accent: colors.accent,
    secondary: colors.surfaceMuted,
    quiet: "transparent",
    light: colors.surface,
  }[kind];
  const pressedBg = { primary: colors.primaryPressed, accent: colors.accentPressed, secondary: colors.surfaceHigh, quiet: colors.surfaceMuted, light: colors.surfaceMuted }[kind];
  const fg = textColor ?? { primary: colors.onPrimary, accent: colors.onAccent, secondary: colors.ink, quiet: colors.ink, light: colors.accentText }[kind];
  const minHeight = size === "cook" ? touch.cook : touch.min;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        (kind === "accent" || kind === "primary") && !disabled && size !== "small" ? shadow.card : null,
        {
          backgroundColor: pressed ? pressedBg : bg,
          minHeight,
          paddingHorizontal: size === "small" ? space.lg : space.xl,
          opacity: disabled ? 0.45 : 1,
          alignSelf: stretch ? "stretch" : undefined,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={size === "small" ? 18 : 20} color={fg} /> : null}
      <Text variant={size === "small" ? "label" : "bodyStrong"} weight={600} color={fg}>
        {label}
      </Text>
      {iconAfter ? <Icon name={iconAfter} size={size === "small" ? 18 : 20} color={fg} /> : null}
    </PressableScale>
  );
}

/**
 * Pill chip. Off: white with a hairline. On: soft peach (ingredients, likes) or, with `solid`, olive (filters).
 */
export function Chip({
  label,
  selected,
  onPress,
  solid,
  icon,
  showCheck,
  dashed,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  solid?: boolean;
  icon?: IconName;
  /** A tick after the label when selected (taste and setup screens). */
  showCheck?: boolean;
  /** Dashed terracotta outline: missing, needs restock. */
  dashed?: boolean;
}) {
  const { colors } = useTheme();
  const on = selected ? (solid ? colors.primary : colors.peach) : colors.surface;
  const fg = selected && solid ? colors.onPrimary : dashed ? colors.accentText : colors.ink;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[
        styles.chip,
        !selected && !dashed ? shadow.card : null,
        {
          backgroundColor: dashed ? "transparent" : on,
          borderColor: dashed ? colors.accent : selected ? "transparent" : colors.line,
          borderStyle: dashed ? "dashed" : "solid",
        },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text variant="label" color={fg}>
        {label}
      </Text>
      {selected && showCheck ? <Icon name="checkCircle" size={16} color={fg} /> : null}
    </PressableScale>
  );
}

export type CardTone = "surface" | "muted" | "primary" | "accent";

/**
 * Rounded card. surface = white with a soft shadow; muted = quiet panel; primary = olive feature card;
 * accent = terracotta alert card. `hero` (older screens) = pale olive.
 */
export function Card({
  children,
  tint,
  hero,
  tone = "surface",
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  tint?: string;
  hero?: boolean;
  tone?: CardTone;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const bg = tint ?? (hero ? colors.primarySoft : { surface: colors.surface, muted: colors.surfaceMuted, primary: colors.primaryContainer, accent: colors.accent }[tone]);
  const base = [
    styles.card,
    tone === "surface" && !tint && !hero ? shadow.card : null,
    tone === "accent" ? shadow.glow : null,
    (tone === "primary" || tone === "accent") && { borderRadius: radius.cardLg, padding: space.xl },
    { backgroundColor: bg },
    style,
  ];
  if (onPress) {
    return (
      <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} scaleTo={0.985} style={base}>
        {children}
      </PressableScale>
    );
  }
  return <View style={base}>{children}</View>;
}

/** Round icon button (header actions, add). */
export function IconButton({
  label,
  onPress,
  children,
  muted,
  tone,
  size: s = 44,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  muted?: boolean;
  tone?: "primary" | "accent" | "plain";
  size?: number;
}) {
  const { colors } = useTheme();
  const bg = tone === "primary" ? colors.primary : tone === "accent" ? colors.accent : tone === "plain" ? "transparent" : muted ? colors.surfaceHigh : colors.surface;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={Math.max(0, (touch.min - s) / 2)}
      scaleTo={0.92}
      style={[styles.iconButton, { width: s, height: s, borderRadius: s / 2, backgroundColor: bg }, !muted && !tone ? shadow.card : null]}
    >
      {children}
    </PressableScale>
  );
}

/** Text field: white pill with a hairline; olive ring when focused. */
export function Field({ variant = "body", style, onFocus, onBlur, ...rest }: TextInputProps & { variant?: Variant }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.inkTertiary}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.field,
        textStyle(variant),
        { color: colors.ink, backgroundColor: colors.surface, borderColor: focused ? colors.primary : colors.line },
        // The browser's own focus outline is replaced by the olive border above.
        Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
        style,
      ]}
    />
  );
}

/** Small pill label: "Use in 2 days", "Can make now", "Staple". */
export function Badge({
  label,
  tone = "muted",
  icon,
}: {
  label: string;
  tone?: "muted" | "primary" | "accent" | "alert" | "peach" | "onColor";
  icon?: IconName;
}) {
  const { colors } = useTheme();
  const [bg, fg] = {
    muted: [colors.surfaceHigh, colors.inkSecondary],
    primary: [colors.primarySoft, colors.primaryPressed],
    accent: [colors.accentSoft, colors.accentText],
    alert: [colors.alertSoft, colors.onAlertSoft],
    peach: [colors.peach, colors.peachText],
    onColor: ["rgba(255,255,255,0.2)", "#FFFFFF"],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={12} color={fg} /> : null}
      <Text variant="overline" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Section heading with a coloured dot and an optional note or action on the right. */
export function SectionHeader({
  title,
  dot,
  note,
  noteTone = "muted",
  onNote,
}: {
  title: string;
  dot?: string;
  note?: string;
  noteTone?: "muted" | "accent" | "primary";
  onNote?: () => void;
}) {
  const { colors } = useTheme();
  const noteColor = noteTone === "accent" ? colors.accentText : noteTone === "primary" ? colors.primaryText : colors.inkTertiary;
  return (
    <View style={styles.section} accessibilityRole="header">
      <View style={styles.sectionTitle}>
        {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
        <Text variant="subheading">{title}</Text>
      </View>
      {note ? (
        onNote ? (
          <Pressable accessibilityRole="button" onPress={onNote} hitSlop={12}>
            <Text variant="caption" weight={600} color={noteColor}>
              {note}
            </Text>
          </Pressable>
        ) : (
          <Text variant="caption" weight={600} color={noteColor}>
            {note}
          </Text>
        )
      ) : null}
    </View>
  );
}

/** Rounded photo with a soft tinted fallback (a picture may not be generated yet). */
export function Photo({
  source,
  size: s = 56,
  round,
  radius: r = radius.tag,
  style,
}: {
  source: ImageSourcePropType | null | undefined;
  size?: number;
  round?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const shape = { width: s, height: s, borderRadius: round ? s / 2 : r, overflow: "hidden" as const, backgroundColor: colors.surfaceMuted };
  return (
    <View style={[shape, style]} accessible={false}>
      {source ? <Image source={source} style={{ width: s, height: s }} resizeMode="cover" /> : null}
    </View>
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
        <ActivityIndicator color={colors.primaryText} />
      ) : art ? (
        <Image source={art} style={styles.illustration} resizeMode="contain" accessible={false} />
      ) : (
        <View
          style={[styles.illustration, styles.placeholder, { backgroundColor: state === "error" ? colors.alertSoft : colors.primaryPale }]}
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
  screenContent: { paddingHorizontal: space.gutter, paddingTop: space.sm, gap: space.xl },
  button: { borderRadius: radius.pill, flexDirection: "row", gap: space.sm, alignItems: "center", justifyContent: "center" },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    minHeight: 40,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: { borderRadius: radius.card, padding: space.gutter, gap: space.md },
  iconButton: { alignItems: "center", justifyContent: "center" },
  field: { borderRadius: radius.pill, paddingHorizontal: space.gutter, paddingVertical: space.md, minHeight: 52, borderWidth: 1 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  state: { alignItems: "center", gap: space.md, paddingVertical: space.xxxl },
  illustration: { width: 160, height: 160 },
  placeholder: { borderRadius: 80 },
});
