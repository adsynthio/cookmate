// Frame for onboarding steps, from the Stitch setup and taste screens: back arrow, wordmark, a section chip and
// Skip on top; "Step n of 4" with a progress bar that glides forward; a terracotta overline, title and body; the
// content eases in; one big terracotta action pinned at the bottom (≥ 56 dp) with an optional quiet link under it.
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/design-system/icons";
import { Enter, ProgressBar } from "@/design-system/motion";
import { Button, IconButton, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { t, useLocale } from "@/i18n";

export const TOTAL_STEPS = 4;

export function StepScreen({
  step,
  chip,
  overline,
  title,
  body,
  children,
  actionLabel,
  actionIcon = "forward",
  onAction,
  actionDisabled,
  secondaryLabel,
  onSecondary,
  onSkip,
  footer,
}: {
  /** 1 to 4; 5 is the last (privacy) step, shown as "Last step" with a full bar. */
  step: number;
  chip: string;
  overline?: string;
  title: string;
  body?: string;
  children?: ReactNode;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction: () => void;
  actionDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onSkip?: () => void;
  /** Shown just above the action (errors, a "ready" line). */
  footer?: ReactNode;
}) {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const last = step > TOTAL_STEPS;
  const stepLabel = last ? t("onb.lastStep") : t("onb.stepUpper", { n: step, total: TOTAL_STEPS });

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.screen, { backgroundColor: colors.canvas }]}>
      <View style={styles.top}>
        {router.canGoBack() ? (
          <IconButton label={t("onb.back")} tone="plain" onPress={() => router.back()}>
            <Icon name="back" />
          </IconButton>
        ) : (
          <View style={styles.spacer} />
        )}
        <Text variant="wordmark">Cookmate</Text>
        <View style={[styles.chip, { backgroundColor: colors.surfaceHigh }]}>
          <Text variant="caption" weight={500} muted numberOfLines={1}>
            {chip}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        {onSkip ? (
          <Button kind="quiet" size="small" label={t("onb.skip")} onPress={onSkip} />
        ) : null}
      </View>

      <View style={styles.progress} accessible accessibilityLabel={last ? stepLabel : t("onb.step", { n: step, total: TOTAL_STEPS })}>
        <View style={styles.progressRow}>
          <Text variant="overline" color={colors.accentText} style={styles.upper}>
            {stepLabel}
          </Text>
          <Text variant="caption" weight={600} color={colors.primaryText}>
            {chip}
          </Text>
        </View>
        <ProgressBar value={last ? 1 : step / TOTAL_STEPS} color={colors.primary} track={colors.line} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Enter style={styles.heading}>
          {overline ? (
            <Text variant="bodyStrong" color={colors.accentText}>
              {overline}
            </Text>
          ) : null}
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {body ? <Text muted>{body}</Text> : null}
        </Enter>
        {children}
      </ScrollView>

      <View style={[styles.bottom, { backgroundColor: colors.canvas, borderTopColor: colors.line }]}>
        {footer}
        <Button
          kind="accent"
          size="cook"
          stretch
          label={actionLabel ?? t("onb.next")}
          iconAfter={actionIcon}
          onPress={onAction}
          disabled={actionDisabled}
        />
        {secondaryLabel && onSecondary ? <Button kind="quiet" size="small" label={secondaryLabel} onPress={onSecondary} /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, minHeight: 56 },
  spacer: { width: 44 },
  chip: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4, flexShrink: 1 },
  progress: { paddingHorizontal: space.gutter, gap: space.sm, paddingBottom: space.sm },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  upper: { textTransform: "uppercase" },
  content: { paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: space.xxl, gap: space.xl },
  heading: { gap: space.sm },
  bottom: {
    paddingHorizontal: space.gutter,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.xs,
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
