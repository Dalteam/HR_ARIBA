// Push notifications (approved plan: the app gets a push when a notification is written for me; the server sends it
// through Expo every 5 minutes). Needs a real device and the EAS project id (app.json extra.eas.projectId, set when the
// owner builds with EAS); without them nothing is registered and the bell still refreshes on open.
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { push } from "./port";
import { store } from "./store";

const KEY = "ariba.push_token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registerPush(): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") return null;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", { name: "default", importance: Notifications.AndroidImportance.HIGH });
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await push.register(token, Platform.OS);
    await store.set(KEY, token);
    return token;
  } catch {
    return null;
  }
}

/** On sign-out: this device stops receiving my notifications. */
export async function unregisterPush() {
  const token = await store.get(KEY);
  if (!token) return;
  try { await push.unregister(token); } catch { /* the server forgets it when Expo reports it gone */ }
  await store.del(KEY);
}
