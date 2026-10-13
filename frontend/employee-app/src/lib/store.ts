// Key/value storage: the device keychain (expo-secure-store) on iOS/Android, localStorage on web (dev preview only).
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const web = Platform.OS === "web";

export const store = {
  get: (k: string) => (web ? Promise.resolve(globalThis.localStorage?.getItem(k) ?? null) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (web ? Promise.resolve(globalThis.localStorage?.setItem(k, v)) : SecureStore.setItemAsync(k, v)),
  del: (k: string) => (web ? Promise.resolve(globalThis.localStorage?.removeItem(k)) : SecureStore.deleteItemAsync(k)),
};
