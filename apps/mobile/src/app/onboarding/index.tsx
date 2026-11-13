// ONB-01 / KIT-020 welcome, from the Stitch "Meet your kitchen companion" screen: brand chip and language switch on
// top, a big rounded food photo, the promise, three things Cookmate does (easing in one by one), and "Get started",
// which creates an anonymous account (no email or password). The language is chosen here (ONB-02), so every step
// after this one is already in it.
import { useMutation } from "@tanstack/react-query";
import { Image as MotionImage } from "expo-image";
import { useRouter } from "expo-router";
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/design-system/icons";
import { scenes } from "@/design-system/media";
import { Enter, PressableScale, useReducedMotion } from "@/design-system/motion";
import { Button, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { LOCALES, setLocale, t, useLocale, type Locale, type StringKey } from "@/i18n";
import { services } from "@/services";
import { startErrorKind, type StartErrorKind } from "@/domain/startError";

const FEATURES: { key: "f1" | "f2" | "f3"; icon: IconName; tone: "primary" | "accent" | "peach" }[] = [
  { key: "f1", icon: "fridge", tone: "primary" },
  { key: "f2", icon: "heart", tone: "accent" },
  { key: "f3", icon: "speaker", tone: "peach" },
];

const START_ERROR: Record<StartErrorKind, StringKey> = {
  offline: "onb.welcome.error",
  closed: "onb.welcome.error.closed",
  busy: "onb.welcome.error.busy",
  other: "onb.welcome.error.other",
};

export default function WelcomeScreen() {
  const locale = useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const width = useWindowDimensions().width;
  const start = useMutation({
    mutationFn: () => services.auth.ensureSignedIn(),
    onSuccess: () => router.push("/onboarding/family"),
  });
  const wells = { primary: [colors.primarySoft, colors.primaryText], accent: [colors.accentSoft, colors.accentText], peach: [colors.peach, colors.peachText] };
  const heroH = Math.min(320, (Math.min(width, 480) - space.gutter * 2) * 0.64);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.screen, { backgroundColor: colors.canvas }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <View style={[styles.brand, { backgroundColor: colors.surfaceMuted }]}>
            <Icon name="leaf" size={18} color={colors.primaryText} />
            <Text variant="label" weight={600}>
              Cookmate
            </Text>
          </View>
          <LanguageSwitch value={locale} onChange={setLocale} />
        </View>

        <Enter>
          <View style={[styles.hero, { height: heroH, backgroundColor: colors.primaryPale }]}>
            {reduceMotion && scenes.welcome ? (
              <Image source={scenes.welcome} style={styles.heroImage} resizeMode="cover" accessible={false} />
            ) : (
              // A home thali with steam rising; the still shows while it loads and when motion is turned off.
              <MotionImage source={WELCOME_MOTION} placeholder={scenes.welcome as number | null} contentFit="cover" style={styles.heroImage} accessible={false} />
            )}
            <View style={[styles.heroBadge, { backgroundColor: colors.surface }]}>
              <Icon name="sparkle" size={16} color={colors.accentText} />
              <Text variant="label">{t("onb.w.badge")}</Text>
            </View>
          </View>
        </Enter>

        <Enter delay={80} style={styles.copy}>
          <Text variant="overline" color={colors.accentText} style={styles.center}>
            {t("onb.w.overline").toUpperCase()}
          </Text>
          <Text variant="title" accessibilityRole="header" style={styles.center}>
            {t("onb.w.title")}
          </Text>
          <Text muted style={styles.center}>
            {t("onb.w.body")}
          </Text>
        </Enter>

        <View style={styles.features}>
          {FEATURES.map((f, i) => {
            const [bg, fg] = wells[f.tone];
            return (
              <Enter key={f.key} index={i} delay={160}>
                <View style={[styles.feature, shadow.card, { backgroundColor: colors.surface }]}>
                  <View style={[styles.well, { backgroundColor: bg }]}>
                    <Icon name={f.icon} size={24} color={fg} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="subheading">{t(`onb.w.${f.key}.title` as StringKey)}</Text>
                    <Text variant="caption" muted>
                      {t(`onb.w.${f.key}.body` as StringKey)}
                    </Text>
                  </View>
                  <Icon name="checkCircle" size={22} color={colors.inkTertiary} />
                </View>
              </Enter>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.bottom}>
        {start.isError ? (
          <Text color={colors.alert} accessibilityLiveRegion="assertive" style={styles.center}>
            {t(START_ERROR[startErrorKind(start.error)])}
          </Text>
        ) : null}
        <Button
          kind="accent"
          size="cook"
          stretch
          label={start.isPending ? t("onb.consent.creating") : t("onb.w.start")}
          iconAfter="forward"
          disabled={start.isPending}
          onPress={() => start.mutate()}
        />
        <Text variant="caption" muted style={styles.center}>
          {t("onb.w.note")}
        </Text>
      </View>
    </SafeAreaView>
  );
}

/** English · हिन्दी · Hinglish, as one pill with the chosen language filled in olive. */
function LanguageSwitch({ value, onChange }: { value: Locale; onChange: (l: Locale) => void }) {
  const { colors } = useTheme();
  const order: Locale[] = ["en", "hi", "hinglish"].filter((l) => (LOCALES as readonly string[]).includes(l)) as Locale[];
  return (
    <View style={[styles.lang, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="radiogroup">
      {order.map((l) => {
        const on = value === l;
        return (
          <PressableScale
            key={l}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={t(`lang.${l}` as StringKey)}
            onPress={() => onChange(l)}
            style={[styles.langItem, on && { backgroundColor: colors.primary }]}
          >
            <Text variant="caption" weight={600} color={on ? colors.onPrimary : colors.inkSecondary}>
              {t(`lang.${l}` as StringKey)}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const WELCOME_MOTION = require("../../../assets/media/scenes/welcome-motion.webp") as number;

const styles = StyleSheet.create({
  heroImage: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  screen: { flex: 1 },
  content: { paddingHorizontal: space.gutter, paddingTop: space.sm, paddingBottom: space.xl, gap: space.xl },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" },
  brand: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 8 },
  lang: { flexDirection: "row", borderRadius: radius.pill, padding: 3 },
  langItem: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: "center" },
  hero: { borderRadius: radius.cardLg, overflow: "hidden", justifyContent: "flex-end", padding: space.lg },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 8 },
  copy: { gap: space.sm, alignItems: "center" },
  center: { textAlign: "center" },
  features: { gap: space.md },
  feature: { flexDirection: "row", alignItems: "center", gap: space.lg, borderRadius: radius.cardLg, padding: space.gutter },
  well: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  bottom: { paddingHorizontal: space.gutter, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm },
});
