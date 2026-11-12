// Header from the Stitch screens: a small olive dot and the screen name on the left, the mic and your profile on the
// right. The mic is in this same place on every tab (VOICE-01). Pushed screens get a back arrow instead of the dot.
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Pulse } from "@/design-system/motion";
import { IconButton, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { t } from "@/i18n";
import { useSession } from "@/state/session";

export function AppHeader({
  title,
  back,
  right,
  mic = true,
  profile = true,
}: {
  title: string;
  /** Show a back arrow (pushed screens). */
  back?: boolean;
  /** Extra action before the mic (search, filter). */
  right?: ReactNode;
  mic?: boolean;
  profile?: boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const voice = useSession((s) => s.voice);
  const live = voice === "listening" || voice === "speaking" || voice === "thinking";
  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        {back ? (
          <IconButton label={t("common.back")} tone="plain" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
            <Icon name="back" />
          </IconButton>
        ) : (
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
        )}
        <Text variant="subheading" numberOfLines={1} accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      </View>
      <View style={styles.right}>
        {right}
        {mic ? (
          <IconButton label={t("mic.label")} tone={live ? "accent" : undefined} muted={!live} onPress={() => router.push("/voice")} size={40}>
            {live ? <Pulse color={colors.onAccent} size={8} /> : <Icon name="mic" size={20} color={colors.accentText} />}
          </IconButton>
        ) : null}
        {profile ? (
          <IconButton label={t("tab.you")} tone="primary" onPress={() => router.navigate("/you")} size={40}>
            <Icon name="you" size={20} color={colors.onPrimary} />
          </IconButton>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.gutter,
    minHeight: 60,
    gap: space.md,
  },
  left: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { flexShrink: 1 },
});
