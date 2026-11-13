// KIT-160/161/162 scanning, from the Stitch "Show me your kitchen" camera screen: Fridge and shelf, Shop bill or
// Barcode on top, the camera in a large rounded frame with a short instruction over it, and a big terracotta
// shutter. A photo is made smaller on the phone, read once by the scan-pantry function and never kept; barcodes
// pile up as you scan packets. Either way the cook checks the items on the add screen before anything is saved.
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, StyleSheet, View } from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { draftName } from "@/components/kitchen/names";
import { Icon, type IconName } from "@/design-system/icons";
import { ingredientImage, scenes } from "@/design-system/media";
import { Enter, Layout, PressableScale, Pulse } from "@/design-system/motion";
import { Button, Photo, Screen, Text } from "@/design-system/primitives";
import { useTheme } from "@/design-system/theme";
import { radius, shadow, space } from "@/design-system/tokens";
import { catalogEntry } from "@/data/catalog";
import { mergeTray } from "@/domain/scanTray";
import type { ToolKey } from "@/domain/tools";
import { t, useLocale, type StringKey } from "@/i18n";
import { services, type DraftItem } from "@/services";
import { useScan } from "@/state/scan";
import { useSession } from "@/state/session";

type Mode = "photo" | "barcode";
const MODES: { key: Mode; icon: IconName }[] = [
  { key: "photo", icon: "camera" },
  { key: "barcode", icon: "barcode" },
];
/** Long edge of the photo sent for reading: sharp enough for a bill, small enough to send quickly. */
const SEND_EDGE = 1600;
/** Photos picked from the gallery at once. */
const PICK_LIMIT = 6;
const MOCK = process.env.EXPO_PUBLIC_USE_MOCKS === "1";

