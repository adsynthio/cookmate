// ONB-01 / KIT-020: start without email or password. "Try now" creates an anonymous account.
// Layout follows the brand kit's onboarding screen: the wordmark, a display headline with one lime disc,
// produce cut-outs piled along the bottom edge, and the start pill floating over them.
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { StartPill } from "@/components/onboarding/StartPill";
import { Icon } from "@/design-system/icons";
import { onboarding } from "@/design-system/media";
import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { t, useLocale } from "@/i18n";
import { services } from "@/services";

export default function WelcomeScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  // The pile is drawn wider than the screen so it bleeds off both sides, as in the brand kit.
  const pileWidth = useWindowDimensions().width * 1.5;
  const start = useMutation({
    mutationFn: () => services.auth.ensureSignedIn(),
    onSuccess: () => router.push("/onboarding/language"),
  });

  // The disc sits before the last word, like a word of its own: "Your kitchen, ● decided."
  const title = t("onb.welcome.title");
  const cut = title.lastIndexOf(" ");
  const [lead, last] = cut > 0 ? [title.slice(0, cut + 1), title.slice(cut + 1)] : ["", title];

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.screen, { backgroundColor: colors.canvas }]}>
      {onboarding.producePile ? (
        <Image
          source={onboarding.producePile}
          style={[styles.pile, { width: pileWidth, height: (pileWidth * 840) / 1179, left: -pileWidth / 6 }]}
          resizeMode="contain"
          accessible={false}
        />
      ) : null}
      {onboarding.leafPalak ? (
        <Image source={onboarding.leafPalak} style={[styles.leaf, { top: 24, right: 24, transform: [{ rotate: "-20deg" }] }]} accessible={false} />
      ) : null}
      {onboarding.leafCoriander ? (
        <Image source={onboarding.leafCoriander} style={[styles.leaf, { top: 330, left: -12 }]} accessible={false} />
      ) : null}

      <View style={styles.top}>
        <Text variant="wordmark">Cookmate</Text>
      </View>

      <View style={styles.copy}>
        <Text variant="display" accessibilityRole="header" accessibilityLabel={title}>
          {lead}
          <View style={[styles.disc, { backgroundColor: colors.primary }]}>
            <Icon name="cook" size={22} color={colors.onPrimary} />
          </View>{" "}
          {last}
        </Text>
        <Text muted>{t("onb.welcome.body")}</Text>
      </View>

      <View style={styles.bottom}>
        {start.isError ? (
          <Text color={colors.alert} accessibilityLiveRegion="assertive" style={{ textAlign: "center" }}>
            {t("onb.welcome.error")}
          </Text>
        ) : null}
        <StartPill label={t("onb.welcome.try")} busy={start.isPending} onPress={() => start.mutate()} />
        <Text variant="caption" muted style={{ textAlign: "center" }}>
          {t("onb.welcome.note")}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.gutter },
  top: { paddingTop: space.lg },
  copy: { gap: space.lg, paddingTop: space.xxl },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", transform: [{ translateY: 4 }] },
  bottom: { marginTop: "auto", gap: space.md, paddingBottom: space.lg },
  pile: { position: "absolute", bottom: 0 },
  leaf: { position: "absolute", width: 64, height: 64 },
});
