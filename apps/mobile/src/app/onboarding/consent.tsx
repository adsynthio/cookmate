// ONB-05: consent per purpose (DPDP Act 2023). Nothing is pre-ticked; every purpose asked is recorded.
// This step creates the household (create_household, with each member's taste), then adds what was chosen on the
// kitchen step and remembers dislikes and allergies, and lands on Home. If the extras fail, the household still
// opens: they are a head start, not a requirement.
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { StyleSheet, Switch, View } from "react-native";

import { StepScreen } from "@/components/onboarding/StepScreen";
import { catalogEntry } from "@/data/catalog";
import { Icon, type IconName } from "@/design-system/icons";
import { Enter } from "@/design-system/motion";
import { Button, Card, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import {
  avoidStatement,
  buildMembers,
  consentRows,
  householdName,
  LANGUAGE_CODES,
  ONBOARDING_PURPOSES,
  POLICY_VERSION,
  type ConsentPurpose,
} from "@/domain/onboarding";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services } from "@/services";
import { track } from "@/services/analytics";
import { useOnboarding } from "@/state/onboarding";
import { useSession } from "@/state/session";

const ICONS: Record<ConsentPurpose, IconName> = { voice_processing: "mic", memory: "heart", analytics: "list" };

export default function ConsentScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const { members, spice, diet, consents, setConsent, kitchen, cuisines, pace, avoid, tools } = useOnboarding();
  const setHousehold = useSession((s) => s.setHousehold);
  // If the household was created but a later call failed, a retry must not create a second household.
  const created = useRef<{ householdId: string; memberId: string } | null>(null);
  const extrasDone = useRef(false);

  const finish = useMutation({
    mutationFn: async () => {
      if (!created.current) {
        created.current = await services.preference.createHousehold({
          name: householdName(members, t("onb.householdName")),
          language: LANGUAGE_CODES[getLocale()],
          members: buildMembers(members, spice, diet, { cuisines, pace }),
        });
      }
      const { householdId, memberId } = created.current;
      await services.preference.recordConsents({
        householdId,
        memberId,
        policyVersion: POLICY_VERSION,
        consents: consentRows(consents),
      });
      if (!extrasDone.current) {
        extrasDone.current = true;
        const locale = getLocale();
        try {
          if (kitchen.length) {
            await services.kitchen.addItems({
              householdId,
              addedVia: "onboarding",
              items: kitchen.map((k, i) => ({
                key: `setup-${i}`,
                said: k.name,
                ingredientKey: k.known ? k.name : null,
                quantity: null,
                unit: null,
                locationKind: k.place,
                state: k.state ?? null,
                flavorRoles: [],
                confidence: 0.9,
              })),
            });
          }
          if (tools.length) await services.kitchen.setTools(householdId, tools);
          for (const a of avoid) {
            await services.preference.saveMemory({
              householdId,
              statement: avoidStatement(displayName(catalogEntry(a.ingredientKey), a.ingredientKey, locale), a.kind, locale),
              category: "ingredient",
              about: "preference",
              polarity: -1,
              ingredientKey: a.ingredientKey,
            });
          }
        } catch (e) {
          console.warn("onboarding: kitchen items or dislikes not saved", e);
        }
      }
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
      chip={t("onb.chip.privacy")}
      overline={t("onb.c.overline")}
      title={t("onb.consent.title")}
      body={t("onb.consent.body")}
      actionLabel={finish.isPending ? t("onb.consent.creating") : t("onb.c.open")}
      actionIcon="forward"
      actionDisabled={finish.isPending}
      onAction={() => finish.mutate()}
      footer={
        finish.isError ? (
          <Text color={colors.alert} accessibilityLiveRegion="assertive" style={{ textAlign: "center" }}>
            {t("onb.error.create")}
          </Text>
        ) : null
      }
    >
      {ONBOARDING_PURPOSES.map((p, i) => {
        const title = t(`consent.${p}.title` as StringKey);
        const on = consents[p] === true;
        return (
          <Enter key={p} index={i + 1}>
            <Card>
              <View style={styles.row}>
                <View style={[styles.well, { backgroundColor: on ? colors.primarySoft : colors.surfaceMuted }]}>
                  <Icon name={ICONS[p]} size={20} color={on ? colors.primaryText : colors.inkSecondary} />
                </View>
                <View style={{ flex: 1, gap: space.xs }}>
                  <Text variant="subheading">{title}</Text>
                  <Text variant="caption" muted>
                    {t(`consent.${p}.body` as StringKey)}
                  </Text>
                </View>
                <Switch
                  accessibilityLabel={title}
                  value={on}
                  onValueChange={(v) => setConsent(p, v)}
                  trackColor={{ true: colors.primary, false: colors.line }}
                  thumbColor={colors.surface}
                />
              </View>
            </Card>
          </Enter>
        );
      })}
      <Button kind="secondary" label={t("onb.consent.allowAll")} onPress={allowAll} />
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  well: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
