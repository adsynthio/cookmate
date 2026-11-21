// ONB-05: consent per purpose (DPDP Act 2023). Nothing is pre-ticked; every purpose asked is recorded.
// This step creates the household (create_household, with each member's taste), then adds what was chosen on the
// kitchen step and remembers dislikes and allergies, and lands on Home. If the extras fail, the household still
// opens: they are a head start, not a requirement. Photos taken on the kitchen step are read here, now that the
// kitchen exists, and what they show opens on the check screen (pantry/add) before anything is added.
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";

import { StepScreen } from "@/components/onboarding/StepScreen";
import { catalogEntry } from "@/data/catalog";
import { Icon, type IconName } from "@/design-system/icons";
import { Enter } from "@/design-system/motion";
import { Button, Card, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { mergeTray } from "@/domain/scanTray";
import type { ToolKey } from "@/domain/tools";
import {
  avoidStatement,
  buildMembers,
  consentRows,
  householdName,
  languageCodeFor,
  ONBOARDING_PURPOSES,
  POLICY_VERSION,
  type ConsentPurpose,
} from "@/domain/onboarding";
import { getAppLocale, getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services, type DraftItem } from "@/services";
import { track } from "@/services/analytics";
import { useOnboarding } from "@/state/onboarding";
import { useScan } from "@/state/scan";
import { useSession } from "@/state/session";

const ICONS: Record<ConsentPurpose, IconName> = { voice_processing: "mic", memory: "heart", analytics: "list" };

export default function ConsentScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const { members, spice, diet, consents, setConsent, kitchen, cuisines, pace, avoid, tools, photos, clearPhotos } = useOnboarding();
  const setHousehold = useSession((s) => s.setHousehold);
  // If the household was created but a later call failed, a retry must not create a second household.
  const created = useRef<{ householdId: string; memberId: string } | null>(null);
  const extrasDone = useRef(false);
  // Read once: a retry after a later failure doesn't pay for the photos again.
  const photosRead = useRef<{ items: DraftItem[]; appliances: ToolKey[] } | null>(null);
  const [reading, setReading] = useState(false);

  const finish = useMutation({
    mutationFn: async () => {
      if (!created.current) {
        created.current = await services.preference.createHousehold({
          name: householdName(members, t("onb.householdName")),
          language: languageCodeFor(getAppLocale()),
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
      if (photos.length && !photosRead.current) {
        setReading(true);
        let items: DraftItem[] = [];
        let appliances: ToolKey[] = [];
        for (const image of photos) {
          try {
            const r = await services.kitchen.scanItems({ householdId, kind: "photo", image, mediaType: "image/jpeg" });
            items = mergeTray(items, r.items);
            if (r.appliances?.length) appliances = [...new Set([...appliances, ...r.appliances])];
          } catch (e) {
            // A photo that can't be read is skipped: the kitchen still opens, and Scan is on the Kitchen tab.
            console.warn("onboarding: a kitchen photo wasn't read", e);
          }
        }
        photosRead.current = { items, appliances };
      }
      return { ...created.current, found: photosRead.current };
    },
    onSettled: () => setReading(false),
    onSuccess: ({ householdId, memberId, found }) => {
      setHousehold(householdId, memberId);
      clearPhotos();
      track("onboarding_completed", { members_count: members.length, language: languageCodeFor(getAppLocale()), voice_consent: !!consents.voice_processing });
      if (found?.items.length) {
        // What the photos show, to check before it's added; the check screen goes Home after.
        useScan.getState().hand(found.items, "camera", found.appliances);
        router.replace("/pantry/add");
      } else {
        router.replace("/");
      }
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
      actionLabel={finish.isPending ? (reading ? t("onb.consent.reading") : t("onb.consent.creating")) : t("onb.c.open")}
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
