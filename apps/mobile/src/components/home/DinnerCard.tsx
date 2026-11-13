// S3: "Dinner at 8 · 52 min left". From a little before the cook's reminder time until dinner, Home shows one dish
// for each time that still fits (about 20, 30 and 60 minutes), the same three the notification names. With nothing
// quick among tonight's picks, one tap shows dishes under 20 minutes.
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { PressableScale } from "@/design-system/motion";
import { Button, Photo, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { clock, minutesToDinner, pickByTime } from "@/domain/dinnerTime";
import { recipeTitle } from "@/domain/recipes";
import { getLocale, t } from "@/i18n";
import { services, type Pick } from "@/services";

import { pickPhoto } from "./HomeParts";

const left = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} hr` : t("home.dinner.in", { n: m }));

export function DinnerCard({
  householdId,
  picks,
  onOpen,
  onQuick,
  now = new Date(),
}: {
  householdId: string;
  picks: Pick[];
  onOpen: (recipeId: string) => void;
  onQuick: () => void;
  now?: Date;
}) {
  const { colors } = useTheme();
  const settings = useQuery({ queryKey: ["notifySettings", householdId], queryFn: () => services.preference.getNotificationSettings(householdId) });
  const s = settings.data;
  if (!s) return null;
  const minutes = minutesToDinner(s.dinnerTime, s.leadMinutes, now);
  if (minutes === null) return null;
  const options = pickByTime(picks, (p) => p.totalTimeMin, minutes);
  const locale = getLocale();
  return (
    <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]} accessibilityLabel={t("home.dinner.title", { time: clock(s.dinnerTime), left: left(minutes) })}>
      <View style={styles.head}>
        <Icon name="clock" size={20} color={colors.accentText} />
        <Text variant="subheading" style={{ flex: 1 }}>
          {t("home.dinner.title", { time: clock(s.dinnerTime), left: left(minutes) })}
        </Text>
      </View>
      <Text variant="caption" muted>
        {options.length ? t("home.dinner.body") : t("home.dinner.none")}
      </Text>
      {options.map(({ bucket, pick }) => (
        <PressableScale
          key={pick.recipeId}
          accessibilityRole="button"
          accessibilityLabel={`${bucket === 60 ? t("home.dinner.hour") : t("home.dinner.in", { n: bucket })}: ${recipeTitle(pick, locale)}`}
          onPress={() => onOpen(pick.recipeId)}
          style={[styles.option, { backgroundColor: colors.surfaceMuted }]}
        >
          <View style={[styles.time, { backgroundColor: colors.accentSoft }]}>
            <Text variant="label" weight={600} color={colors.accentText}>
              {bucket === 60 ? t("home.dinner.hour") : t("home.dinner.in", { n: bucket })}
            </Text>
          </View>
          <Photo source={pickPhoto(pick)} size={40} round />
          <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
            {recipeTitle(pick, locale)}
          </Text>
          <Icon name="arrowRight" size={18} color={colors.inkSecondary} />
        </PressableScale>
      ))}
      {!options.some((o) => o.bucket === 20) ? <Button kind="quiet" size="small" icon="timer" label={t("home.dinner.quick")} onPress={onQuick} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: space.gutter, gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  option: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.item, padding: space.sm },
  time: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 4, minWidth: 64, alignItems: "center" },
});
