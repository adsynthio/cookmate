// F5: "Check with a photo" while cooking. The photo of the pan is compared only with this step's own cues: carry on,
// a little more, or can't tell. It never says food is safe to eat; the step's safety note always shows, and a step
// with meat, fish or egg always says to cut the biggest piece and check for no pink. The photo isn't kept.
import { useMutation } from "@tanstack/react-query";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect } from "react";
import { View } from "react-native";

import { Button, Card, Text } from "@/design-system/primitives";
import { space } from "@/design-system/tokens";
import { t } from "@/i18n";
import { services } from "@/services";

const SEND_EDGE = 1024;

export function PhotoCheck({ householdId, sessionId, stepNo }: { householdId: string; sessionId: string; stepNo: number }) {
  const check = useMutation({
    mutationFn: async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return null;
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (shot.canceled || !shot.assets[0]) return null;
      const a = shot.assets[0];
      const ctx = ImageManipulator.manipulate(a.uri);
      if (Math.max(a.width, a.height) > SEND_EDGE) ctx.resize(a.width >= a.height ? { width: SEND_EDGE } : { height: SEND_EDGE });
      const small = await (await ctx.renderAsync()).saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
      return services.cooking.photoCheck({ householdId, sessionId, image: small.base64 ?? "" });
    },
  });
  const { reset } = check;
  // A new step, a new question.
  useEffect(() => reset(), [stepNo, reset]);
  const r = check.data;

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ alignSelf: "flex-start" }}>
        <Button kind="quiet" icon="camera" label={check.isPending ? t("photo.checking") : t("photo.open")} disabled={check.isPending} onPress={() => check.mutate()} />
      </View>
      {r ? (
        <Card style={{ gap: space.xs }}>
          {r.verdict === "unavailable" ? (
            <Text muted>{t("photo.unavailable")}</Text>
          ) : (
            <>
              <Text weight={600}>{t(`photo.verdict.${r.verdict}`)}</Text>
              {r.note ? <Text>{r.note}</Text> : null}
              {r.cutCheck ? <Text weight={600}>{t("photo.cutCheck")}</Text> : null}
              {r.safetyNote ? <Text muted>⚠️ {r.safetyNote}</Text> : null}
              <Text variant="caption" muted>
                {t("photo.disclaimer")}
              </Text>
            </>
          )}
        </Card>
      ) : null}
      {check.isError ? <Text muted>{t("state.error.body")}</Text> : null}
    </View>
  );
}
