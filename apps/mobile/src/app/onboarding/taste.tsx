// KIT-023 taste, from the Stitch "Now tell me what you love" screen: how spicy (five steps, the chosen one in a white
// pill that slides across), favourite regional food, how much time there is on weekdays, and dislikes and allergies
// (left out of every dish). Spice, cuisines and time go into each member's taste profile; dislikes and allergies
// become "avoid" memories once the household exists.
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { StepScreen } from "@/components/onboarding/StepScreen";
import { catalogEntry } from "@/data/catalog";
import { Icon, type IconName } from "@/design-system/icons";
import { Animated, Enter, Layout, PressableScale, useReducedMotion } from "@/design-system/motion";
import { Badge, Button, Card, Chip, Field, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { motion, radius, shadow, space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { CUISINES, type AvoidKind, type Pace, type Spice } from "@/domain/onboarding";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { findIngredients } from "@/services/picks";
import { useOnboarding } from "@/state/onboarding";

const LEVELS: Spice[] = [1, 2, 3, 4, 5];
const PACES: { key: Pace; icon: IconName }[] = [
  { key: "quick", icon: "timer" },
  { key: "relaxed", icon: "skillet" },
];

export default function TasteScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const { spice, setSpice, cuisines, toggleCuisine, pace, setPace, avoid, addAvoid, removeAvoid } = useOnboarding();
  const [word, setWord] = useState("");
  const [unknown, setUnknown] = useState(false);

  const add = (kind: AvoidKind) => {
    const [key] = findIngredients(word);
    if (!key) {
      setUnknown(true);
      return;
    }
    addAvoid({ ingredientKey: key, kind });
    setWord("");
    setUnknown(false);
  };

  return (
    <StepScreen
      step={4}
      chip={t("onb.chip.taste")}
      overline={t("onb.t.overline")}
      title={t("onb.t.title")}
      body={t("onb.t.body")}
      onSkip={() => router.push("/onboarding/consent")}
      actionLabel={t("onb.t.next")}
      onAction={() => router.push("/onboarding/consent")}
      footer={
        <View style={styles.ready}>
          <Icon name="checkCircle" size={18} color={colors.primaryText} />
          <Text variant="caption" weight={600} color={colors.primaryText}>
            {t("onb.t.ready")}
          </Text>
        </View>
      }
    >
      <Enter index={1}>
        <Card>
          <View style={styles.cardHead}>
            <View style={[styles.well, { backgroundColor: colors.accentSoft }]}>
              <Icon name="flame" size={20} color={colors.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="subheading">{t("onb.t.spice")}</Text>
              <Text variant="caption" muted>
                {t("onb.t.spiceNote")}
              </Text>
            </View>
            <Badge label={t(`onb.t.spice.${spice}` as StringKey)} tone="accent" icon="flame" />
          </View>
          <SpiceSlider value={spice} onChange={setSpice} />
          <Text variant="caption" muted style={styles.say}>
            “{t(`onb.t.spiceSay.${spice}` as StringKey)}”
          </Text>
        </Card>
      </Enter>

      <Enter index={2}>
        <Card>
          <View style={styles.cardHead}>
            <View style={{ flex: 1 }}>
              <Text variant="subheading">{t("onb.t.cuisines")}</Text>
              <Text variant="caption" muted>
                {t("onb.t.cuisinesBody")}
              </Text>
            </View>
            {cuisines.length ? (
              <Text variant="caption" weight={600} color={colors.primaryText}>
                {t("onb.t.chosen", { n: cuisines.length })}
              </Text>
            ) : null}
          </View>
          <View style={styles.wrap}>
            {CUISINES.map((c) => (
              <Chip
                key={c}
                label={t(`cuisine.${c}` as StringKey)}
                selected={cuisines.includes(c)}
                showCheck
                icon={cuisines.includes(c) ? undefined : "plus"}
                onPress={() => toggleCuisine(c)}
              />
            ))}
          </View>
        </Card>
      </Enter>

      <View style={{ gap: space.md }}>
        <View>
          <Text variant="subheading">{t("onb.t.pace")}</Text>
          <Text variant="caption" muted>
            {t("onb.t.paceBody")}
          </Text>
        </View>
        {PACES.map((p, i) => {
          const on = pace === p.key;
          return (
            <Enter key={p.key} index={i + 3}>
              <PressableScale
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t(`onb.t.pace.${p.key}` as StringKey)}
                onPress={() => setPace(p.key)}
                style={[styles.pace, on ? null : shadow.card, { backgroundColor: on ? colors.primarySoft : colors.surface, borderColor: on ? colors.primary : "transparent" }]}
              >
                <View style={[styles.well, { backgroundColor: on ? colors.surface : colors.primaryPale }]}>
                  <Icon name={p.icon} size={22} color={colors.primaryText} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.paceTitle}>
                    <Text variant="subheading">{t(`onb.t.pace.${p.key}` as StringKey)}</Text>
                    <Badge label={t(`onb.t.pace.${p.key}Badge` as StringKey)} tone={p.key === "quick" ? "primary" : "muted"} />
                  </View>
                  <Text variant="caption" muted>
                    {t(`onb.t.pace.${p.key}Body` as StringKey)}
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

      <Enter index={5}>
        <Card>
          <View style={styles.cardHead}>
            <Icon name="shield" size={20} color={colors.alert} />
            <Text variant="subheading" style={{ flex: 1 }}>
              {t("onb.t.avoid")}
            </Text>
            <Text variant="overline" color={colors.alert} style={styles.upper}>
              {t("onb.t.avoidBadge")}
            </Text>
          </View>
          <Text variant="caption" muted>
            {t("onb.t.avoidBody")}
          </Text>
          {avoid.length ? (
            <View style={styles.wrap}>
              {avoid.map((a) => {
                const name = displayName(catalogEntry(a.ingredientKey), a.ingredientKey, getLocale());
                return (
                  <Layout key={a.ingredientKey}>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={t("onb.t.removeAvoid", { name })}
                      onPress={() => removeAvoid(a.ingredientKey)}
                      style={[styles.avoid, { backgroundColor: a.kind === "allergy" ? colors.alertSoft : colors.surfaceMuted }]}
                    >
                      <Text variant="label" color={a.kind === "allergy" ? colors.onAlertSoft : colors.ink}>
                        {a.kind === "allergy" ? `${name} · ${t("onb.t.allergyTag")}` : name}
                      </Text>
                      <Icon name="close" size={14} color={a.kind === "allergy" ? colors.onAlertSoft : colors.inkSecondary} />
                    </PressableScale>
                  </Layout>
                );
              })}
            </View>
          ) : null}
          <Field
            value={word}
            onChangeText={(v) => {
              setWord(v);
              setUnknown(false);
            }}
            placeholder={t("onb.t.avoidPlaceholder")}
            accessibilityLabel={t("onb.t.avoidPlaceholder")}
            returnKeyType="done"
            onSubmitEditing={() => add("dislike")}
          />
          {unknown ? (
            <Text variant="caption" color={colors.alert} accessibilityLiveRegion="polite">
              {t("onb.t.unknown")}
            </Text>
          ) : null}
          {word.trim() ? (
            <View style={styles.row}>
              <Button kind="secondary" size="small" icon="close" label={t("onb.t.dislike")} onPress={() => add("dislike")} />
              <Button kind="secondary" size="small" icon="shield" label={t("onb.t.allergy")} onPress={() => add("allergy")} />
            </View>
          ) : null}
        </Card>
      </Enter>
    </StepScreen>
  );
}

/** Five spice steps in one pill; the chosen step sits in a white pill that springs to it. */
function SpiceSlider({ value, onChange }: { value: Spice; onChange: (s: Spice) => void }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const step = w / LEVELS.length;
  useEffect(() => {
    if (!step) return;
    x.value = reduce ? (value - 1) * step : withSpring((value - 1) * step, motion.spring);
  }, [value, step, reduce, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      style={[styles.slider, { backgroundColor: colors.surfaceMuted }]}
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width - 6)}
      accessibilityRole="radiogroup"
    >
      {step ? <Animated.View style={[styles.knob, shadow.card, { width: step, backgroundColor: colors.surface }, knob]} /> : null}
      {LEVELS.map((n) => {
        const on = n === value;
        return (
          <PressableScale
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={t(`spice.${n}` as StringKey)}
            onPress={() => onChange(n)}
            style={styles.level}
          >
            {on ? <Icon name="flame" size={14} color={colors.accentText} /> : null}
            <Text variant="caption" weight={on ? 600 : 400} color={on ? colors.accentText : colors.inkSecondary} numberOfLines={1}>
              {t(`onb.t.spice.${n}` as StringKey)}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  well: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  say: { fontStyle: "italic" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pace: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.card, padding: space.lg, borderWidth: 1.5 },
  paceTitle: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  upper: { textTransform: "uppercase" },
  avoid: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: space.md, minHeight: 36 },
  ready: { flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: space.xs },
  slider: { flexDirection: "row", borderRadius: radius.pill, padding: 3, minHeight: 52 },
  knob: { position: "absolute", top: 3, bottom: 3, left: 3, borderRadius: radius.pill },
  level: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
});
