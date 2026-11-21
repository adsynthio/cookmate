// ONB-01 welcome: the shop front. A banana-leaf green block runs under the status bar with fruit and vegetable
// stickers that pop on and bob, the name with a hand-drawn squiggle, market tape of everyday ingredients scrolling
// past, and two ways in: create an account or log in, both with an emailed 6-digit code (no passwords). The language
// is chosen here (ONB-02), so every step after this one is already in it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { AuthHero, ChunkyButton, Display, LanguagePills, Tag, type Sticker } from "@/components/auth/AuthKit";
import { PopIn, Reveal, Rise, Ticker } from "@/components/auth/AuthMotion";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { INK } from "@/components/auth/fruitArt";
import { displayType, SCENE, useAuthLook } from "@/components/auth/look";
import { textStyle } from "@/design-system/primitives";
import { setLocale, t, useAppLocale, useLocale } from "@/i18n";
import { services } from "@/services";

// Around the edges, so the name in the middle stays clear; the bottom two spill over the scalloped edge.
const STICKERS: Sticker[] = [
  { kind: "watermelon", x: 0.13, y: 0.22, size: 84, tilt: -16 },
  { kind: "mango", x: 0.88, y: 0.3, size: 74, tilt: 14 },
  { kind: "lemon", x: 0.08, y: 0.66, size: 58 },
  { kind: "chilli", x: 0.92, y: 0.72, size: 68, tilt: 22 },
  { kind: "tomato", x: 0.28, y: 0.97, size: 50, tilt: -6 },
  { kind: "brinjal", x: 0.73, y: 0.99, size: 56, tilt: -20 },
];

/** A loose wave, drawn under the name. */
function Squiggle({ width, color }: { width: number; color: string }) {
  const step = width / 8;
  const d = `M4 9 Q ${step / 2 + 4} 1 ${step + 4} 9 ${Array.from({ length: 6 }, (_, i) => `T ${(i + 2) * step + 4} 9`).join(" ")}`;
  return (
    <Svg width={width + 8} height={18} accessible={false}>
      <Path d={d} stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export default function WelcomeScreen() {
  useLocale();
  const appLocale = useAppLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const { colors, display } = useAuthLook();
  const { height, width } = useWindowDimensions();
  const heroH = Math.round(Math.min(380, Math.max(250, height * 0.36)));
  const wordSize = Math.round(Math.min(60, Math.max(42, Math.min(width, 520) * 0.13)));
  const squiggle = Math.round(wordSize * 2.6);

  // Signed in with an email but no kitchen yet (left during setup): carry on instead of starting again.
  const account = useQuery({ queryKey: ["account"], queryFn: () => services.auth.getAccount() });
  const pending = account.data?.email ? account.data.email : null;
  const signOut = useMutation({
    mutationFn: () => services.auth.signOut(),
    onSuccess: () => qc.setQueryData(["account"], null),
  });

  const go = (mode: "signup" | "login") => router.push({ pathname: "/onboarding/email", params: { mode } });

  return (
    <AuthScreen heroHeight={heroH}>
      <AuthHero color={SCENE.leaf} height={heroH} stickers={STICKERS} stickerDelay={250}>
        <View style={styles.bar}>
          <LanguagePills value={appLocale} onChange={setLocale} />
        </View>
        <View style={styles.middle} pointerEvents="box-none">
          <PopIn delay={60}>
            <Text
              accessibilityRole="header"
              style={[displayType(wordSize, display, true), styles.wordmark, { lineHeight: Math.round(wordSize * 1.1) }]}
            >
              Cookmate
            </Text>
          </PopIn>
          <Reveal width={squiggle + 8} height={18} delay={700} duration={650}>
            <Squiggle width={squiggle} color={SCENE.mango} />
          </Reveal>
          <PopIn delay={1050} style={styles.tagWrap}>
            <Tag text={t("auth.welcome.tag")} tilt={-4} bg={SCENE.lemon} />
          </PopIn>
        </View>
      </AuthHero>

      <Ticker
        text={t("auth.ticker")}
        style={[styles.ticker, { borderColor: colors.line }]}
        textStyle={[displayType(17, display), styles.tickerText]}
      />

      <View style={styles.body}>
        <Rise delay={350}>
          <Display size={31} color={colors.ink}>
            {t("auth.welcome.title")}
          </Display>
        </Rise>
        <Rise delay={430}>
          <Text style={[textStyle("body"), styles.lead, { color: colors.inkSoft }]}>{t("auth.welcome.body")}</Text>
        </Rise>
        <View style={styles.push} />
        <Rise delay={520} style={styles.actions}>
          {pending ? (
            <>
              <Text style={[textStyle("label", 600), styles.center, { color: colors.ink }]}>{t("auth.welcome.continueAs", { email: pending })}</Text>
              <ChunkyButton label={t("auth.welcome.continue")} shadow={SCENE.melon} onPress={() => router.push("/onboarding/family")} />
              <ChunkyButton label={t("auth.welcome.other")} tone="light" shadow={SCENE.mango} busy={signOut.isPending} onPress={() => signOut.mutate()} />
            </>
          ) : (
            <>
              <ChunkyButton label={t("auth.welcome.create")} shadow={SCENE.melon} onPress={() => go("signup")} />
              <ChunkyButton label={t("auth.welcome.login")} tone="light" shadow={SCENE.mango} onPress={() => go("login")} />
              <Text style={[textStyle("caption"), styles.center, { color: colors.inkSoft }]}>{t("auth.welcome.note")}</Text>
            </>
          )}
        </Rise>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 16, paddingTop: 10, zIndex: 2 },
  middle: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 6, paddingBottom: 22 },
  wordmark: {
    color: "#FFFFFF",
    textShadowColor: INK,
    textShadowOffset: { width: 3, height: 4 },
    textShadowRadius: 1,
    transform: [{ rotate: "-3deg" }],
  },
  tagWrap: { marginTop: 10 },
  ticker: {
    marginTop: 30,
    marginHorizontal: -24,
    backgroundColor: SCENE.mango,
    borderTopWidth: 2.5,
    borderBottomWidth: 2.5,
    paddingVertical: 6,
    transform: [{ rotate: "-2.5deg" }],
  },
  tickerText: { color: INK, paddingTop: 2 },
  body: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 26, gap: 12 },
  lead: { fontSize: 15, lineHeight: 22 },
  push: { flexGrow: 1, minHeight: 8 },
  actions: { gap: 14 },
  center: { textAlign: "center" },
});
