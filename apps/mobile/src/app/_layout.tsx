import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { StateView } from "@/design-system/primitives";
import { ThemeProvider, useTheme } from "@/design-system/theme";
import { localeFromLanguageCode } from "@/domain/onboarding";
import { setLocale, t, useLocale } from "@/i18n";
import { services } from "@/services";
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

  return { failed, retry: boot };
}

function RootNavigator() {
  useLocale();
  const { scheme, colors } = useTheme();
  const ready = useSession((s) => s.ready);
  const onboarded = useSession((s) => s.householdId !== null);
  const { failed, retry } = useBootstrap();

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
      </Stack>
      {!ready ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.bg }]}>
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
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 2 } } }),
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
