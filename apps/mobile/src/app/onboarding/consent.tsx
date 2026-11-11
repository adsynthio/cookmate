// ONB-05: consent per purpose (DPDP Act 2023). Nothing is pre-ticked; every purpose asked is recorded.
// This step also creates the household (create_household RPC) and lands on Home.
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { StyleSheet, Switch, View } from "react-native";

import { StepScreen } from "@/components/onboarding/StepScreen";
import { Button, Card, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import {
  buildMembers,
  consentRows,
  householdName,
  LANGUAGE_CODES,
  ONBOARDING_PURPOSES,
  POLICY_VERSION,
} from "@/domain/onboarding";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services } from "@/services";
import { track } from "@/services/analytics";
import { useOnboarding } from "@/state/onboarding";
import { useSession } from "@/state/session";

export default function ConsentScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const { members, spice, diet, consents, setConsent } = useOnboarding();
  const setHousehold = useSession((s) => s.setHousehold);
  // If the household was created but saving consents failed, a retry must not create a second household.
  const created = useRef<{ householdId: string; memberId: string } | null>(null);

  const finish = useMutation({
    mutationFn: async () => {
      if (!created.current) {
        created.current = await services.preference.createHousehold({
          name: householdName(members, t("onb.householdName")),
          language: LANGUAGE_CODES[getLocale()],
          members: buildMembers(members, spice, diet),
        });
      }
      const { householdId, memberId } = created.current;
      await services.preference.recordConsents({
        householdId,
        memberId,
        policyVersion: POLICY_VERSION,
        consents: consentRows(consents),
      });
      return created.current;
    },
    onSuccess: ({ householdId, memberId }) => {
      setHousehold(householdId, memberId);
      track("onboarding_completed", { members_count: members.length, language: LANGUAGE_CODES[getLocale()], voice_consent: !!consents.voice_processing });
      router.replace("/");
    },
  });

  const allowAll = () => ONBOARDING_PURPOSES.forEach((p) => setConsent(p, true));

  return (
    <StepScreen
      step={5}
      title={t("onb.consent.title")}
      body={t("onb.consent.body")}
      actionLabel={finish.isPending ? t("onb.consent.creating") : t("onb.consent.start")}
      actionDisabled={finish.isPending}
      onAction={() => finish.mutate()}
      footer={
        finish.isError ? (
          <Text color={colors.limeText} accessibilityLiveRegion="assertive">
            {t("onb.error.create")}
          </Text>
        ) : null
      }
    >
      {ONBOARDING_PURPOSES.map((p) => {
        const title = t(`consent.${p}.title` as StringKey);
        return (
          <Card key={p}>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: space.xs }}>
                <Text variant="heading">{title}</Text>
                <Text muted>{t(`consent.${p}.body` as StringKey)}</Text>
              </View>
              <Switch
                accessibilityLabel={title}
                value={consents[p] === true}
                onValueChange={(v) => setConsent(p, v)}
                trackColor={{ true: colors.lime, false: colors.line }}
              />
            </View>
          </Card>
        );
      })}
      <Button kind="secondary" label={t("onb.consent.allowAll")} onPress={allowAll} />
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
});