export default function ScanScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const householdId = useSession((s) => s.householdId)!;
  const hand = useScan((s) => s.hand);
  const [mode, setMode] = useState<Mode>("photo");
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  // Photos are read in the background so the cook can keep shooting; the tray gathers what they find.
  const [reading, setReading] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [photos, setPhotos] = useState(0);
  const [usedBarcode, setUsedBarcode] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [tray, setTray] = useState<DraftItem[]>([]);
  const [appliances, setAppliances] = useState<ToolKey[]>([]);
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  const looking = useRef(false);
  // The web build has no reliable camera access (and none inside a preview page): it shows a sample scene.
  const noCamera = Platform.OS === "web";

  const finish = () => {
    hand(tray, photos > 0 ? "camera" : usedBarcode ? "barcode" : "camera", appliances);
    router.replace("/pantry/add");
  };

  const read = async (image: string) => {
    setReading((n) => n + 1);
    setNote(null);
    try {
      const r = await services.kitchen.scanItems({ householdId, kind: "photo", image, mediaType: "image/jpeg" });
      if (r.appliances?.length) setAppliances((a) => [...new Set([...a, ...r.appliances!])]);
      if (r.items.length) {
        setTray((t) => mergeTray(t, r.items));
        setPhotos((n) => n + 1);
      } else setNote(r.source === "not_configured" ? t("scan.notOn") : t("scan.shotEmpty"));
    } catch {
      setNote(t("scan.shotFailed"));
    } finally {
      setReading((n) => n - 1);
    }
  };

  /** Makes a photo small enough to send quickly, then reads it in the background. */
  const shrinkAndRead = async (uri: string, width: number, height: number) => {
    const ctx = ImageManipulator.manipulate(uri);
    if (Math.max(width, height) > SEND_EDGE) ctx.resize(width >= height ? { width: SEND_EDGE } : { height: SEND_EDGE });
    const small = await (await ctx.renderAsync()).saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
    void read(small.base64 ?? "");
  };

  const shoot = async () => {
    if (!camera.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      await shrinkAndRead(photo.uri, photo.width, photo.height);
    } catch {
      setNote(t("scan.shotFailed"));
    } finally {
      setCapturing(false);
    }
  };

  /** Photos already on the phone: a bill from earlier, or screenshots of an online order. */
  const pick = async () => {
    if (MOCK && noCamera) return void read("sample");
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: PICK_LIMIT, quality: 1 });
    if (res.canceled) return;
    setMode("photo");
    for (const a of res.assets.slice(0, PICK_LIMIT)) {
      try {
        await shrinkAndRead(a.uri, a.width, a.height);
      } catch {
        setNote(t("scan.shotFailed"));
      }
    }
  };

  const onBarcode = async (r: BarcodeScanningResult) => {
    const now = Date.now();
    // The camera reports the same code many times a second: one lookup per packet.
    if (looking.current || (lastCode.current?.code === r.data && now - lastCode.current.at < 4000)) return;
    lastCode.current = { code: r.data, at: now };
    looking.current = true;
    setNote(null);
    try {
      const found = await services.kitchen.scanItems({ householdId, kind: "barcode", code: r.data });
      if (found.items.length) {
        setTray((t) => mergeTray(t, found.items, "packet"));
        setUsedBarcode(true);
      } else setNote(t("scan.unknownBarcode"));
    } catch {
      setNote(t("scan.error"));
    } finally {
      looking.current = false;
    }
  };

  const showCamera = !noCamera && permission?.granted && Platform.OS !== "web";

  return (
    <Screen tabBar={false} header={<AppHeader title={t("scan.header")} back mic={false} />}>
      <View style={[styles.modes, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="tablist">
        {MODES.map((m) => {
          const on = mode === m.key;
          return (
            <PressableScale
              key={m.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t(`scan.mode.${m.key}` as StringKey)}
              onPress={() => {
                setMode(m.key);
                setNote(null);
              }}
              style={[styles.mode, on && { backgroundColor: colors.primary }]}
            >
              <Icon name={m.icon} size={16} color={on ? colors.onPrimary : colors.inkSecondary} />
              <Text variant="caption" weight={600} color={on ? colors.onPrimary : colors.inkSecondary} numberOfLines={1}>
                {t(`scan.mode.${m.key}` as StringKey)}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <Enter>
        <View style={[styles.frame, (tray.length > 0 || reading > 0) && styles.frameSmall, { backgroundColor: colors.inkSecondary }]}>
          {showCamera ? (
            <CameraView
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={mode === "barcode" ? { barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] } : undefined}
              onBarcodeScanned={mode === "barcode" ? (r) => void onBarcode(r) : undefined}
            />
          ) : scenes.fridgeOpen ? (
            <Image source={scenes.fridgeOpen} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
          ) : null}
          <View style={[styles.caption, { backgroundColor: "rgba(253,249,242,0.9)" }]}>
            <Text variant="subheading" style={styles.center}>
              {t(`scan.title.${mode}` as StringKey)}
            </Text>
            <Text variant="caption" muted style={styles.center}>
              {t(`scan.body.${mode}` as StringKey)}
            </Text>
          </View>
          {mode === "barcode" ? <View style={[styles.target, { borderColor: colors.surface }]} /> : null}
          {capturing ? <View style={[styles.reading, { backgroundColor: "rgba(255,255,255,0.35)" }]} /> : null}
        </View>
      </Enter>

      {!showCamera ? (
        <View style={[styles.panel, shadow.card, { backgroundColor: colors.surface }]}>
          {Platform.OS !== "web" && !permission?.granted ? (
            <>
              <Text muted>{t("scan.allowBody")}</Text>
              <Button kind="primary" icon="camera" label={t("scan.allow")} onPress={() => void requestPermission()} />
            </>
          ) : (
            <>
              <Text muted>{t("scan.noCamera")}</Text>
              {MOCK ? (
                <Button
                  kind="primary"
                  icon="sparkle"
                  label={t("scan.sample")}
                  onPress={() => (mode === "barcode" ? void onBarcode({ data: "8901234567890" } as BarcodeScanningResult) : void read("sample"))}
                />
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {note ? (
        <Text color={colors.alert} accessibilityLiveRegion="polite" style={styles.center}>
          {note}
        </Text>
      ) : null}

      <View style={styles.controls}>
        <SideAction icon="edit" label={t("scan.manual")} onPress={() => router.replace("/pantry/add")} />
        {mode !== "barcode" ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={t("scan.shutter")}
            accessibilityState={{ disabled: capturing || !showCamera, busy: capturing }}
            disabled={capturing || !showCamera}
            onPress={() => void shoot()}
            scaleTo={0.9}
            style={[styles.shutterRing, { borderColor: colors.accentSoft, opacity: showCamera ? 1 : 0.5 }]}
          >
            <View style={[styles.shutter, shadow.glow, { backgroundColor: colors.accent }]}>
              <Icon name="camera" size={30} color={colors.onAccent} />
            </View>
          </PressableScale>
        ) : (
          <View style={styles.shutterRing} />
        )}
        <SideAction icon="image" label={t("scan.gallery")} onPress={() => void pick()} />
      </View>

      {tray.length || reading ? (
        <View style={[styles.panel, shadow.card, { backgroundColor: colors.surface }]}>
          <View style={styles.row}>
            <Pulse color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{tray.length === 1 ? t("scan.trayTitleOne") : t("scan.trayTitle", { n: tray.length })}</Text>
              {photos ? (
                <Text variant="caption" muted>
                  {photos === 1 ? t("scan.trayFromOne") : t("scan.trayFrom", { n: photos })}
                </Text>
              ) : null}
            </View>
          </View>
          {reading ? (
            <View style={styles.row} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.primary} />
              <Text variant="caption" weight={600}>
                {reading === 1 ? t("scan.readingOne") : t("scan.readingN", { n: reading })}
              </Text>
            </View>
          ) : null}
          <View style={styles.wrap}>
            {tray.map((d) => (
              <Layout key={d.key}>
                <View style={[styles.found, { backgroundColor: colors.peach }]}>
                  <Photo source={ingredientImage(d.ingredientKey, catalogEntry(d.ingredientKey)?.category ?? "packaged")} size={24} round />
                  <Text variant="label">{draftName(d)}</Text>
                  <Icon name="checkCircle" size={16} color={colors.peachText} />
                </View>
              </Layout>
            ))}
          </View>
          {tray.length ? (
            <Button
              kind="primary"
              stretch
              iconAfter="forward"
              disabled={reading > 0}
              label={reading > 0 ? t("scan.waitReading") : tray.length === 1 ? t("scan.reviewOne") : t("scan.review", { n: tray.length })}
              onPress={finish}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.privacy}>
        <Icon name="shield" size={16} color={colors.inkTertiary} />
        <Text variant="caption" muted style={{ flex: 1 }}>
          {t("scan.privacy")}
        </Text>
      </View>
    </Screen>
  );
}

function SideAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.side}>
      <View style={[styles.sideIcon, { backgroundColor: colors.surfaceHigh }]}>
        <Icon name={icon} size={22} />
      </View>
      <Text variant="caption" weight={600} style={styles.center}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: "row", borderRadius: radius.pill, padding: 4 },
  mode: { flex: 1, flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, minHeight: 40, paddingHorizontal: 6 },
  frame: { height: 420, borderRadius: radius.cardLg, overflow: "hidden", justifyContent: "flex-start" },
  // Smaller once items arrive, so the shutter and the tray both stay in view.
  frameSmall: { height: 300 },
  caption: { margin: space.lg, borderRadius: radius.item, padding: space.md, gap: 2 },
  center: { textAlign: "center" },
  target: { position: "absolute", left: "15%", right: "15%", top: "40%", height: 110, borderWidth: 3, borderRadius: radius.item },
  reading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: space.sm },
  panel: { borderRadius: radius.card, padding: space.gutter, gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  found: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingLeft: 4, paddingRight: 10, minHeight: 36 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.sm },
  side: { alignItems: "center", gap: 6, width: 96 },
  sideIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  shutterRing: { width: 92, height: 92, borderRadius: 46, borderWidth: 6, alignItems: "center", justifyContent: "center" },
  shutter: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  privacy: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm },
});
