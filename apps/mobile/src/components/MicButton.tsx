// VOICE-01: one mic button, same placement on every tab. Wired to the LiveKit voice session in Sprint 4.
import { Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "@/design-system/theme";
import { touch } from "@/design-system/tokens";
import { t } from "@/i18n";
import { useSession } from "@/state/session";

export function MicButton() {
  const { colors } = useTheme();
  const voice = useSession((s) => s.voice);
  const active = voice !== "idle" && voice !== "error";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("mic.label")}
      accessibilityState={{ busy: voice === "connecting" || voice === "thinking" }}
      onPress={() => {}}
      style={[styles.button, { backgroundColor: active ? colors.primary : colors.surface, borderColor: colors.border }]}
    >
      {/* Simple mic glyph from shapes so it reads at any text scale without an icon font. */}
      <View style={[styles.capsule, { borderColor: active ? colors.onPrimary : colors.text }]} />
      <View style={[styles.stem, { backgroundColor: active ? colors.onPrimary : colors.text }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: touch.cook, height: touch.cook, borderRadius: touch.cook / 2, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  capsule: { width: 14, height: 20, borderRadius: 7, borderWidth: 2 },
  stem: { width: 2, height: 6, marginTop: 1 },
});
