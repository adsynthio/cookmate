// Plan ahead (D1). In the evening Home offers tomorrow's dish with what to do tonight ("Rajma tomorrow? Soak it
// tonight"); once planned, the evening card is a small checklist, and the next day it shows today's plan with a way
// in. Quiet late at night and early in the morning, and never asks twice in one evening.
import { useQueries, useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";

import { catalogEntry } from "@/data/catalog";
import { Icon } from "@/design-system/icons";
import { dishImage } from "@/design-system/media";
import { Enter, PressableScale } from "@/design-system/motion";
import { Button, Photo, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { displayName } from "@/domain/kitchen";
import { leadHours, nextDay, planMoment, prepNeeds, type PrepNeed } from "@/domain/prepAhead";
import { localHour } from "@/domain/ranking";
import { recipeTitle, type RecipeDoc } from "@/domain/recipes";
import { getLocale, t, type StringKey } from "@/i18n";
import { services, type PantryItem, type Pick } from "@/services";
import { usePlan } from "@/state/plan";

const TZ = "Asia/Kolkata";
export const localDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function PlanCard({ picks, kitchen, onOpen, now = new Date() }: { picks: Pick[]; kitchen: PantryItem[]; onOpen: (recipeId: string) => void; now?: Date }) {
  const { colors } = useTheme();
  const locale = getLocale();
  const { plan, skipped, setPlan, markPrepDone, skip } = usePlan();
  const moment = planMoment(localHour(now, TZ));
  const today = localDate(now);
  const tomorrow = nextDay(today);

  const docs = useQueries({
    queries: picks.slice(0, 3).map((p) => ({ queryKey: ["recipe", p.recipeId], queryFn: () => services.recipe.getRecipe(p.recipeId) })),
  });
  const items = kitchen.map((k) => ({ key: k.ingredientKey, location: k.location, out: k.stapleLevel === "out" }));
  const needsOf = (doc: RecipeDoc | undefined) => (doc ? prepNeeds(doc, items) : []);
  const nameOf = (key: string) => displayName(catalogEntry(key), key, locale);

  const planned = plan && (plan.forDate === tomorrow || plan.forDate === today) ? plan : null;
  const plannedDoc = useQuery({
    queryKey: ["recipe", planned?.recipeId],
    queryFn: () => services.recipe.getRecipe(planned!.recipeId),
    enabled: !!planned,
  }).data;

  // Today's plan, during the day.
  if (moment === "day" && planned?.forDate === today) {
    const needs = needsOf(plannedDoc);
    return (
      <Shell icon="clock" overline={t("plan.today.overline")} title={plannedDoc ? recipeTitle(plannedDoc, locale) : planned.title} slug={planned.slug}>
        {needs.length ? (
          <Text variant="label" color={planned.prepDone ? colors.primary : colors.accentText}>
            {planned.prepDone ? t("plan.prepDone") : t("plan.prepNotDone", { hours: leadHours(needs) })}
          </Text>
        ) : null}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button kind="accent" stretch size="small" iconAfter="arrowRight" label={t("plan.open")} onPress={() => onOpen(planned.recipeId)} />
          </View>
          <Button kind="quiet" size="small" label={t("plan.change")} onPress={() => setPlan(null)} />
        </View>
      </Shell>
    );
  }

  if (moment !== "evening") return null;

  // Planned for tomorrow: tonight's checklist.
  if (planned?.forDate === tomorrow) {
    const needs = needsOf(plannedDoc);
    return (
      <Shell icon="clock" overline={t("plan.tomorrow.overline")} title={plannedDoc ? recipeTitle(plannedDoc, locale) : planned.title} slug={planned.slug}>
        {needs.length ? (
          <>
            {needs.map((n) => (
              <Text key={`${n.kind}:${n.item}`} variant="label">
                • {needText(n, nameOf)}
              </Text>
            ))}
            <PressableScale
              accessibilityRole="checkbox"
              accessibilityState={{ checked: planned.prepDone }}
              onPress={() => markPrepDone(!planned.prepDone)}
              style={[styles.check, { backgroundColor: planned.prepDone ? colors.primarySoft : colors.surfaceMuted }]}
            >
              <Icon name={planned.prepDone ? "checkCircle" : "check"} size={18} color={planned.prepDone ? colors.primary : colors.inkSecondary} />
              <Text variant="label" weight={600}>
                {planned.prepDone ? t("plan.doneTonight") : t("plan.markDone")}
              </Text>
            </PressableScale>
          </>
        ) : (
          <Text variant="label" muted>
            {t("plan.nothingAhead")}
          </Text>
        )}
        <View style={{ alignSelf: "flex-start" }}>
          <Button kind="quiet" size="small" label={t("plan.change")} onPress={() => setPlan(null)} />
        </View>
      </Shell>
    );
  }

  // Offer tomorrow's dish: the first pick that needs something done tonight, else the top pick.
  if (skipped === today || !picks.length) return null;
  const withNeeds = picks.slice(0, 3).map((p, i) => ({ p, doc: docs[i]?.data, needs: needsOf(docs[i]?.data) }));
  const chosen = withNeeds.find((x) => x.needs.length) ?? withNeeds[0];
  if (!chosen?.doc) return null;
  const title = recipeTitle(chosen.doc, locale);
  return (
    <Shell icon="bell" overline={t("plan.offer.overline")} title={t("plan.offer.title", { dish: title })} slug={chosen.p.slug}>
      <Text variant="label" muted>
        {chosen.needs.length ? needText(chosen.needs[0]!, nameOf) : t("plan.offer.easy")}
      </Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button
            kind="accent"
            stretch
            size="small"
            icon="clock"
            label={t("plan.offer.yes")}
            onPress={() => setPlan({ recipeId: chosen.p.recipeId, slug: chosen.p.slug, title: chosen.p.title, forDate: tomorrow, prepDone: false })}
          />
        </View>
        <Button kind="quiet" size="small" label={t("plan.offer.no")} onPress={() => skip(today)} />
      </View>
    </Shell>
  );
}

function needText(n: PrepNeed, nameOf: (key: string) => string): string {
  return t(`plan.need.${n.kind}` as StringKey, { item: n.item ? nameOf(n.item) : "", hours: n.hours, step: n.step ?? 1 });
}

function Shell({ icon, overline, title, slug, children }: { icon: "clock" | "bell"; overline: string; title: string; slug: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Enter>
      <View style={[styles.card, shadow.card, { backgroundColor: colors.surface }]}>
        <View style={styles.top}>
          {dishImage(slug) ? <Photo source={dishImage(slug)} size={52} round /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.row}>
              <Icon name={icon} size={14} color={colors.accentText} />
              <Text variant="overline" color={colors.accentText}>
                {overline.toUpperCase()}
              </Text>
            </View>
            <Text variant="subheading">{title}</Text>
          </View>
        </View>
        {children}
      </View>
    </Enter>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.cardLg, padding: space.lg, gap: space.sm },
  top: { flexDirection: "row", alignItems: "center", gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  check: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm, alignSelf: "flex-start" },
});
