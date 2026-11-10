// Kitchen: items grouped by location (KIT-01), staples as Full / Low / Out (KIT-06).
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";

import { MicButton } from "@/components/MicButton";
import { Card, Screen, StateView, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { t, type StringKey } from "@/i18n";
import { services, type LocationKind, type PantryItem } from "@/services";
import { useSession } from "@/state/session";

const ORDER: LocationKind[] = ["fridge", "pantry", "freezer", "staples", "ready_made"];

export default function KitchenScreen() {
  const householdId = useSession((s) => s.householdId);
  const kitchen = useQuery({
    queryKey: ["kitchen", householdId],
    queryFn: () => services.kitchen.getKitchen(householdId!),
    enabled: !!householdId,
  });

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text variant="display" style={{ flex: 1 }}>
          {t("kitchen.title")}
        </Text>
        <MicButton />
      </View>

      {kitchen.isPending ? (
        <StateView state="loading" title={t("state.loading.home")} />
      ) : kitchen.isError ? (
        <StateView state="error" title={t("state.error.title")} actionLabel={t("state.retry")} onAction={() => kitchen.refetch()} />
      ) : kitchen.data.length === 0 ? (
        <StateView
          state="empty"
          title={t("state.empty.kitchen.title")}
          body={t("state.empty.kitchen.body")}
          actionLabel={t("state.empty.kitchen.action")}
          onAction={() => {}}
        />
      ) : (
        ORDER.map((loc) => {
          const items = kitchen.data.filter((i) => i.location === loc);
          if (items.length === 0) return null;
          return (
            <View key={loc} style={{ gap: space.sm }}>
              <Text variant="heading">{t(`kitchen.location.${loc}` as StringKey)}</Text>
              <Card>
                {items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </Card>
            </View>
          );
        })
      )}
    </Screen>
  );
}

function ItemRow({ item }: { item: PantryItem }) {
  const { colors } = useTheme();
  const right = item.stapleLevel
    ? t(`kitchen.staple.${item.stapleLevel}` as StringKey)
    : [item.quantity, item.unit].filter((x) => x !== null).join(" ");
  const levelColor = item.stapleLevel === "out" ? colors.primaryText : item.stapleLevel === "low" ? colors.highlight : colors.textMuted;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", minHeight: 44, alignItems: "center" }}>
      <Text>{item.name}</Text>
      <Text variant="label" color={item.stapleLevel ? levelColor : colors.textMuted}>
        {right}
      </Text>
    </View>
  );
}
