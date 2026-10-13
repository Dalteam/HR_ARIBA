import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, clearSession, hasSession, saveSession, type User } from "./api";

type AuthState = {
  user: User | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<User>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

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

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    const s = await auth.changePassword(oldPassword, newPassword);
    await saveSession(s);
    setUser(s.user);
  }, []);

  const signOut = useCallback(async () => {
    await auth.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, signIn, changePassword, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
