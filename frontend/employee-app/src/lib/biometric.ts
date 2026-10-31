// «تذكرني» and sign-in with Face ID / fingerprint (their vault.js + BioAsk, approved plan: expo-local-authentication).
// Remember me keeps only the username. With biometrics on, a copy of the refresh token is kept in the device keychain
// behind the biometric check (expo-secure-store requireAuthentication) — no password is ever stored; signing out keeps
// that copy, «نسيان هذا الجهاز» deletes everything.
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { store } from "./store";

const USER = "ariba.remember_user";
const BIO = "ariba.bio_refresh";
const BIO_ON = "ariba.bio_on";
const NUDGED = "ariba.bio_nudged";
const native = Platform.OS !== "web";
const guarded = { requireAuthentication: true, authenticationPrompt: "الدخول بالبصمة / Face ID" };

export const remembered = () => store.get(USER);
export const remember = (username: string | null) => (username ? store.set(USER, username) : store.del(USER));

export async function biometricAvailable(): Promise<boolean> {
  if (!native) return false;
  try { return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()); } catch { return false; }
}
export const biometricEnabled = async () => native && (await store.get(BIO_ON)) === "1";
export const wasNudged = async () => (await store.get(NUDGED)) === "1";
export const setNudged = () => store.set(NUDGED, "1");

/** Turn on: the device asks for the biometric now, then keeps the current refresh token behind it. */
export async function enableBiometric(refreshToken: string): Promise<{ ok: boolean; msg: string }> {
  if (!(await biometricAvailable())) return { ok: false, msg: "هذا الجهاز ليس عليه بصمة / Face ID مفعّل" };
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: "تفعيل الدخول بالبصمة", cancelLabel: "إلغاء" });
  if (!r.success) return { ok: false, msg: "تم الإلغاء" };
  await SecureStore.setItemAsync(BIO, refreshToken, guarded);
  await store.set(BIO_ON, "1");
  return { ok: true, msg: "✓ تم تفعيل الدخول بالبصمة على هذا الجهاز" };
}
/** Keep the stored copy current after each sign-in / refresh. */
export async function updateBiometricToken(refreshToken: string) {
  if (await biometricEnabled()) { try { await SecureStore.setItemAsync(BIO, refreshToken, guarded); } catch { /* keep the old one */ } }
}
/** Reading it shows the Face ID / fingerprint prompt; returns the refresh token or null. */
export async function biometricUnlock(): Promise<string | null> {
  if (!(await biometricEnabled())) return null;
  try { return await SecureStore.getItemAsync(BIO, guarded); } catch { return null; }
}
export async function forgetDevice() {
  await Promise.all([store.del(USER), store.del(BIO_ON), store.del(NUDGED), native ? SecureStore.deleteItemAsync(BIO).catch(() => {}) : Promise.resolve()]);
}
