// Shared frame for onboarding steps: progress, title, body, content and a big bottom action (≥ 56 dp).
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Button, IconButton, Screen, Text } from "@/design-system/primitives";
import { space } from "@/design-system/tokens";
import { t, useLocale } from "@/i18n";

import { Dashes } from "./Dashes";

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
          <IconButton label={t("onb.back")} onPress={() => router.back()}>
            <Icon name="back" />
          </IconButton>
        ) : (
          <View style={styles.spacer} />
        )}
        <View accessible accessibilityLabel={t("onb.step", { n: step, total: TOTAL_STEPS })}>
          <Dashes count={TOTAL_STEPS} current={step - 1} />
        </View>
        <View style={styles.spacer} />
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
  spacer: { width: 48 },
});
