// KIT-024 kitchen setup, from the Stitch "Let's get to know your kitchen" screen: the camera scan card, places
// (Fridge, Pantry, Freezer, Staples), what's already chosen as soft peach chips (tap to remove), common things for
// this place to tap and add, a field for anything else ("leftover dal"), and how many dishes that already unlocks.
// Nothing is saved yet: the items are added to the kitchen when the household is created on the last step.
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { StepScreen } from "@/components/onboarding/StepScreen";
import { catalogEntry } from "@/data/catalog";
import { recipeDocs } from "@/data/recipes";
import { Icon, type IconName } from "@/design-system/icons";
import { ingredientImage } from "@/design-system/media";
import { Enter, Layout, PressableScale } from "@/design-system/motion";
import { Badge, Card, Chip, Field, IconButton, Photo, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { dishesWithin, isLeftoverText, SETUP_PLACES, suggestionsFor, type SetupItem, type SetupPlace } from "@/domain/kitchenSetup";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { findIngredients } from "@/services/picks";
import { useOnboarding } from "@/state/onboarding";

const PLACE_ICON: Record<SetupPlace, IconName> = { fridge: "fridge", pantry: "pantry", freezer: "freezer", staples: "box" };

export function nameOf(name: string): string {
  return displayName(catalogEntry(name), name, getLocale());
}

function dishTitle(slug: string, fallback: string): string {
  const doc = recipeDocs.find((r) => r.slug === slug);
  const locale = getLocale();
  return (locale === "hi" ? doc?.titles?.hi : locale === "hinglish" ? doc?.titles?.["hi-Latn"] : undefined) ?? fallback;
}

export default function KitchenSetupScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const { kitchen, diet, addKitchenItem, removeKitchenItem } = useOnboarding();
  const [place, setPlace] = useState<SetupPlace>("fridge");
  const [own, setOwn] = useState("");

  const suggestions = suggestionsFor(place, diet, kitchen, catalogEntry);
  const dishes = useMemo(
    () => dishesWithin(kitchen, recipeDocs, (n) => !!catalogEntry(n)?.staple, diet),
    [kitchen, diet],
  );
  const next = () => router.push("/onboarding/taste");

  const addOwn = () => {
    const text = own.trim();
    if (!text) return;
    if (isLeftoverText(text)) {
      // Cooked food ("leftover rice") is a leftover in the fridge, not the raw ingredient.
      addKitchenItem({ name: text, place: "fridge", known: false, state: "leftover" });
      setOwn("");
      return;
    }
    const [key] = findIngredients(text);
    // A single known word ("palak") becomes the catalog item; anything longer ("leftover dal") stays as typed.
    const known = !!key && text.split(/\s+/).length <= 2;
    addKitchenItem({ name: known ? key! : text, place, known });
    setOwn("");
  };

  const tip =
    dishes.length === 0
      ? t("onb.k.tipNone")
      : dishes.length === 1
        ? t("onb.k.tipOne", { n: kitchen.length, dishes: dishTitle(dishes[0]!.slug, dishes[0]!.title) })
        : t("onb.k.tip", {
            n: kitchen.length,
            count: dishes.length,
            dishes: dishes.slice(0, 2).map((d) => dishTitle(d.slug, d.title)).join(", "),
          });

  return (
    <StepScreen
      step={3}
      chip={t("onb.chip.kitchen")}
      overline={t("onb.k.overline")}
      title={t("onb.k.title")}
      body={t("onb.k.body")}
      onSkip={next}
      actionLabel={kitchen.length ? t("onb.k.continue", { n: kitchen.length }) : t("onb.k.continueNone")}
      actionIcon="forward"
      onAction={next}
      secondaryLabel={t("onb.k.later")}
      onSecondary={next}
    >
      <Enter index={1}>
        <Card tone="primary">
          <View style={styles.scanRow}>
            <View style={[styles.scanIcon, { backgroundColor: "rgba(255,255,255,0.16)" }]}>
              <Icon name="camera" size={26} color={colors.onPrimary} />
            </View>
            <View style={{ flex: 1, gap: space.xs }}>
              <Badge label={t("onb.k.scan.badge")} tone="onColor" />
              <Text variant="heading" color={colors.onPrimary}>
                {t("onb.k.scan.title")}
              </Text>
              <Text variant="caption" color={colors.onPrimary} style={{ opacity: 0.85 }}>
                {t("onb.k.scan.body")}
              </Text>
            </View>
          </View>
          <View style={[styles.soon, { backgroundColor: "rgba(255,255,255,0.16)" }]}>
            <Icon name="clock" size={16} color={colors.onPrimary} />
            <Text variant="label" color={colors.onPrimary}>
              {t("onb.k.scan.soon")}
            </Text>
          </View>
        </Card>
      </Enter>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.places} accessibilityRole="tablist">
        {SETUP_PLACES.map((p) => (
          <Chip
            key={p}
            solid
            selected={place === p}
            icon={PLACE_ICON[p]}
            label={t(`kitchen.location.${p}` as StringKey)}
            onPress={() => setPlace(p)}
          />
        ))}
      </ScrollView>

      <View style={[styles.panel, { backgroundColor: colors.surfaceMuted }]}>
        <View style={styles.panelHead}>
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
            <Text variant="overline" style={styles.upper}>
              {t("onb.k.have", { n: kitchen.length })}
            </Text>
          </View>
          {kitchen.length ? (
            <Text variant="caption" muted>
              {t("onb.k.tapRemove")}
            </Text>
          ) : null}
        </View>
        {kitchen.length ? (
          <View style={styles.wrap}>
            {kitchen.map((item) => (
              <Layout key={item.name}>
                <HaveChip item={item} onRemove={() => removeKitchenItem(item.name)} />
              </Layout>
            ))}
          </View>
        ) : (
          <Text variant="caption" muted>
            {t("onb.k.empty")}
          </Text>
        )}
      </View>

      {suggestions.length ? (
        <View style={{ gap: space.md }}>
          <View style={styles.panelHead}>
            <Text variant="overline" style={styles.upper}>
              {t("onb.k.common")}
            </Text>
            <Text variant="caption" color={colors.accentText}>
              {t("onb.k.commonNote")}
            </Text>
          </View>
          <View style={styles.wrap}>
            {suggestions.map((name) => (
              <Layout key={name}>
                <AddChip name={name} onAdd={() => addKitchenItem({ name, place, known: true })} />
              </Layout>
            ))}
          </View>
        </View>
      ) : null}

      <View style={[styles.ownRow, shadow.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Field
          value={own}
          onChangeText={setOwn}
          onSubmitEditing={addOwn}
          placeholder={t("onb.k.own")}
          accessibilityLabel={t("onb.k.own")}
          returnKeyType="done"
          style={styles.ownField}
        />
        <IconButton label={t("onb.k.ownAdd")} tone="primary" onPress={addOwn} size={44}>
          <Icon name="plus" size={22} color={colors.onPrimary} />
        </IconButton>
      </View>

      <View style={[styles.tip, { backgroundColor: colors.surfaceMuted }]} accessibilityLiveRegion="polite">
        <Icon name="bulb" size={22} color={colors.accentText} />
        <Text variant="caption" muted style={{ flex: 1 }}>
          {tip}
        </Text>
      </View>
    </StepScreen>
  );
}

function HaveChip({ item, onRemove }: { item: SetupItem; onRemove: () => void }) {
  const { colors } = useTheme();
  const entry = catalogEntry(item.name);
  const label = item.known ? nameOf(item.name) : item.name;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t("onb.t.removeAvoid", { name: label })}
      onPress={onRemove}
      style={[styles.have, { backgroundColor: colors.peach }]}
    >
      <Photo source={ingredientImage(item.known ? item.name : null, entry?.category ?? (item.known ? null : "homemade"))} size={26} round />
      <Text variant="label" color={colors.ink}>
        {label}
      </Text>
      <Icon name="checkCircle" size={18} color={colors.peachText} />
    </PressableScale>
  );
}

