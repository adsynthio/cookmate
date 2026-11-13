// You tab: the kitchen tools, changed in place and saved as you tap. Picks and the cook screen use them right away.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Button, Card, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { DEFAULT_TOOLS, heatOf, setHeat, type Tool } from "@/domain/tools";
import { t } from "@/i18n";
import { services } from "@/services";

import { ToolsPicker } from "./ToolsPicker";

export function ToolsCard({ householdId }: { householdId: string }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const saved = useQuery({ queryKey: ["tools", householdId], queryFn: () => services.kitchen.getTools(householdId) });
  const [tools, setTools] = useState<Tool[] | null>(null);
  useEffect(() => {
    if (saved.isSuccess && tools === null) setTools(saved.data ?? DEFAULT_TOOLS.map((type) => ({ type })));
  }, [saved.isSuccess, saved.data, tools]);
  const save = useMutation({
    mutationFn: (next: Tool[]) => services.kitchen.setTools(householdId, next),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tools", householdId] });
      void qc.invalidateQueries({ queryKey: ["picks"] });
    },
  });
  if (!tools) return null;
  return (
    <Card>
      <View style={{ gap: space.xs }}>
        <Text variant="subheading">{t("tools.youTitle")}</Text>
        <Text variant="caption" muted>
          {t("tools.youBody")}
        </Text>
      </View>
      <ToolsPicker
        tools={tools}
        onChange={(next) => {
          setTools(next);
          save.mutate(next);
        }}
      />
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
