// You tab: the kitchen tools, changed in place and saved as you tap. Picks and the cook screen use them right away.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Icon } from "@/design-system/icons";
import { PressableScale } from "@/design-system/motion";
import { Button, Card, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { burners } from "@/domain/kitchenLimits";
import { DEFAULT_TOOLS, heatOf, setHeat, type Tool } from "@/domain/tools";
import { t, type StringKey } from "@/i18n";
import { services } from "@/services";

import { ToolsPicker } from "./ToolsPicker";

export function ToolsCard({ householdId }: { householdId: string }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const saved = useQuery({ queryKey: ["tools", householdId], queryFn: () => services.kitchen.getTools(householdId) });
  const [tools, setTools] = useState<Tool[] | null>(null);
  // U38: set once, rarely changed, and the tallest card on You: folded to one line of what's set until tapped.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (saved.isSuccess && tools === null) setTools(saved.data ?? DEFAULT_TOOLS.map((type) => ({ type })));
  }, [saved.isSuccess, saved.data, tools]);
  const save = useMutation({
    mutationFn: (next: Tool[]) => services.kitchen.setTools(householdId, next),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tools", householdId] });
      void qc.invalidateQueries({ queryKey: ["picks"], refetchType: "none" });
    },
  });
  if (!tools) return null;
  const n = burners(tools);
  const summary = tools
    .map((x) => (x.type === "gas_stove" && n ? t("tools.gasBurners", { n }) : t(`tools.${x.type}` as StringKey)))
    .join(" · ");
  return (
    <Card>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t("tools.youTitle")}: ${summary}`}
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
      >
        <View style={{ flex: 1, gap: space.xs }}>
          <Text variant="subheading">{t("tools.youTitle")}</Text>
          <Text variant="caption" muted numberOfLines={open ? undefined : 2}>
            {open ? t("tools.youBody") : summary}
          </Text>
        </View>
        <Icon name={open ? "minus" : "edit"} size={18} color={colors.primaryText} />
      </PressableScale>
      {open ? (
      <ToolsPicker
        tools={tools}
        onChange={(next) => {
          setTools(next);
          save.mutate(next);
        }}
      />
      ) : null}
      {/* S1: what was learned from "Too hot" / "Too slow", visible and undoable here. */}
      {(["gas", "induction"] as const).map((s) => {
        const shift = heatOf(tools, s)?.shift ?? 0;
        if (!shift) return null;
        return (
          <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text variant="caption" style={{ flex: 1 }}>
              {t(shift < 0 ? "tools.heat.lower" : "tools.heat.higher", { stove: t(`cook.stove.${s}`), n: Math.abs(shift) })}
            </Text>
            <Button
              kind="quiet"
              size="small"
              label={t("tools.heat.reset")}
              onPress={() => {
                const next = setHeat(tools, s, undefined);
                setTools(next);
                save.mutate(next);
              }}
            />
          </View>
        );
      })}
      {save.isSuccess && !save.isPending ? (
        <Text variant="caption" weight={600} color={colors.primaryText} accessibilityLiveRegion="polite">
          {t("tools.saved")}
        </Text>
      ) : null}
    </Card>
  );
}
