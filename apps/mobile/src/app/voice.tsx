// The mic (KIT-063, VOICE-01): asks the backend for a voice session and says plainly where things stand. Joining
// the room itself needs the LiveKit client in a device build; until that ships, every outcome offers typing instead.
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { Icon } from "@/design-system/icons";
import { Button, IconButton, Screen, StateView } from "@/design-system/primitives";
import { LANGUAGE_CODES } from "@/domain/onboarding";
import { getLocale, t, useLocale, type StringKey } from "@/i18n";
import { services } from "@/services";
import { useSession } from "@/state/session";

export default function VoiceScreen() {
  useLocale();
  const router = useRouter();
  const householdId = useSession((s) => s.householdId)!;
  const token = useQuery({
    queryKey: ["voice-token", householdId],
    queryFn: () => services.voice.getToken({ householdId, languageCode: LANGUAGE_CODES[getLocale()] }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const outcome = token.data === "consent_needed" ? "consent" : token.data === "not_configured" ? "soon" : "ready";
  return (
    <Screen>
      <View style={{ flexDirection: "row" }}>
        <IconButton label={t("rescue.close")} onPress={() => router.back()}>
          <Icon name="close" />
        </IconButton>
      </View>
      {token.isPending ? (
        <StateView state="loading" title={t("voice.connecting")} />
      ) : token.isError ? (
        <StateView state="error" title={t("state.error.title")} body={t("state.error.body")} actionLabel={t("state.retry")} onAction={() => void token.refetch()} />
      ) : (
        <>
          <StateView state="empty" title={t(`voice.${outcome}.title` as StringKey)} body={t(`voice.${outcome}.body` as StringKey)} />
          <Button label={t("voice.type")} size="cook" onPress={() => router.replace("/pantry/add")} />
        </>
      )}
    </Screen>
  );
}
