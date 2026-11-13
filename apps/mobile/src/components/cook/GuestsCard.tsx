// Sprint 13 S10 on the Cook tab: "Having guests?" One line until opened; then how many guests and what time, a menu
// everyone can eat from what's in the kitchen (main, dal, a dry side and rotis), and one timeline for all of it.
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { recipeDocs } from "@/data/recipes";
import { Icon } from "@/design-system/icons";
import { Card, Chip, IconButton, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { stillNeeds } from "@/domain/buyFew";
import { clockOf, minutesOf } from "@/domain/dinnerPlan";
import { guestMenu, menuTimeline, type MenuItem } from "@/domain/guests";
import { burners } from "@/domain/kitchenLimits";
import { recipeTitle, toRankRecipe } from "@/domain/recipes";
import { has } from "@/domain/tools";
import { getLocale, t } from "@/i18n";
import { services } from "@/services";
import { pantryEntries, STAPLES } from "@/services/picks";

const TIMES = ["19:30", "20:00", "20:30", "21:00"];

export function GuestsCard({ householdId }: { householdId: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const locale = getLocale();
  const [open, setOpen] = useState(false);
  const [guests, setGuests] = useState(4);
  const [dinner, setDinner] = useState("20:00");
  const kitchen = useQuery({ queryKey: ["kitchen", householdId], queryFn: () => services.kitchen.getKitchen(householdId), enabled: open });
  const members = useQuery({ queryKey: ["members", householdId], queryFn: () => services.preference.listMembers(householdId), enabled: open });
  const tools = useQuery({ queryKey: ["tools", householdId], queryFn: () => services.kitchen.getTools(householdId), enabled: open });

  const people = (members.data?.length ?? 2) + guests;
  const plan = useMemo(() => {
    if (!kitchen.data || !members.data) return null;
    const pantry = pantryEntries(kitchen.data);
    const rank = new Map(recipeDocs.map((d) => [d.slug, toRankRecipe(d)]));
    // Guests' diets are unknown: keep it veg unless the household itself is all non-veg and says so.
    const diets = [...members.data.map((m) => m.diet), "veg"];
    const menu = guestMenu(recipeDocs, diets, people, (slug) => stillNeeds(rank.get(slug)!, pantry, STAPLES).length);
    if (!menu) return null;
    const stoves = tools.data ? (has(tools.data, "gas_stove") ? burners(tools.data) : 0) + (has(tools.data, "induction") ? 1 : 0) : 2;
    return { menu, timeline: menuTimeline(menu, (s) => recipeDocs.find((d) => d.slug === s), minutesOf(dinner), stoves) };
  }, [kitchen.data, members.data, tools.data, people, dinner]);

  const title = (slug: string) => {
    const d = recipeDocs.find((x) => x.slug === slug);
    return d ? recipeTitle(d, locale) : slug;
  };
  const words = (i: MenuItem): string => {
    switch (i.kind) {
      case "step":
        return t("guests.step", { dish: title(i.dish), n: i.step });
      case "ahead":
        return t("guests.ahead", { dish: title(i.dish), n: i.step });
      case "meanwhile":
        return i.what === "dough" ? t("plan.meanwhileDough") : i.what === "next" ? t("guests.meanwhile", { dish: title(i.dish) }) : t("plan.meanwhileTidy");
      case "dough":
        return t("plan.dough");
      case "rotis":
        return t("plan.rotisAlongside", { n: i.count });
      case "serve":
        return t("plan.serve");
    }
  };

  return (
    <Card style={{ gap: space.md }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.row}>
        <Icon name="users" size={18} color={colors.accentText} />
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{t("guests.title")}</Text>
          <Text variant="caption" muted>
            {t("guests.sub")}
          </Text>
        </View>
        <Icon name={open ? "close" : "forward"} size={18} color={colors.inkSecondary} />
      </Pressable>
      {open ? (
        <>
          <View style={styles.row}>
            <IconButton label={t("guests.fewer")} onPress={() => setGuests((g) => Math.max(1, g - 1))}>
              <Icon name="minus" />
            </IconButton>
            <Text variant="bodyStrong" style={{ flex: 1, textAlign: "center" }}>
              {t("guests.count", { n: guests, total: people })}
            </Text>
            <IconButton label={t("guests.more")} onPress={() => setGuests((g) => Math.min(20, g + 1))}>
              <Icon name="plus" />
            </IconButton>
          </View>
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            {TIMES.map((x) => (
              <Chip key={x} label={clockOf(minutesOf(x))} selected={dinner === x} onPress={() => setDinner(x)} />
            ))}
          </View>
          {plan ? (
            <>
              <View style={{ gap: space.xs }}>
                {[plan.menu.main, plan.menu.dal, plan.menu.side].filter((s): s is string => !!s).map((s) => (
                  <Pressable key={s} accessibilityRole="link" onPress={() => router.push(`/recipe/${s}`)} style={styles.row}>
                    <Icon name="cook" size={16} color={colors.primary} />
                    <Text variant="bodyStrong" color={colors.primaryText} style={{ flex: 1 }}>
                      {title(s)}
                    </Text>
                  </Pressable>
                ))}
                <Text variant="caption" muted>
                  {t("guests.rotis", { n: plan.menu.rotis, start: clockOf(plan.timeline.start) })}
                </Text>
              </View>
              <View style={{ gap: space.xs }}>
                {plan.timeline.items.map((i, k) => (
                  <View key={k} style={styles.item}>
                    <Text variant="bodyStrong" style={styles.time}>
                      {i.kind === "meanwhile" ? "" : clockOf(i.at)}
                    </Text>
                    <View style={[{ flex: 1 }, i.kind === "meanwhile" ? { backgroundColor: colors.surfaceMuted, borderRadius: radius.item, padding: space.xs } : null]}>
                      <Text variant="caption" color={i.kind === "meanwhile" ? colors.inkSecondary : undefined}>
                        {words(i)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : kitchen.isPending || members.isPending ? null : (
            <Text muted>{t("guests.none")}</Text>
          )}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  item: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  time: { width: 44 },
});