function AddChip({ name, onAdd }: { name: string; onAdd: () => void }) {
  const { colors } = useTheme();
  const entry = catalogEntry(name);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${t("onb.k.ownAdd")} ${nameOf(name)}`}
      onPress={onAdd}
      style={[styles.add, shadow.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
    >
      <Photo source={ingredientImage(name, entry?.category)} size={26} round />
      <Text variant="label">{nameOf(name)}</Text>
      <Icon name="plus" size={16} color={colors.inkSecondary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  scanRow: { flexDirection: "row", gap: space.lg, alignItems: "flex-start" },
  scanIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  soon: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 10 },
  places: { gap: space.sm, paddingVertical: 2, paddingRight: space.gutter },
  panel: { borderRadius: radius.card, padding: space.gutter, gap: space.md },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  upper: { textTransform: "uppercase" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  have: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.pill, paddingLeft: 6, paddingRight: 12, minHeight: 44 },
  add: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.pill, paddingLeft: 6, paddingRight: 12, minHeight: 44, borderWidth: StyleSheet.hairlineWidth },
  ownRow: { flexDirection: "row", alignItems: "center", borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingRight: 4 },
  ownField: { flex: 1, borderWidth: 0, backgroundColor: "transparent" },
  tip: { flexDirection: "row", gap: space.md, alignItems: "center", borderRadius: radius.card, padding: space.gutter },
});
