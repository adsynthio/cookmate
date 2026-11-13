// An empty or nearly empty kitchen: the quickest way to fill it is a few photos, so that leads. Big when there is
// nothing yet; a slim card on top when only a handful of things are in.
import { useRouter } from "expo-router";
import { Image, StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { scenes } from "@/design-system/media";
import { Enter, PressableScale } from "@/design-system/motion";
import { Button, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { t } from "@/i18n";

export function ScanFirst({ empty }: { empty: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const scan = () => router.push("/pantry/scan");

  if (!empty) {
    return (
      <Enter>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t("kitchen.scanFirst.more")}
          onPress={scan}
          style={[styles.slim, shadow.card, { backgroundColor: colors.accentSoft }]}
        >
          <View style={[styles.icon, { backgroundColor: colors.accent }]}>
            <Icon name="camera" size={22} color={colors.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{t("kitchen.scanFirst.more")}</Text>
            <Text variant="caption" muted>
              {t("kitchen.scanFirst.moreBody")}
            </Text>
          </View>
          <Icon name="forward" size={20} />
        </PressableScale>
      </Enter>
    );
  }

  return (
    <Enter>
      <View style={[styles.hero, shadow.card, { backgroundColor: colors.surface }]}>
        <View style={[styles.art, { backgroundColor: colors.primaryPale }]}>
          {scenes.fridgeOpen ? <Image source={scenes.fridgeOpen} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} /> : null}
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <Icon name="camera" size={28} color={colors.onAccent} />
          </View>
        </View>
        <Text variant="title" accessibilityRole="header" style={styles.center}>
          {t("kitchen.scanFirst.title")}
        </Text>
        <Text muted style={styles.center}>
          {t("kitchen.scanFirst.body")}
        </Text>
        <Button kind="accent" size="cook" stretch icon="camera" label={t("kitchen.scanFirst.go")} onPress={scan} />
        <Button kind="quiet" stretch icon="edit" label={t("kitchen.scanFirst.type")} onPress={() => router.push("/pantry/add")} />
      </View>
    </Enter>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.cardLg, padding: space.gutter, gap: space.md, alignItems: "stretch" },
  art: { height: 180, borderRadius: radius.card, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  slim: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.card, padding: space.lg },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
