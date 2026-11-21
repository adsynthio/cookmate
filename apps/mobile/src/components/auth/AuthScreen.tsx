// The frame of every sign-up and log-in screen: cream page, a scroller the keyboard can't cover, white status-bar
// text over the coloured top, and on the installed iPhone web app the band behind the clock only once that top has
// scrolled away (state/statusBand.ts).
import { useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useStatusBand } from "@/state/statusBand";

import { useAuthLook } from "./look";

/** Widest the sign-in column gets on a tablet or computer. */
export const AUTH_MAX_WIDTH = 520;

export function AuthScreen({ heroHeight, children }: { heroHeight: number; children: ReactNode }) {
  const { colors } = useAuthLook();
  const insets = useSafeAreaInsets();
  const setHeroUnder = useStatusBand((s) => s.setHeroUnder);
  useFocusEffect(
    useCallback(() => {
      setHeroUnder(true);
      return () => setHeroUnder(true);
    }, [setHeroUnder]),
  );
  return (
    <View style={[styles.page, { backgroundColor: colors.canvas }]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
          scrollEventThrottle={32}
          onScroll={Platform.OS === "web" ? (e) => setHeroUnder(e.nativeEvent.contentOffset.y < heroHeight) : undefined}
        >
          <View style={styles.column}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flexGrow: 1 },
  // Clipped at the sides: the tilted ticker and the stickers at the edges run past them, and the page mustn't pan sideways.
  column: { flexGrow: 1, width: "100%", maxWidth: AUTH_MAX_WIDTH, alignSelf: "center", overflow: "hidden" },
});
