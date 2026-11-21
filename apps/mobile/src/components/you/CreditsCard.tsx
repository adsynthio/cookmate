// AI credits on You (T1): what this kitchen has left, its free credits for today, and what things cost. At zero it
// says the AI is paused until midnight; the owner's and testers' kitchens just say "unlimited".
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Card, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { creditsLeft, showCredits } from "@/domain/credits";
import { t } from "@/i18n";
import { services } from "@/services";

export function CreditsCard({ householdId }: { householdId: string }) {
  const { colors } = useTheme();
  const credits = useQuery({ queryKey: ["credits", householdId], queryFn: () => services.assistant.credits(householdId) });
  // Scans and questions elsewhere spend credits: fresh numbers each time You is opened.
  const { refetch } = credits;
  useFocusEffect(useCallback(() => void refetch(), [refetch]));
  const c = credits.data;
  if (!c) return null;
  const paused = !c.allowed;
  return (
    <Card tint={paused ? colors.alertSoft : undefined}>
      <View style={styles.row}>
        <Icon name="sparkle" size={18} color={paused ? colors.alert : colors.primaryText} />
        <Text variant="overline" muted style={{ flex: 1 }}>
          {t("credits.title").toUpperCase()}
        </Text>
      </View>
      {c.unlimited ? (
        <Text variant="bodyStrong">{t("credits.unlimited")}</Text>
      ) : (
        <>
          <View
            style={styles.amount}
            accessible
            accessibilityLabel={`${showCredits(creditsLeft(c))} ${t("credits.leftLabel")}`}
          >
            <Text variant="display" color={paused ? colors.alert : colors.ink}>
              {showCredits(creditsLeft(c))}
            </Text>
            <Text variant="label" muted>
              {t("credits.leftLabel")}
            </Text>
          </View>
          {paused ? (
            <Text variant="bodyStrong" color={colors.alert} accessibilityLiveRegion="polite">
              {t("credits.pausedMeter")}
            </Text>
          ) : (
            <Text muted>{t("credits.today", { n: showCredits(c.dailyLeft) })}</Text>
          )}
          <Text muted>{t("credits.daily", { n: showCredits(c.dailyAllowance) })}</Text>
        </>
      )}
      <Text variant="caption" muted>
        {t("credits.how")}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  amount: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
});
