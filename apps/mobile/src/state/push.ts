// KIT-045: the daily pick notification on this phone. Asks permission, creates the Android channel, and gets the
// Expo push token the notify job sends to. A tap on the notification opens Home on the precomputed batch.
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";

import { t } from "@/i18n";
import { services } from "@/services";

export const PICK_CHANNEL = "daily-pick";
const native = Platform.OS !== "web";

export type PushReady = { token: string; platform: "android" | "ios" } | "denied" | "no_device";

/** Permission plus token. "no_device": web, or a build without an EAS project id (tokens need one). */
export async function preparePush(): Promise<PushReady> {
  if (!native) return "no_device";
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(PICK_CHANNEL, {
        name: t("notify.channel"),
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: "default",
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) return "denied";
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return "no_device";
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: data, platform: Platform.OS === "ios" ? "ios" : "android" };
  } catch {
    return "no_device";
  }
}

/** Open Home on the pick a daily notification was about. Returns an unsubscribe function. */
export function listenForPickTaps(): () => void {
  if (!native) return () => {};
  const open = (r: Notifications.NotificationResponse | null) => {
    const data = r?.notification.request.content.data as { type?: string; batch_id?: string } | undefined;
    if (data?.type === "daily_pick" && data.batch_id) void services.preference.notificationOpened(data.batch_id).catch(() => {});
    if (data?.type === "daily_pick") router.navigate(data.batch_id ? `/?batch=${encodeURIComponent(data.batch_id)}` : "/");
  };
  // Launched by a tap while the app was closed.
  void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
