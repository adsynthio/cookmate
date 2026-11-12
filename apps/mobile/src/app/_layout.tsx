import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { NotoSansDevanagari_400Regular } from "@expo-google-fonts/noto-sans-devanagari/400Regular";
import { NotoSansDevanagari_500Medium } from "@expo-google-fonts/noto-sans-devanagari/500Medium";
import { NotoSansDevanagari_600SemiBold } from "@expo-google-fonts/noto-sans-devanagari/600SemiBold";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { TimerAlarm } from "@/components/cook/TimerAlarm";
import { StateView } from "@/design-system/primitives";
import { useReducedMotion } from "@/design-system/motion";
import { ThemeProvider, useTheme } from "@/design-system/theme";
import { localeFromLanguageCode } from "@/domain/onboarding";
import { setLocale, t, useLocale } from "@/i18n";
import { services } from "@/services";
import { track } from "@/services/analytics";
import { listenForPickTaps } from "@/state/push";
import { useSession } from "@/state/session";

/**
 * On launch, look for this device's household. With one, the tabs are reachable; without one, only onboarding is
 * (ONB-01). Stack.Protected does the redirecting, so deep links can't skip onboarding either.
 */
function useBootstrap() {
  const setHousehold = useSession((s) => s.setHousehold);
  const setReady = useSession((s) => s.setReady);
  const [failed, setFailed] = useState(false);

  const boot = useCallback(async () => {
    setFailed(false);
    try {
      const ref = await services.auth.getCurrentHousehold();
      if (ref) {
        const locale = localeFromLanguageCode(ref.languageCode);
        if (locale) setLocale(locale);
        setHousehold(ref.householdId, ref.memberId);
      }
      setReady();
    } catch {
      // Don't send a returning user through onboarding just because the network is down.
      setFailed(true);
    }
  }, [setHousehold, setReady]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // KIT-045: a tap on the daily pick notification opens its batch on Home.
  useEffect(() => listenForPickTaps(), []);

  // KIT-130: app_open on launch and whenever the app comes back to the front (retention KPI).
  useEffect(() => {
    track("app_open");
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") track("app_open");
    });
    return () => sub.remove();
  }, []);

  return { failed, retry: boot };
}

/** Only the weights the type scale uses (fonts in tokens.ts). If loading fails we carry on with system fonts. */
const FONTS = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
};

function RootNavigator() {
  useLocale();
  const { scheme, colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [fontsLoaded, fontError] = useFonts(FONTS);
  const ready = useSession((s) => s.ready) && (fontsLoaded || !!fontError);
  const onboarded = useSession((s) => s.householdId !== null);
  const { failed, retry } = useBootstrap();

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
          // Pushed screens slide in from the side; with "reduce motion" they fade instead.
          animation: reduceMotion ? "fade" : "slide_from_right",
          animationDuration: 280,
        }}
      >
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="pantry/add" options={{ presentation: "modal" }} />
          <Stack.Screen name="pantry/[id]" />
          <Stack.Screen name="pantry/scan" />
          <Stack.Screen name="pantry/yesterday" options={{ presentation: "modal" }} />
          <Stack.Screen name="recipe/[id]" />
          <Stack.Screen name="search" />
          <Stack.Screen name="list" />
          <Stack.Screen name="adapt/[id]" options={{ presentation: "modal" }} />
          <Stack.Screen name="invent" options={{ presentation: "modal" }} />
          <Stack.Screen name="cook/[id]" options={{ gestureEnabled: false }} />
          <Stack.Screen name="rescue/[id]" options={{ presentation: "modal" }} />
          <Stack.Screen name="assist/[id]" options={{ presentation: "modal" }} />
          <Stack.Screen name="voice" options={{ presentation: "modal" }} />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
      </Stack>
      <TimerAlarm />
      {!ready ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.canvas }]}>
          {failed ? (
            <StateView
              state="offline"
              title={t("state.offline.title")}
              body={t("state.error.body")}
              actionLabel={t("state.retry")}
              onAction={() => void retry()}
            />
          ) : (
            <StateView state="loading" title="Cookmate" />
          )}
        </View>
      ) : null}
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    // networkMode "always": the services decide what to do with no network (KIT-076 falls back to what the phone
    // kept and queues writes), so queries and mutations must still run instead of pausing until it's back.
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, retry: 2, networkMode: "always" }, mutations: { networkMode: "always" } },
      }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RootNavigator />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  overlay: { justifyContent: "center", padding: 24 },
});
