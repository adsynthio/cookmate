// The top of You in the Stitch "You & Memory" layout: who you are and who you cook for, a few numbers, the
// household's taste at a glance, and the app language (which can be changed here at any time).
import { StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { Icon, type IconName } from "@/design-system/icons";
import { Enter, PressableScale } from "@/design-system/motion";
import { Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { APP_LOCALES, getLocale, t, type AppLocale, type Locale, type StringKey } from "@/i18n";
import type { Member, Memory } from "@/services";

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function ProfileCard({ me, members }: { me?: Member; members: Member[] }) {
  const { colors } = useTheme();
  const others = members.filter((m) => m.id !== me?.id);
  return (
    <Enter>
      <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]}>
        <View style={styles.row}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text variant="title" color={colors.onPrimary}>
              {initials(me?.displayName ?? "")}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{me?.displayName ?? t("you.title")}</Text>
            <Text variant="label" muted>
              {members.length <= 1 ? t("you.cooksForSelf") : t("you.cooksFor", { n: members.length })}
            </Text>
          </View>
        </View>
        {others.length ? (
          <View style={styles.people}>
            {others.map((m) => (
              <View key={m.id} style={[styles.person, { backgroundColor: colors.surfaceMuted }]}>
                <View style={[styles.mini, { backgroundColor: colors.peach }]}>
                  <Text variant="caption" weight={600} color={colors.peachText}>
                    {initials(m.displayName)}
                  </Text>
                </View>
                <Text variant="label">{m.displayName}</Text>
                <Text variant="caption" muted>
                  {t(`age.${m.ageGroup}` as StringKey)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Enter>
  );
}

export function StatGrid({ stats }: { stats: { icon: IconName; value: number; label: string; tone: "primary" | "accent" }[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid}>
      {stats.map((s, i) => (
        <Enter key={s.label} index={i} style={styles.cell}>
          <View style={[styles.stat, shadow.card, { backgroundColor: colors.surface }]} accessible accessibilityLabel={`${s.value} ${s.label}`}>
            <View style={[styles.well, { backgroundColor: s.tone === "primary" ? colors.primaryPale : colors.accentSoft }]}>
              <Icon name={s.icon} size={18} color={s.tone === "primary" ? colors.primaryText : colors.accentText} />
            </View>
            <Text variant="title">{s.value}</Text>
            <Text variant="caption" muted>
              {s.label}
            </Text>
          </View>
        </Enter>
      ))}
    </View>
  );
}


/** Spice per person as a bar, and the loves and avoids as chips (olive and dashed terracotta). */
export function TasteCard({ members, prefs }: { members: Member[]; prefs: Memory[] }) {
  const { colors } = useTheme();
  const locale = getLocale();
  const nameOf = (key: string) => displayName(catalogEntry(key), key, locale);
  const loves = prefs.filter((p) => p.polarity > 0 && p.ingredientKey);
  const avoids = prefs.filter((p) => p.polarity < 0 && p.ingredientKey);
  return (
    <Enter>
      <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]}>
        <Text variant="heading">{t("you.taste")}</Text>
        {members.map((m) => (
          <View key={m.id} style={{ gap: 6 }}>
            <View style={styles.between}>
              <Text variant="label">{t("you.spiceOf", { name: m.displayName })}</Text>
              <Text variant="label" weight={600} color={colors.accentText}>
                {t(`you.spice.${Math.max(1, Math.min(5, m.spice))}` as StringKey)} ({m.spice}/5)
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.surfaceHigh }]}>
              <View style={[styles.fill, { width: `${(m.spice / 5) * 100}%`, backgroundColor: colors.accent }]} />
            </View>
          </View>
        ))}
        {loves.length ? (
          <View style={{ gap: space.sm }}>
            <Text variant="overline" muted>
              {t("you.lovedThings").toUpperCase()}
            </Text>
            <View style={styles.chips}>
              {loves.map((p) => (
                <View key={p.id} style={[styles.chip, { backgroundColor: colors.primaryPale }]}>
                  <Icon name="heart" size={14} color={colors.primaryText} />
                  <Text variant="label" color={colors.primaryText}>
                    {nameOf(p.ingredientKey!)}
                    {p.memberName ? ` · ${p.memberName}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {avoids.length ? (
          <View style={[styles.avoid, { backgroundColor: colors.surfaceMuted }]}>
            <View style={styles.row}>
              <Icon name="shield" size={16} color={colors.accentText} />
              <Text variant="overline" color={colors.accentText}>
                {t("you.neverPick").toUpperCase()}
              </Text>
            </View>
            {avoids.map((p) => (
              <View key={p.id} style={styles.between}>
                <Text>{nameOf(p.ingredientKey!)}</Text>
                <Text variant="label" weight={600} color={colors.accentText}>
                  {p.memberName ?? t("you.everyone")}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Enter>
  );
}

/** App language, changeable any time; the choice is saved on the account. */
export function LanguageCard({ value, onChange }: { value: AppLocale; onChange: (l: AppLocale) => void }) {
  const { colors } = useTheme();
  const order: AppLocale[] = (["en", "hi", "hinglish", "kn"] as AppLocale[]).filter((l) => (APP_LOCALES as readonly string[]).includes(l));
  return (
    <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]}>
      <View style={styles.row}>
        <Icon name="speaker" size={20} color={colors.primaryText} />
        <Text variant="subheading" style={{ flex: 1 }}>
          {t("you.language")}
        </Text>
      </View>
      <Text variant="label" muted>
        {t("you.languageBody")}
      </Text>
      <View style={[styles.segment, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="radiogroup">
        {order.map((l) => {
          const on = value === l;
          return (
            <PressableScale
              key={l}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t(`lang.${l}` as StringKey)}
              onPress={() => onChange(l)}
              style={[styles.segmentItem, on && [shadow.card, { backgroundColor: colors.primary }]]}
            >
              <Text variant="label" weight={600} color={on ? colors.onPrimary : colors.inkSecondary}>
                {t(`lang.${l}` as StringKey)}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.cardLg, padding: space.lg, gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  people: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  person: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingVertical: 4, paddingLeft: 4, paddingRight: space.md },
  mini: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  cell: { width: "47%", flexGrow: 1 },
  stat: { borderRadius: radius.card, padding: space.lg, gap: 2 },
  well: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: space.sm },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  avoid: { borderRadius: radius.item, padding: space.md, gap: space.sm },
  segment: { flexDirection: "row", borderRadius: radius.pill, padding: 4, gap: 4 },
  segmentItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 44, borderRadius: radius.pill },
});
