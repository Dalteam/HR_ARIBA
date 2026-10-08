"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Role, User } from "./api";
import { fetchMe, logout } from "./auth";
import { getAccessToken, getRefreshToken } from "./session";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!getAccessToken() && !getRefreshToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await fetchMe());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial session check against the backend (the source of truth for role and status).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const signOut = useCallback(async () => {
    await logout();
    setUser(null);
    router.replace(window.location.pathname.startsWith("/me") ? "/me/login" : "/login");
    router.refresh();
  }, [router]);

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user]);

  return <AuthContext.Provider value={{ user, loading, reload, signOut, hasRole }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
