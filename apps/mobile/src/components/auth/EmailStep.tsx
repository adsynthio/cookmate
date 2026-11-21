// Step 1 of signing up, logging in, or saving an anonymous kitchen: the email. Sends a 6-digit code and moves on to
// the code step. Signing up and logging in are the same call (a new email gets a new account), so the two only differ
// in their words; "link" adds the email to the account already on this phone.
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";

import { textStyle } from "@/design-system/primitives";
import { cleanEmail } from "@/domain/emailAuth";
import { t, useLocale, type StringKey } from "@/i18n";
import { services } from "@/services";

import { BackButton, ChunkyButton, Display, AuthHero, type Sticker } from "./AuthKit";
import { Rise } from "./AuthMotion";
import { AuthScreen } from "./AuthScreen";
import { SCENE, useAuthLook } from "./look";

export type AuthMode = "signup" | "login" | "link";

/** The privacy policy, when this build has one to link to (the web build sets it once /legal is published). */
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL || null;

const STICKERS: Sticker[] = [
  { kind: "watermelon", x: 0.8, y: 0.5, size: 104, tilt: -12 },
  { kind: "lemon", x: 0.58, y: 0.22, size: 58, tilt: 10 },
  { kind: "leaf", x: 0.95, y: 0.16, size: 50, tilt: 30 },
  { kind: "chilli", x: 0.5, y: 0.8, size: 62, tilt: -30 },
];

const TITLE: Record<AuthMode, StringKey> = { signup: "auth.email.signup.title", login: "auth.email.login.title", link: "auth.email.link.title" };
const BODY: Record<AuthMode, StringKey> = { signup: "auth.email.signup.body", login: "auth.email.login.body", link: "auth.email.link.body" };
const PROBLEM: Record<"invalid" | "not_allowed" | "rate_limited" | "taken", StringKey> = {
  invalid: "auth.email.err.invalid",
  not_allowed: "auth.email.err.notAllowed",
  rate_limited: "auth.email.err.busy",
  taken: "auth.email.err.taken",
};

export function EmailStep({ mode }: { mode: AuthMode }) {
  useLocale();
  const router = useRouter();
  const { colors } = useAuthLook();
  const { height } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<StringKey | null>(null);
  const heroH = Math.round(Math.min(210, Math.max(150, height * 0.22)));

  const send = useMutation({
    mutationFn: (address: string) => services.auth.sendEmailCode(address, mode === "link" ? "link" : "signin"),
    onSuccess: (result, address) => {
      if (result !== "sent") return setProblem(PROBLEM[result]);
      setProblem(null);
      router.push({
        pathname: mode === "link" ? "/account/code" : "/onboarding/code",
        params: { email: address, mode, sentAt: String(Date.now()) },
      });
    },
    onError: () => setProblem("auth.email.err.other"),
  });
  const submit = () => {
    const address = cleanEmail(email);
    if (!address) return setProblem("auth.email.err.invalid");
    if (!send.isPending) send.mutate(address);
  };

  return (
    <AuthScreen heroHeight={heroH}>
      <AuthHero color={SCENE.melon} height={heroH} stickers={STICKERS} stickerDelay={60}>
        <View style={styles.bar}>
          <BackButton onPress={() => router.back()} />
        </View>
      </AuthHero>
      <View style={styles.body}>
        <Rise delay={80}>
          <Display size={32} color={colors.ink} accessibilityRole="header">
            {t(TITLE[mode])}
          </Display>
        </Rise>
        <Rise delay={150}>
          <Text style={[textStyle("body"), styles.lead, { color: colors.inkSoft }]}>{t(BODY[mode])}</Text>
        </Rise>
        <Rise delay={220} style={styles.field}>
          <TextInput
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (problem) setProblem(null);
            }}
            onSubmitEditing={submit}
            placeholder={t("auth.email.placeholder")}
            placeholderTextColor={colors.inkSoft + "99"}
            accessibilityLabel={t("auth.email.label")}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            textContentType="emailAddress"
            returnKeyType="send"
            enterKeyHint="send"
            maxLength={254}
            style={[
              textStyle("bodyStrong"),
              styles.input,
              { color: colors.ink, backgroundColor: colors.surface, borderColor: problem ? colors.error : colors.line },
            ]}
          />
          {problem ? (
            <Text accessibilityLiveRegion="assertive" style={[textStyle("label"), { color: colors.error }]}>
              {t(problem)}
            </Text>
          ) : null}
        </Rise>
        <Rise delay={290}>
          <ChunkyButton
            label={send.isPending ? t("auth.email.sending") : t("auth.email.send")}
            busy={send.isPending}
            disabled={email.trim().length === 0}
            shadow={SCENE.mango}
            onPress={submit}
          />
        </Rise>
        {PRIVACY_URL ? (
          <Rise delay={360}>
            <Text style={[textStyle("caption"), styles.small, { color: colors.inkSoft }]}>
              {t("auth.email.privacy")}{" "}
              <Text accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_URL)} style={[styles.link, { color: colors.ink }]}>
                {t("auth.email.privacyLink")}
              </Text>
            </Text>
          </Rise>
        ) : null}
      </View>
    </AuthScreen>
  );
}

export const authStyles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8 },
  body: { paddingHorizontal: 24, paddingTop: 34, gap: 16 },
});

const styles = StyleSheet.create({
  ...authStyles,
  lead: { fontSize: 15, lineHeight: 22 },
  field: { gap: 8 },
  input: { minHeight: 60, borderWidth: 2.5, borderRadius: 18, paddingHorizontal: 18, fontSize: 17 },
  small: { textAlign: "center", marginTop: 4 },
  link: { textDecorationLine: "underline", fontWeight: "600" },
});
