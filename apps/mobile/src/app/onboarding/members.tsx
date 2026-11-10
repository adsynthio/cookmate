// ONB-03 / KIT-023 step 1 of 3: who eats here (up to 6 people, each with an age group for family plates).
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { StepScreen } from "@/components/onboarding/StepScreen";
import { Button, Card, Chip, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space, touch, type as typeScale } from "@/design-system/tokens";
import { checkMembers, MAX_MEMBERS, MAX_NAME_LENGTH, type AgeGroup } from "@/domain/onboarding";
import { t, useLocale, type StringKey } from "@/i18n";
import { useOnboarding } from "@/state/onboarding";

const AGE_GROUPS: AgeGroup[] = ["adult", "child", "teen", "elder"];

export default function MembersScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const { members, setName, setAgeGroup, addMember, removeMember } = useOnboarding();
  const [tried, setTried] = useState(false);
  const problem = checkMembers(members);

  const next = () => {
    setTried(true);
    if (problem === "none") router.push("/onboarding/spice");
  };

  return (
    <StepScreen
      step={2}
      title={t("onb.members.title")}
      body={t("onb.members.body")}
      onAction={next}
      footer={
        tried && problem !== "none" ? (
          <Text color={colors.primaryText} accessibilityLiveRegion="assertive">
            {t(`onb.members.error.${problem}` as StringKey)}
          </Text>
        ) : null
      }
    >
      {members.map((m) => (
        <Card key={m.key}>
          <View style={styles.labelRow}>
            <Text variant="label" muted>
              {m.isSelf ? t("onb.members.you") : t("onb.members.name")}
            </Text>
            {m.isSelf ? null : (
              <Button
                kind="quiet"
                label={t("onb.members.remove", { name: m.displayName.trim() || t("onb.members.name") })}
                onPress={() => removeMember(m.key)}
              />
            )}
          </View>
          <TextInput
            value={m.displayName}
            onChangeText={(v) => setName(m.key, v)}
            placeholder={m.isSelf ? t("onb.members.yourName") : t("onb.members.name")}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={m.isSelf ? t("onb.members.yourName") : t("onb.members.name")}
            maxLength={MAX_NAME_LENGTH}
            autoCapitalize="words"
            returnKeyType="done"
            style={[styles.input, typeScale.heading, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border }]}
          />
          <View style={styles.chips} accessibilityRole="radiogroup">
            {AGE_GROUPS.map((a) => (
              <Chip key={a} label={t(`age.${a}` as StringKey)} selected={m.ageGroup === a} onPress={() => setAgeGroup(m.key, a)} />
            ))}
          </View>
        </Card>
      ))}
      {members.length < MAX_MEMBERS ? <Button kind="secondary" label={`+ ${t("onb.members.add")}`} onPress={addMember} /> : null}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: touch.min },
  input: { minHeight: touch.cook, borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
