// ONB-03 / KIT-023: who eats here (up to 6 people, each with an age group for family plates) and the home's food
// rules, in the Stitch onboarding style. Per-person diets can be changed later on the You tab.
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { StepScreen } from "@/components/onboarding/StepScreen";
import { Icon } from "@/design-system/icons";
import { Enter, Layout, PressableScale } from "@/design-system/motion";
import { Button, Card, Chip, Field, IconButton, SectionHeader, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { checkMembers, MAX_MEMBERS, MAX_NAME_LENGTH, type AgeGroup, type Diet } from "@/domain/onboarding";
import { t, useLocale, type StringKey } from "@/i18n";
import { useOnboarding } from "@/state/onboarding";

const AGE_GROUPS: AgeGroup[] = ["adult", "child", "teen", "elder"];
const DIETS: Diet[] = ["veg", "eggetarian", "nonveg", "jain", "vegan"];

export default function FamilyScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const { members, diet, setName, setAgeGroup, addMember, removeMember, setDiet } = useOnboarding();
  const [tried, setTried] = useState(false);
  const problem = checkMembers(members);

  const next = () => {
    setTried(true);
    if (problem === "none") router.push("/onboarding/kitchen");
  };

  return (
    <StepScreen
      step={2}
      chip={t("onb.chip.family")}
      overline={t("onb.f.overline")}
      title={t("onb.f.title")}
      body={t("onb.f.body")}
      onAction={next}
      footer={
        tried && problem !== "none" ? (
          <Text color={colors.alert} accessibilityLiveRegion="assertive" style={{ textAlign: "center" }}>
            {t(`onb.members.error.${problem}` as StringKey)}
          </Text>
        ) : null
      }
    >
      <View style={{ gap: space.md }}>
        {members.map((m, i) => {
          const label = m.isSelf ? t("onb.members.yourName") : t("onb.members.name");
          return (
            <Layout key={m.key}>
              <Enter index={i}>
                <Card>
                  <View style={styles.head}>
                    <View style={[styles.avatar, { backgroundColor: m.isSelf ? colors.primarySoft : colors.peach }]}>
                      <Text variant="bodyStrong" color={m.isSelf ? colors.primaryText : colors.peachText}>
                        {(m.displayName.trim()[0] ?? "?").toUpperCase()}
                      </Text>
                    </View>
                    <Text variant="overline" muted style={styles.upper}>
                      {m.isSelf ? t("onb.members.you") : t("onb.members.name")}
                    </Text>
                    <View style={{ flex: 1 }} />
                    {m.isSelf ? null : (
                      <IconButton
                        label={t("onb.members.remove", { name: m.displayName.trim() || t("onb.members.name") })}
                        muted
                        size={36}
                        onPress={() => removeMember(m.key)}
                      >
                        <Icon name="close" size={18} />
                      </IconButton>
                    )}
                  </View>
                  <Field
                    value={m.displayName}
                    onChangeText={(v) => setName(m.key, v)}
                    placeholder={label}
                    accessibilityLabel={label}
                    maxLength={MAX_NAME_LENGTH}
                    autoCapitalize="words"
                    returnKeyType="done"
                    variant="bodyStrong"
                  />
                  <View style={styles.chips} accessibilityRole="radiogroup">
                    {AGE_GROUPS.map((a) => (
                      <Chip key={a} label={t(`age.${a}` as StringKey)} selected={m.ageGroup === a} onPress={() => setAgeGroup(m.key, a)} />
                    ))}
                  </View>
                </Card>
              </Enter>
            </Layout>
          );
        })}
        {members.length < MAX_MEMBERS ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t("onb.members.add")}
            onPress={addMember}
            style={[styles.addPerson, { borderColor: colors.primary }]}
          >
            <Icon name="plus" size={20} color={colors.primaryText} />
            <Text variant="label" weight={600} color={colors.primaryText}>
              {t("onb.members.add")}
            </Text>
          </PressableScale>
        ) : null}
      </View>

      <View style={{ gap: space.md }}>
        <SectionHeader title={t("onb.f.diet")} note={t("onb.f.dietNote")} />
        <View style={styles.diets} accessibilityRole="radiogroup">
          {DIETS.map((d, i) => {
            const on = diet === d;
            return (
              <Enter key={d} index={i}>
                <PressableScale
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${t(`diet.${d}` as StringKey)}, ${t(`onb.f.diet.${d}` as StringKey)}`}
                  onPress={() => setDiet(d)}
                  style={[
                    styles.diet,
                    on ? null : shadow.card,
                    { backgroundColor: on ? colors.primarySoft : colors.surface, borderColor: on ? colors.primary : "transparent" },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="subheading">{t(`diet.${d}` as StringKey)}</Text>
                    <Text variant="caption" muted>
                      {t(`onb.f.diet.${d}` as StringKey)}
                    </Text>
                  </View>
                  <View style={[styles.radio, { borderColor: on ? colors.primary : colors.line, backgroundColor: on ? colors.primary : "transparent" }]}>
                    {on ? <Icon name="check" size={16} color={colors.onPrimary} /> : null}
                  </View>
                </PressableScale>
              </Enter>
            );
          })}
        </View>
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  upper: { textTransform: "uppercase" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  addPerson: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  diets: { gap: space.sm },
  diet: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.card, padding: space.lg, borderWidth: 1.5 },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
