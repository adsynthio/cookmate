// The pieces of Home in the Stitch layout: greeting with the dish of the moment, the craving search pill, "Pick up
// where you left off", the idea cards, Use Soon cards and the "make something new" card.
import { Image, type ImageSourcePropType, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { itemName } from "@/components/kitchen/names";
import { catalogEntry } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { dishImage, ingredientImage } from "@/design-system/media";
import { Enter, PressableScale, Pulse } from "@/design-system/motion";
import { Badge, Photo, Text, textStyle } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space, touch } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { daysLeft } from "@/domain/pantry";
import { recipeTitle } from "@/domain/recipes";
import { getLocale, t } from "@/i18n";
import type { PantryItem, Pick } from "@/services";

/** "Good evening" by the phone's clock. */
export function partOfDay(hour = new Date().getHours()): "morning" | "afternoon" | "evening" {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

export function pickPhoto(p: Pick): ImageSourcePropType | null {
  return p.imageUrl ? { uri: p.imageUrl } : dishImage(p.slug);
}

export function Greeting({
  name,
  slotLabel,
  slotOpen,
  onSlot,
  count,
  photo,
}: {
  name?: string;
  slotLabel: string;
  slotOpen: boolean;
  onSlot: () => void;
  count: number;
  photo: ImageSourcePropType | null;
}) {
  const { colors } = useTheme();
  const hello = t(`home.hello.${partOfDay()}`);
  return (
    <Enter style={styles.greeting}>
      <View style={{ flex: 1, gap: space.xs }}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${t("home.slotPicker")}: ${slotLabel}`}
          onPress={onSlot}
          style={styles.slot}
        >
          <Text variant="label" weight={600} color={colors.accentText}>
            {t("home.cookingFor", { slot: slotLabel })}
          </Text>
          <View style={{ transform: [{ rotate: slotOpen ? "-90deg" : "90deg" }] }}>
            <Icon name="forward" size={14} color={colors.accentText} />
          </View>
        </PressableScale>
        <Text variant="display" accessibilityRole="header">
          {name ? `${hello},\n${name}` : hello}
        </Text>
        <Text muted>{count ? t("home.kitchenCount", { n: count }) : t("home.kitchenEmpty")}</Text>
      </View>
      <View style={[styles.greetPhoto, shadow.float, { backgroundColor: colors.primaryPale }]}>
        {photo ? <Image source={photo} style={styles.fill} resizeMode="cover" accessible={false} /> : null}
      </View>
    </Enter>
  );
}

/** "What are you in the mood for?" with the mic: free text becomes the craving. */
export function SearchPill({ value, onChange, onSubmit, onMic }: { value: string; onChange: (v: string) => void; onSubmit: () => void; onMic: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.search, shadow.card, { backgroundColor: colors.surface }]}>
      <Icon name="search" size={22} color={colors.inkSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        placeholder={t("home.moodPlaceholder")}
        placeholderTextColor={colors.inkTertiary}
        accessibilityLabel={t("home.cravingPrompt")}
        style={[textStyle("body"), styles.searchInput, { color: colors.ink }]}
      />
      <PressableScale accessibilityRole="button" accessibilityLabel={t("home.voice")} onPress={onMic} style={[styles.searchMic, { backgroundColor: colors.surfaceMuted }]}>
        <Icon name="mic" size={20} color={colors.primaryText} />
      </PressableScale>
    </View>
  );
}

/** The olive "Pick up where you left off" card with the dish you're in the middle of. */
export function ResumeCard({ dish, step, total, photo, onResume }: { dish: string; step: number; total: number; photo: ImageSourcePropType | null; onResume: () => void }) {
  const { colors } = useTheme();
  return (
    <Enter>
      <View style={[styles.resume, { backgroundColor: colors.primaryContainer }]}>
        <View style={styles.row}>
          <Pulse color={colors.peach} />
          <Text variant="overline" color={colors.onPrimary}>
            {t("home.resume").toUpperCase()}
          </Text>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${t("cook.resume.go")}: ${dish}`}
          onPress={onResume}
          style={[styles.resumeInner, { backgroundColor: colors.surface }]}
        >
          <Photo source={photo} size={64} round />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="subheading" numberOfLines={1}>
              {dish}
            </Text>
            <Text variant="caption" muted>
              {t("cook.stepOf", { n: step, total })}
            </Text>
          </View>
          <View style={[styles.play, shadow.glow, { backgroundColor: colors.accent }]}>
            <Icon name="play" size={22} color={colors.onAccent} fill={colors.onAccent} />
          </View>
        </PressableScale>
      </View>
    </Enter>
  );
}

