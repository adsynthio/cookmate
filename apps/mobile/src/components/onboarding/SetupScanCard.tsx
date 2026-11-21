// The camera card on the kitchen step of setup (KIT-024, KIT-160). Reading a photo needs the kitchen, which doesn't
// exist until the last step, so photos are taken or picked here and kept on the phone. The last step reads them, and
// the cook checks what they show before anything is added.
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Image, Platform, StyleSheet, View } from "react-native";

import { shrinkPhoto } from "@/components/scan/shrinkPhoto";
import { Icon } from "@/design-system/icons";
import { PressableScale } from "@/design-system/motion";
import { Badge, Button, Card, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, space } from "@/design-system/tokens";
import { t } from "@/i18n";
import { SETUP_PHOTO_LIMIT, useOnboarding } from "@/state/onboarding";

export function SetupScanCard() {
  const { colors } = useTheme();
  const photos = useOnboarding((s) => s.photos);
  const addPhotos = useOnboarding((s) => s.addPhotos);
  const removePhoto = useOnboarding((s) => s.removePhoto);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"failed" | "camera" | null>(null);
  const room = SETUP_PHOTO_LIMIT - photos.length;

  const keep = async (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled) return;
    setBusy(true);
    const made: string[] = [];
    let lost = false;
    // One at a time: a phone photo is large.
    for (const a of res.assets.slice(0, room)) {
      try {
        made.push(await shrinkPhoto(a.uri));
      } catch {
        lost = true;
      }
    }
    if (made.length) addPhotos(made);
    setProblem(lost ? "failed" : null);
    setBusy(false);
  };

  const take = async () => {
    setProblem(null);
    try {
      // On the web the camera has to open straight from the tap (a browser allows it only then), so nothing is awaited
      // first; the browser asks for the camera itself.
      if (Platform.OS !== "web" && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return setProblem("camera");
      await keep(await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], cameraType: ImagePicker.CameraType.back, quality: 1 }));
    } catch {
      setBusy(false);
      setProblem("failed");
    }
  };

  const pick = async () => {
    setProblem(null);
    try {
      await keep(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: room, quality: 1 }));
    } catch {
      setBusy(false);
      setProblem("failed");
    }
  };

  return (
    <Card tone="primary">
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: "rgba(255,255,255,0.16)" }]}>
          <Icon name="camera" size={26} color={colors.onPrimary} />
        </View>
        <View style={{ flex: 1, gap: space.xs }}>
          <Badge label={t("onb.k.scan.badge")} tone="onColor" />
          <Text variant="heading" color={colors.onPrimary}>
            {t("onb.k.scan.title")}
          </Text>
          <Text variant="caption" color={colors.onPrimary} style={{ opacity: 0.85 }}>
            {t("onb.k.scan.body")}
          </Text>
        </View>
      </View>

      {photos.length ? (
        <>
          <View style={styles.thumbs}>
            {photos.map((p, i) => (
              <PressableScale
                key={`${i}-${p.length}`}
                accessibilityRole="button"
                accessibilityLabel={t("onb.k.scan.remove", { n: i + 1 })}
                onPress={() => removePhoto(i)}
                style={styles.thumbWrap}
              >
                <Image source={{ uri: `data:image/jpeg;base64,${p}` }} style={styles.thumb} accessible={false} />
                <View style={[styles.x, { backgroundColor: colors.ink }]}>
                  <Icon name="close" size={12} color={colors.surface} />
                </View>
              </PressableScale>
            ))}
          </View>
          <Text variant="caption" color={colors.onPrimary} accessibilityLiveRegion="polite">
            {photos.length === 1 ? t("onb.k.scan.waitingOne") : t("onb.k.scan.waiting", { n: photos.length })}
          </Text>
        </>
      ) : null}

      {busy ? (
        <View style={styles.busy} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.onPrimary} />
          <Text variant="label" color={colors.onPrimary}>
            {t("onb.k.scan.preparing")}
          </Text>
        </View>
      ) : room > 0 ? (
        <View style={styles.actions}>
          <Button kind="light" stretch icon="camera" label={t("scan.shutter")} onPress={() => void take()} />
          <Button kind="light" stretch icon="image" label={t("scan.gallery")} onPress={() => void pick()} />
        </View>
      ) : null}

      {problem ? (
        <Text variant="caption" weight={600} color={colors.onPrimary} accessibilityLiveRegion="polite">
          {t(problem === "camera" ? "scan.allowBody" : "onb.k.scan.failed")}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.lg, alignItems: "flex-start" },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  thumbWrap: { width: 64, height: 64 },
  thumb: { width: 64, height: 64, borderRadius: radius.item },
  x: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  busy: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48 },
  actions: { gap: space.sm },
});
