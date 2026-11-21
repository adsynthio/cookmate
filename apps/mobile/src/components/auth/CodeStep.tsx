// Step 2: the 6-digit code from the email. Six chunky boxes that fill with fruit colours as the cook types (or pastes,
// or taps the code iOS offers from Mail); the sixth digit checks it straight away. A wrong code shakes the boxes; the
// right one makes them hop, and then: an existing kitchen opens, a new account goes on to set up, or (saving an
// anonymous kitchen) the cook goes back to You with the email on the account.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import Animated, { css, useReducedMotion } from "react-native-reanimated";

import { textStyle } from "@/design-system/primitives";
import { appLocaleFromLanguageCode } from "@/domain/onboarding";
import { CODE_LENGTH, cleanCode, RESEND_AFTER_S } from "@/domain/emailAuth";
import { setLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, usingMocks } from "@/services";
import { useSession } from "@/state/session";

import { AuthHero, BackButton, ChunkyButton, Display, type Sticker } from "./AuthKit";
import { Rise, useShake } from "./AuthMotion";
import { AuthScreen } from "./AuthScreen";
import { authStyles, type AuthMode } from "./EmailStep";
import { INK } from "./fruitArt";
import { SCENE, useAuthLook } from "./look";

const STICKERS: Sticker[] = [
  { kind: "pomegranate", x: 0.8, y: 0.52, size: 96, tilt: 8 },
  { kind: "banana", x: 0.55, y: 0.2, size: 66, tilt: -8 },
  { kind: "mango", x: 0.96, y: 0.12, size: 54, tilt: 16 },
  { kind: "tomato", x: 0.5, y: 0.82, size: 54, tilt: -10 },
];

/** A fruit colour per box, left to right. */
const BOX_FILL = [SCENE.mango, SCENE.blush, SCENE.lime, SCENE.lemon, SCENE.lilac, SCENE.peach];

const POP = css.keyframes({
  "0%": { transform: [{ scale: 0.55 }, { rotate: "-10deg" }] },
  "60%": { transform: [{ scale: 1.14 }, { rotate: "4deg" }] },
  "100%": { transform: [{ scale: 1 }, { rotate: "0deg" }] },
});
const HOP = css.keyframes({
  "0%": { transform: [{ translateY: 0 }] },
  "35%": { transform: [{ translateY: -16 }] },
  "70%": { transform: [{ translateY: 2 }] },
  "100%": { transform: [{ translateY: 0 }] },
});
const BLINK = css.keyframes({ "0%": { opacity: 1 }, "49%": { opacity: 1 }, "50%": { opacity: 0 }, "100%": { opacity: 0 } });

type Phase = "typing" | "checking" | "wrong" | "offline" | "done" | "finishFailed";

/** After a good code: open the account's kitchen, or set one up. Throws when the household can't be read. */
function useFinish(mode: AuthMode) {
  const router = useRouter();
  const qc = useQueryClient();
  const setHousehold = useSession((s) => s.setHousehold);
  return async () => {
    if (mode === "link") {
      // Same account, now with an email: back to You, which shows it.
      await qc.invalidateQueries({ queryKey: ["account"] });
      if (router.canDismiss()) router.dismissAll();
      else router.replace("/you");
      return;
    }
    const ref = await services.auth.getCurrentHousehold();
    // The welcome screen underneath now knows who is signed in ("Continue setting up").
    void qc.invalidateQueries({ queryKey: ["account"] });
    if (ref) {
      const locale = appLocaleFromLanguageCode(ref.languageCode);
      if (locale) setLocale(locale);
      setHousehold(ref.householdId, ref.memberId);
      router.replace("/");
    } else {
      // Set up a kitchen. Back from there goes to the welcome screen, not to the email and code steps.
      if (router.canDismiss()) router.dismissAll();
      router.push("/onboarding/family");
    }
  };
}

