// The Drinks tab is off until the cook turns it on, here (setup) or on You.
import { StyleSheet, Switch, View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Card, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { space } from "@/design-system/tokens";
import { t } from "@/i18n";
import { useDrinks } from "@/state/drinks";

export function DrinksToggle() {
  const { colors } = useTheme();
  const on = useDrinks((s) => s.enabled);
  const setEnabled = useDrinks((s) => s.setEnabled);
  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.well, { backgroundColor: on ? colors.primaryPale : colors.surfaceMuted }]}>
          <Icon name="drop" size={20} color={on ? colors.primaryText : colors.inkSecondary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subheading">{t("drinks.toggle")}</Text>
          <Text variant="caption" muted>
            {t("drinks.toggleBody")}
          </Text>
        </View>
        <Switch
          accessibilityLabel={t("drinks.toggle")}
          value={on}
          onValueChange={setEnabled}
          trackColor={{ true: colors.primary, false: colors.line }}
          thumbColor={colors.surface}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  well: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