/** A dish idea: photo, a badge (can make now, or what is missing), why, and time and match in the footer. */
export function PickCard({ pick, hero, index, onOpen, onCook }: { pick: Pick; hero?: boolean; index: number; onOpen: () => void; onCook?: () => void }) {
  const { colors } = useTheme();
  const locale = getLocale();
  const name = recipeTitle(pick, locale);
  const ready = pick.missing.length === 0;
  const missing = pick.missing.map((k) => displayName(catalogEntry(k), k, locale));
  return (
    <Enter index={index}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${pick.reason}`}
        onPress={onOpen}
        scaleTo={0.985}
        style={[styles.pick, shadow.card, { backgroundColor: colors.surface }]}
      >
        <View style={styles.pickTop}>
          <Photo source={pickPhoto(pick)} size={hero ? 104 : 88} round />
          <View style={{ flex: 1, gap: space.xs }}>
            {ready ? (
              <Badge tone="primary" label={t("home.canMake")} />
            ) : (
              <Badge tone="peach" label={t("home.needN", { n: pick.missing.length })} />
            )}
            <Text variant={hero ? "heading" : "subheading"} numberOfLines={2}>
              {name}
            </Text>
            <Text variant="label" color={colors.inkSecondary} numberOfLines={2}>
              {pick.reason}
            </Text>
          </View>
        </View>
        {hero && missing.length ? (
          <Text variant="caption" color={colors.accentText}>
            {t("home.missing", { items: missing.length > 3 ? `${missing.slice(0, 3).join(", ")}, ${t("home.andMore", { n: missing.length - 3 })}` : missing.join(", ") })}
          </Text>
        ) : null}
        <View style={[styles.pickFoot, { backgroundColor: colors.surfaceMuted }]}>
          {pick.totalTimeMin ? (
            <View style={styles.row}>
              <Icon name="timer" size={16} color={colors.inkSecondary} />
              <Text variant="label" color={colors.inkSecondary}>
                {t("home.minutes", { min: pick.totalTimeMin })}
              </Text>
            </View>
          ) : null}
          {pick.total ? (
            <View style={styles.row}>
              <Icon name="pantry" size={16} color={colors.inkSecondary} />
              <Text variant="label" color={colors.inkSecondary}>
                {t("home.haveShort", { have: pick.have, total: pick.total })}
              </Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          {onCook ? (
            <PressableScale accessibilityRole="button" accessibilityLabel={`${t("home.cookNow")}: ${name}`} onPress={onCook} hitSlop={8} style={styles.row}>
              <Text variant="label" weight={600} color={colors.accentText}>
                {t("home.cookNow")}
              </Text>
              <Icon name="forward" size={16} color={colors.accentText} />
            </PressableScale>
          ) : (
            <View style={styles.row}>
              <Text variant="label" weight={600} color={colors.primaryText}>
                {t("home.viewRecipe")}
              </Text>
              <Icon name="forward" size={16} color={colors.primaryText} />
            </View>
          )}
        </View>
      </PressableScale>
    </Enter>
  );
}

/** Use Soon as photo cards with a day badge; "Find recipes" focuses the picks on that item. */
export function UseSoonCards({ items, focused, onPick }: { items: PantryItem[]; focused: string | null; onPick: (i: PantryItem) => void }) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.useSoonRow}>
      {items.map((item, i) => {
        const days = item.expiryDate ? daysLeft(item.expiryDate) : null;
        const label = days === null ? t("home.soon") : days <= 0 ? t("home.today") : days === 1 ? t("home.dayLeft") : t("home.daysLeft", { days });
        const on = focused === item.id;
        const entry = item.ingredientKey ? catalogEntry(item.ingredientKey) : undefined;
        return (
          <Enter key={item.id} index={i}>
            <View style={[styles.useSoon, shadow.card, { backgroundColor: on ? colors.primarySoft : colors.surface }]}>
              <View style={styles.useSoonTop}>
                <Photo source={ingredientImage(item.ingredientKey, entry?.category ?? (item.state === "leftover" ? "leftover" : "homemade"))} size={44} round />
                <Badge tone={days !== null && days <= 1 ? "alert" : "accent"} label={label} />
              </View>
              <Text variant="bodyStrong" numberOfLines={1}>
                {itemName(item)}
              </Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t("home.findRecipes")}: ${itemName(item)}`}
                onPress={() => onPick(item)}
                style={[styles.find, { backgroundColor: on ? colors.primary : colors.surfaceMuted }]}
              >
                <Text variant="caption" weight={600} color={on ? colors.onPrimary : colors.inkSecondary}>
                  {on ? t("home.clear") : t("home.findRecipes")}
                </Text>
              </PressableScale>
            </View>
          </Enter>
        );
      })}
    </ScrollView>
  );
}

/** KIT-056 as a soft card at the end of Home. */
export function InventCard({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Enter>
      <PressableScale accessibilityRole="button" accessibilityLabel={t("home.invent")} onPress={onPress} style={[styles.invent, { backgroundColor: colors.peach }]}>
        <View style={[styles.inventIcon, { backgroundColor: colors.surface }]}>
          <Icon name="sparkle" size={22} color={colors.accentText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" color={colors.peachText}>
            {t("home.invent")}
          </Text>
          <Text variant="caption" color={colors.peachText}>
            {t("home.inventBody")}
          </Text>
        </View>
        <Icon name="forward" size={20} color={colors.peachText} />
      </PressableScale>
    </Enter>
  );
}

const styles = StyleSheet.create({
  greeting: { flexDirection: "row", alignItems: "center", gap: space.md },
  slot: { flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start", minHeight: 32 },
  greetPhoto: { width: 116, height: 116, borderRadius: 58, overflow: "hidden" },
  fill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  search: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.pill, paddingLeft: space.lg, paddingRight: space.sm, minHeight: touch.cook },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: space.md, outlineStyle: "none" } as object,
  searchMic: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  resume: { borderRadius: radius.cardLg, padding: space.lg, gap: space.md },
  resumeInner: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.pill, padding: space.sm, paddingRight: space.sm },
  play: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  pick: { borderRadius: radius.cardLg, padding: space.lg, gap: space.md },
  pickTop: { flexDirection: "row", alignItems: "center", gap: space.lg },
  pickFoot: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.pill, paddingHorizontal: space.md, minHeight: 40 },
  useSoonRow: { gap: space.md, paddingVertical: space.xs, paddingRight: space.gutter },
  useSoon: { width: 156, borderRadius: radius.card, padding: space.md, gap: space.sm },
  useSoonTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.xs },
  find: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", minHeight: 36 },
  invent: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.cardLg, padding: space.lg },
  inventIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