export function CodeStep({ email, mode, sentAt }: { email: string; mode: AuthMode; sentAt?: string }) {
  useLocale();
  const router = useRouter();
  const reduce = useReducedMotion();
  const { colors } = useAuthLook();
  const { height } = useWindowDimensions();
  const heroH = Math.round(Math.min(210, Math.max(150, height * 0.22)));
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const { style: shakeStyle, shake } = useShake();
  const finish = useFinish(mode);

  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");
  const [focused, setFocused] = useState(false);
  const [sent, setSent] = useState(() => Number(sentAt) || Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<StringKey | null>(null);
  const wait = Math.max(0, RESEND_AFTER_S - Math.floor((now - sent) / 1000));

  useEffect(() => {
    if (wait === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [wait]);

  const runFinish = async () => {
    try {
      await finish();
    } catch {
      setPhase("finishFailed");
    }
  };

  const verify = useMutation({
    mutationFn: (c: string) => services.auth.verifyEmailCode(email, c, mode === "link" ? "link" : "signin"),
    onSuccess: (ok) => {
      if (!ok) {
        setPhase("wrong");
        setCode("");
        shake();
        setTimeout(() => input.current?.focus(), 60);
        return;
      }
      setPhase("done");
      // Let the boxes hop before the next screen slides in.
      setTimeout(() => void runFinish(), reduce ? 150 : 750);
    },
    onError: () => setPhase("offline"),
  });

  const resend = useMutation({
    mutationFn: () => services.auth.sendEmailCode(email, mode === "link" ? "link" : "signin"),
    onSuccess: (r) => {
      setSent(Date.now());
      setNow(Date.now());
      setNotice(r === "sent" ? "auth.code.resent" : r === "rate_limited" ? "auth.email.err.busy" : r === "taken" ? "auth.email.err.taken" : "auth.email.err.notAllowed");
    },
    onError: () => setNotice("auth.email.err.other"),
  });

  const onChange = (raw: string) => {
    if (phase === "checking" || phase === "done") return;
    const c = cleanCode(raw);
    setCode(c);
    setNotice(null);
    setPhase("typing");
    if (c.length === CODE_LENGTH) {
      setPhase("checking");
      verify.mutate(c);
    }
  };

  const message: { key: StringKey; tone: "error" | "soft" } | null =
    phase === "checking"
      ? { key: "auth.code.checking", tone: "soft" }
      : phase === "wrong"
        ? { key: "auth.code.wrong", tone: "error" }
        : phase === "offline" || phase === "finishFailed"
          ? { key: "auth.code.error", tone: "error" }
          : phase === "done"
            ? { key: mode === "link" ? "auth.code.saved" : "auth.code.done", tone: "soft" }
            : notice
              ? { key: notice, tone: notice === "auth.code.resent" ? "soft" : "error" }
              : null;

  return (
    <AuthScreen heroHeight={heroH}>
      <AuthHero color={SCENE.brinjal} height={heroH} stickers={STICKERS} stickerDelay={60}>
        <View style={authStyles.bar}>
          <BackButton onPress={() => router.back()} />
        </View>
      </AuthHero>
      <View style={authStyles.body}>
        <Rise delay={80}>
          <Display size={32} color={colors.ink} accessibilityRole="header">
            {t("auth.code.title")}
          </Display>
        </Rise>
        <Rise delay={150} style={styles.sentTo}>
          <Text style={[textStyle("body"), styles.lead, { color: colors.inkSoft }]}>{t("auth.code.body")}</Text>
          <View style={styles.emailRow}>
            <Text style={[textStyle("bodyStrong", 600), styles.email, { color: colors.ink }]} numberOfLines={1}>
              {email}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10} style={[styles.change, { borderColor: colors.line }]}>
              <Text style={[textStyle("caption", 600), { color: colors.ink }]}>{t("auth.code.change")}</Text>
            </Pressable>
          </View>
        </Rise>

        <Rise delay={220}>
          <Animated.View style={shakeStyle}>
            <Pressable accessible={false} onPress={() => input.current?.focus()} style={styles.boxes}>
              {Array.from({ length: CODE_LENGTH }, (_, i) => {
                const digit = code[i];
                const caret = focused && phase !== "checking" && phase !== "done" && i === code.length;
                return (
                  <Animated.View
                    key={digit ? `f${i}` : `e${i}`}
                    style={[
                      styles.box,
                      {
                        backgroundColor: digit || phase === "done" ? BOX_FILL[i] : colors.surface,
                        borderColor: phase === "wrong" ? colors.error : colors.line,
                        borderWidth: caret ? 3.5 : 2.5,
                      },
                      reduce
                        ? null
                        : phase === "done"
                          ? { animationName: HOP, animationDuration: "520ms", animationDelay: `${i * 70}ms`, animationFillMode: "both" }
                          : digit
                            ? { animationName: POP, animationDuration: "320ms", animationTimingFunction: "ease-out" }
                            : null,
                    ]}
                  >
                    {digit ? (
                      <Display size={30} color={INK} latin>
                        {digit}
                      </Display>
                    ) : caret ? (
                      <Animated.View
                        style={[
                          styles.caret,
                          { backgroundColor: colors.ink },
                          reduce ? null : { animationName: BLINK, animationDuration: "1s", animationIterationCount: "infinite", animationTimingFunction: "linear" },
                        ]}
                      />
                    ) : null}
                  </Animated.View>
                );
              })}
              <TextInput
                ref={input}
                value={code}
                onChangeText={onChange}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoFocus
                keyboardType="number-pad"
                inputMode="numeric"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                accessibilityLabel={t("auth.code.label")}
                caretHidden
                style={styles.hidden}
              />
            </Pressable>
          </Animated.View>
        </Rise>

        {message ? (
          <Text
            accessibilityLiveRegion={message.tone === "error" ? "assertive" : "polite"}
            style={[textStyle("label", 600), styles.center, { color: message.tone === "error" ? colors.error : colors.inkSoft }]}
          >
            {t(message.key)}
          </Text>
        ) : null}

        {phase === "finishFailed" || (phase === "offline" && code.length === CODE_LENGTH) ? (
          <ChunkyButton
            label={t("state.retry")}
            shadow={SCENE.lime}
            busy={verify.isPending}
            onPress={() => {
              if (phase === "finishFailed") return void runFinish();
              setPhase("checking");
              verify.mutate(code);
            }}
          />
        ) : (
          <Rise delay={290} style={styles.resendRow}>
            {wait > 0 ? (
              <Text style={[textStyle("label"), { color: colors.inkSoft }]}>{t("auth.code.resendIn", { seconds: wait })}</Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={resend.isPending}
                onPress={() => resend.mutate()}
                style={({ pressed }) => [styles.resend, { borderColor: colors.line, backgroundColor: pressed ? SCENE.lemon : colors.surface }]}
              >
                <Text style={[textStyle("label", 600), { color: colors.ink }]}>{t("auth.code.resend")}</Text>
              </Pressable>
            )}
          </Rise>
        )}

        <Rise delay={340}>
          <View style={[styles.tip, { borderColor: colors.line, backgroundColor: SCENE.lemon }]}>
            <Text style={[textStyle("caption"), styles.tipText, { color: INK }]}>{t("auth.code.spam")}</Text>
            {usingMocks ? <Text style={[textStyle("caption", 600), styles.tipText, { color: INK }]}>{t("auth.code.mockHint")}</Text> : null}
          </View>
        </Rise>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 15, lineHeight: 22 },
  sentTo: { gap: 4 },
  emailRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  email: { flexShrink: 1, fontSize: 16 },
  change: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  boxes: { flexDirection: "row", gap: 8, justifyContent: "center" },
  box: { flex: 1, maxWidth: 58, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  caret: { width: 3, height: 28, borderRadius: 2 },
  hidden: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.011, color: "transparent", fontSize: 16 },
  center: { textAlign: "center" },
  resendRow: { alignItems: "center" },
  resend: { borderWidth: 2.5, borderRadius: 999, paddingHorizontal: 18, minHeight: 44, justifyContent: "center" },
  tip: { borderWidth: 2.5, borderRadius: 18, padding: 14, gap: 4, transform: [{ rotate: "-1deg" }] },
  tipText: { textAlign: "center" },
});
