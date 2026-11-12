// KIT-160/161/162 scanning, from the Stitch "Show me your kitchen" camera screen: Fridge and shelf, Shop bill or
// Barcode on top, the camera in a large rounded frame with a short instruction over it, and a big terracotta
// shutter. A photo is made smaller on the phone, read once by the scan-pantry function and never kept; barcodes
// pile up as you scan packets. Either way the cook checks the items on the add screen before anything is saved.
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
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
import { t, useLocale, type StringKey } from "@/i18n";
import { services, type AddedVia, type DraftItem } from "@/services";
import { useScan } from "@/state/scan";
import { useSession } from "@/state/session";

type Mode = "fridge" | "bill" | "barcode";
const MODES: { key: Mode; icon: IconName }[] = [
  { key: "fridge", icon: "fridge" },
  { key: "bill", icon: "receipt" },
  { key: "barcode", icon: "barcode" },
];
const VIA: Record<Mode, AddedVia> = { fridge: "camera", bill: "receipt", barcode: "barcode" };
/** Long edge of the photo sent for reading: sharp enough for a bill, small enough to send quickly. */
const SEND_EDGE = 1600;
const MOCK = process.env.EXPO_PUBLIC_USE_MOCKS === "1";

export default function ScanScreen() {
  useLocale();
  const router = useRouter();
  const { colors } = useTheme();
  const householdId = useSession((s) => s.householdId)!;
  const hand = useScan((s) => s.hand);
  const [mode, setMode] = useState<Mode>("fridge");
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [scanned, setScanned] = useState<DraftItem[]>([]);
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  // The web build has no reliable camera access (and none inside a preview page): it shows a sample scene.
  const noCamera = Platform.OS === "web";

  const finish = (items: DraftItem[], via: AddedVia) => {
    hand(items, via);
    router.replace("/pantry/add");
  };

  const read = async (image: string) => {
    if (mode === "barcode") return;
    setBusy(true);
    setNote(null);
    try {
      const r = await services.kitchen.scanItems({ householdId, kind: mode, image, mediaType: "image/jpeg" });
      if (r.items.length) return finish(r.items, VIA[mode]);
      setNote(r.source === "not_configured" ? t("scan.notOn") : t("scan.nothing"));
    } catch {
      setNote(t("scan.error"));
    } finally {
      setBusy(false);
    }
  };

  const shoot = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      const longEdge = Math.max(photo.width, photo.height);
      const ctx = ImageManipulator.manipulate(photo.uri);
      if (longEdge > SEND_EDGE) ctx.resize(photo.width >= photo.height ? { width: SEND_EDGE } : { height: SEND_EDGE });
      const small = await (await ctx.renderAsync()).saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
      await read(small.base64 ?? "");
    } catch {
      setNote(t("scan.error"));
      setBusy(false);
    }
  };

  const onBarcode = async (r: BarcodeScanningResult) => {
    const now = Date.now();
    // The camera reports the same code many times a second: one lookup per packet.
    if (busy || (lastCode.current?.code === r.data && now - lastCode.current.at < 4000)) return;
    lastCode.current = { code: r.data, at: now };
    setBusy(true);
    setNote(null);
    try {
      const found = await services.kitchen.scanItems({ householdId, kind: "barcode", code: r.data });
      if (found.items.length) setScanned((s) => [...s, ...found.items]);
      else setNote(t("scan.unknownBarcode"));
    } catch {
      setNote(t("scan.error"));
    } finally {
      setBusy(false);
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
        <View style={[styles.frame, { backgroundColor: colors.inkSecondary }]}>
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
          {busy ? (
            <View style={[styles.reading, { backgroundColor: "rgba(28,28,24,0.55)" }]}>
              <ActivityIndicator color="#FFFFFF" />
              <Text color="#FFFFFF" weight={500}>
                {mode === "barcode" ? "…" : t("scan.reading")}
              </Text>
            </View>
          ) : null}
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
                  disabled={busy}
                  onPress={() => (mode === "barcode" ? void onBarcode({ data: "8901234567890" } as BarcodeScanningResult) : void read("sample"))}
                />
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {mode === "barcode" && scanned.length ? (
        <View style={[styles.panel, shadow.card, { backgroundColor: colors.surface }]}>
          <View style={styles.row}>
            <Pulse color={colors.primary} />
            <Text variant="bodyStrong">{t("scan.found", { n: scanned.length })}</Text>
          </View>
          <View style={styles.wrap}>
            {scanned.map((d) => (
              <Layout key={d.key}>
                <View style={[styles.found, { backgroundColor: colors.peach }]}>
                  <Photo source={ingredientImage(d.ingredientKey, catalogEntry(d.ingredientKey)?.category ?? "packaged")} size={24} round />
                  <Text variant="label">{draftName(d)}</Text>
                  <Icon name="checkCircle" size={16} color={colors.peachText} />
                </View>
              </Layout>
            ))}
          </View>
          <Button
            kind="primary"
            stretch
            iconAfter="forward"
            label={scanned.length === 1 ? t("scan.reviewOne") : t("scan.review", { n: scanned.length })}
            onPress={() => finish(scanned, "barcode")}
          />
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
            accessibilityState={{ disabled: busy || !showCamera, busy }}
            disabled={busy || !showCamera}
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
        <SideAction icon="barcode" label={t("scan.mode.barcode")} onPress={() => setMode("barcode")} />
      </View>

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
