// Shared frame for onboarding steps: progress, title, body, content and a big bottom action (≥ 56 dp).
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Screen, Text } from "@/design-system/primitives";
import { space } from "@/design-system/tokens";
import { t, useLocale } from "@/i18n";

export const TOTAL_STEPS = 5;

export function StepScreen({
  step,
  title,
  body,
  children,
  actionLabel,
  onAction,
  actionDisabled,
  footer,
}: {
  step: number;
  title: string;
  body?: string;
  children?: ReactNode;
  actionLabel?: string;
  onAction: () => void;
  actionDisabled?: boolean;
  footer?: ReactNode;
}) {
  useLocale();
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.top}>
        {router.canGoBack() ? (
          <Button kind="quiet" label={t("onb.back")} onPress={() => router.back()} />
        ) : (
          <View />
        )}
        <Text variant="caption" muted accessibilityRole="text">
          {t("onb.step", { n: step, total: TOTAL_STEPS })}
        </Text>
      </View>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text muted>{body}</Text> : null}
      <View style={styles.content}>{children}</View>
      {footer}
      <Button label={actionLabel ?? t("onb.next")} size="cook" onPress={onAction} disabled={actionDisabled} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 48 },
  content: { gap: space.md },
});
