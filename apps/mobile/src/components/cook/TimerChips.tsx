// Every running timer for this cooking session, visible on any step (KIT-071). The clock is read-only; stopping a
// timer is its own round button so a floury thumb on the clock doesn't cancel it.
import { Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space, touch } from "@/design-system/tokens";
import { clock, remaining } from "@/domain/cooking";
import { t } from "@/i18n";
import type { RunningTimer } from "@/state/timers";

export function TimerChips({ timers, now, onStop }: { timers: RunningTimer[]; now: number; onStop: (id: string) => void }) {
  const { colors } = useTheme();
  if (!timers.length) return null;
  return (
    <View style={styles.row}>
      {timers.map((x) => {
        const left = remaining(x, now);
        const done = left === 0;
        return (
          <View
            key={x.id}
            style={[styles.chip, { backgroundColor: done ? colors.primary : colors.surface }]}
            accessible
            accessibilityRole="timer"
            accessibilityLiveRegion={done ? "assertive" : "none"}
            accessibilityLabel={done ? t("cook.timer.doneTitle", { label: x.label }) : t("cook.timer.left", { label: x.label, time: clock(left) })}
          >
            <Icon name="clock" size={18} color={done ? colors.onPrimary : colors.inkSecondary} />
            <Text variant="label" color={done ? colors.onPrimary : colors.inkSecondary}>
              {x.label}
            </Text>
            <Text variant="bodyStrong" color={done ? colors.onPrimary : colors.ink} style={styles.clock}>
              {done ? t("cook.timer.done") : clock(left)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("cook.timer.cancel", { label: x.label })}
              onPress={() => onStop(x.id)}
              hitSlop={8}
              style={({ pressed }) => [styles.stop, { backgroundColor: done ? colors.primarySoft : colors.surfaceMuted, opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="close" size={16} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: touch.min,
    borderRadius: radius.pill,
    paddingLeft: space.lg,
    paddingRight: space.sm,
  },
  clock: { fontVariant: ["tabular-nums"], minWidth: 48 },
  stop: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
