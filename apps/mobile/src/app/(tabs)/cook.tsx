// Cook With Me lands in Sprint 4 (COOK-01..11). Until then this tab explains how to start.
import { Screen, StateView, Text } from "@/design-system/primitives";
import { t } from "@/i18n";

export default function CookScreen() {
  return (
    <Screen>
      <Text variant="display">{t("cook.title")}</Text>
      <StateView state="empty" title={t("cook.empty")} />
    </Screen>
  );
}
