// Haptics for the moments that earn them (a punch, a sent request, an error, a tab change) — nothing on the web.
// Calls are deferred a tick and throttled so a burst of taps can never queue up on the native side.
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { diagOff } from "./diag";

const on = Platform.OS !== "web" && !diagOff("haptics");
let last = 0;
const run = (fn: () => Promise<void>) => {
  if (!on) return;
  const now = Date.now();
  if (now - last < 60) return;
  last = now;
  setTimeout(() => { fn().catch(() => {}); }, 0);
};

export const tap = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const press = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
export const success = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const warning = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
export const error = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
export const select = () => run(() => Haptics.selectionAsync());
