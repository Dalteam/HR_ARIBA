import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, clearSession, hasSession, saveSession, setRefreshListener, type User } from "./api";
import { biometricEnabled, biometricUnlock, updateBiometricToken } from "./biometric";
import { registerPush, unregisterPush } from "./push";

type AuthState = {
  user: User | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<User>;
  /** Face ID / fingerprint: the stored session, after the device's biometric check. */
  signInBiometric: () => Promise<User | null>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (user && !user.must_change_password) registerPush();
  }, [user]);

  useEffect(() => {
    setRefreshListener((rt) => { updateBiometricToken(rt); });
    return () => setRefreshListener(null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (await hasSession()) setUser((await auth.me()).user);
      } catch {
        await clearSession();
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const s = await auth.login(username, password);
    await saveSession(s);
    setUser(s.user);
    return s.user;
  }, []);

  const signInBiometric = useCallback(async () => {
    const rt = await biometricUnlock();
    if (!rt) return null;
    const s = await auth.refreshWith(rt);
    await saveSession(s);
    setUser(s.user);
    return s.user;
  }, []);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    const s = await auth.changePassword(oldPassword, newPassword);
    await saveSession(s);
    setUser(s.user);
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush();
    await auth.logout(await biometricEnabled());
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signInBiometric, changePassword, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
