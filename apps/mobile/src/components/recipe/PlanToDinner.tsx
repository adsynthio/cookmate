// Sprint 13 S4: plan to dinner time on recipe detail. One quiet line ("Dinner at 8:00? Start by 7:31") that opens
// into the timeline: when each step starts, what to do during the waits, and when to make rotis, using the stoves
// this kitchen has. Uses the cook's own step times (S2) when known.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Card, Chip, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { clockOf, minutesOf, planDinner, type PlanItem } from "@/domain/dinnerPlan";
import { burners } from "@/domain/kitchenLimits";
import type { RecipeDoc } from "@/domain/recipes";
import { yourSeconds } from "@/domain/stepTimes";
import { has } from "@/domain/tools";
import { t } from "@/i18n";
import { services } from "@/services";
import { useStepTimes } from "@/state/stepTimes";

const TIMES = ["19:30", "20:00", "20:30", "21:00", "21:30"];

/** The first sentence of a step, short enough for a timeline row. */
function short(text: string): string {
  const parts = text.split(/(?<=[.।!?])\s/);
  // A very short first sentence ("Drain the rajma.") says little on its own: take the next one too.
  const first = (parts[0] ?? text).length < 45 && parts[1] ? `${parts[0]} ${parts[1]}` : (parts[0] ?? text);
  return first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first;
}

export function PlanToDinner({ doc, householdId, servings }: { doc: RecipeDoc; householdId: string; servings: number }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [dinner, setDinner] = useState("20:00");
  const [withRotis, setWithRotis] = useState(false);
  const times = useStepTimes((s) => s.times);
  const tools = useQuery({ queryKey: ["tools", householdId], queryFn: () => services.kitchen.getTools(householdId) });
  if (!["main", "side"].includes(doc.course)) return null;

  // What can cook at once: gas burners plus an induction. No tools saved: a usual two-burner gas stove.
  const stoves = tools.data ? (has(tools.data, "gas_stove") ? burners(tools.data) : 0) + (has(tools.data, "induction") ? 1 : 0) : 2;
  const rotis = withRotis ? servings * 3 : 0;
  const plan = planDinner(doc.steps, (n) => (doc.steps[n - 1] ? yourSeconds(times, doc.slug, n, doc.steps[n - 1]!) : null), minutesOf(dinner), {
    stoves,
    rotis,
  });
  const words = (i: PlanItem): string => {
    switch (i.kind) {
      case "step":
        return t("plan.step", { n: i.step, text: short(doc.steps[i.step - 1]?.text ?? "") });
      case "meanwhile":
        return i.what === "dough"
          ? t("plan.meanwhileDough")
          : i.what === "next"
            ? t("plan.meanwhileNext", { n: i.next ?? i.step + 1 })
            : t("plan.meanwhileTidy");
      case "ahead":
        return t("plan.ahead", { text: short(doc.steps[i.step - 1]?.text ?? "") });
      case "dough":
        return t("plan.dough");
      case "rotis":
        return stoves >= 2 ? t("plan.rotisAlongside", { n: i.count }) : t("plan.rotisAfter", { n: i.count });
      case "serve":
        return t("plan.serve");
    }
  };

  return (
    <Card style={{ gap: space.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={styles.row}
      >
        <Icon name="timer" size={18} color={colors.accentText} />
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{t("plan.title", { dinner: clockOf(minutesOf(dinner)) })}</Text>
          <Text variant="caption" muted>
            {t("plan.startBy", { time: clockOf(plan.start) })}
          </Text>
        </View>
        <Icon name={open ? "close" : "forward"} size={18} color={colors.inkSecondary} />
      </Pressable>
      {open ? (
        <>
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            {TIMES.map((x) => (
              <Chip key={x} label={clockOf(minutesOf(x))} selected={dinner === x} onPress={() => setDinner(x)} />
            ))}
          </View>
          {doc.course === "main" ? (
            <View style={styles.row}>
              <Chip label={t("plan.withRotis", { n: servings * 3 })} selected={withRotis} showCheck onPress={() => setWithRotis((r) => !r)} />
            </View>
          ) : null}
          <View style={{ gap: space.sm }}>
            {plan.items.map((i, k) => (
              <View key={k} style={styles.item}>
                <Text variant="bodyStrong" style={styles.time} color={i.kind === "meanwhile" ? colors.inkSecondary : undefined}>
                  {i.kind === "meanwhile" ? "" : clockOf(i.at)}
                </Text>
                <View
                  style={[
                    styles.line,
                    i.kind === "meanwhile" ? { backgroundColor: colors.surfaceMuted, borderRadius: radius.item, padding: space.sm } : null,
                  ]}
                >
                  <Text color={i.kind === "meanwhile" ? colors.inkSecondary : undefined}>{words(i)}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  item: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  time: { width: 44 },
  line: { flex: 1 },
});
