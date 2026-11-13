// After a scan: "Also saw a microwave and an air fryer. Add them to your kitchen tools?" Only tools not already on
// the list are offered, and nothing is added unless the cook says yes.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Button, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { has, toggleTool, type ToolKey } from "@/domain/tools";
import { t, type StringKey } from "@/i18n";
import { services } from "@/services";

export function SeenTools({ householdId, seen }: { householdId: string; seen: ToolKey[] }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [done, setDone] = useState<"added" | "no" | null>(null);
  const tools = useQuery({ queryKey: ["tools", householdId], queryFn: () => services.kitchen.getTools(householdId) });
  const fresh = seen.filter((k) => !has(tools.data, k));
  const add = useMutation({
    mutationFn: () => services.kitchen.setTools(householdId, fresh.reduce((acc, k) => toggleTool(acc, k), tools.data ?? [])),
    onSuccess: () => {
      setDone("added");
      void qc.invalidateQueries({ queryKey: ["tools", householdId] });
      void qc.invalidateQueries({ queryKey: ["picks"] });
    },
  });
  if (!tools.isSuccess || (!fresh.length && done !== "added") || done === "no") return null;
  const names = fresh.map((k) => t(`tools.${k}` as StringKey)).join(", ");
  return (
    <View style={[styles.card, { backgroundColor: colors.primaryPale }]} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <Icon name="sparkle" size={20} color={colors.primaryText} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {done === "added" ? t("tools.seenAdded") : t("tools.seen", { names })}
        </Text>
      </View>
      {done === "added" ? null : (
        <View style={styles.row}>
          <Button kind="primary" size="small" icon="plus" label={t("tools.seenAdd")} disabled={add.isPending} onPress={() => add.mutate()} />
          <Button kind="quiet" size="small" label={t("tools.seenNo")} onPress={() => setDone("no")} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: space.md, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
});
