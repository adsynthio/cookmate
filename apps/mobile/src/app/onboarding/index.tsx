// ONB-01 / KIT-020: start without email or password. "Try now" creates an anonymous account.
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button, Screen, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space, touch } from "@/design-system/tokens";
import { t, useLocale } from "@/i18n";
import { services } from "@/services";

export default function WelcomeScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const start = useMutation({
    mutationFn: () => services.auth.ensureSignedIn(),
    onSuccess: () => router.push("/onboarding/language"),
  });

  return (
    <Screen scroll={false}>
      <View style={styles.hero}>
        <View style={[styles.mark, { backgroundColor: colors.tintHaldi }]} />
        <Text variant="display" accessibilityRole="header">
          Cookmate
        </Text>
        <Text variant="title">{t("onb.welcome.title")}</Text>
        <Text muted>{t("onb.welcome.body")}</Text>
      </View>
      {start.isError ? (
        <Text color={colors.primaryText} accessibilityLiveRegion="assertive">
          {t("onb.welcome.error")}
        </Text>
      ) : null}
      <Button
        label={start.isPending ? "…" : t("onb.welcome.try")}
        size="cook"
        disabled={start.isPending}
        onPress={() => start.mutate()}
      />
      <Text variant="caption" muted style={{ textAlign: "center" }}>
        {t("onb.welcome.note")}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, justifyContent: "center", gap: space.md },
  mark: { width: touch.cook * 2, height: touch.cook * 2, borderRadius: touch.cook },
});
