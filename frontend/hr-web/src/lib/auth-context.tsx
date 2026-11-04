"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Role, User } from "./api";
import { fetchMe, logout } from "./auth";
import { allows, myPermissions, type Level, type Levels, type Module } from "./permissions";
import { getAccessToken, getRefreshToken } from "./session";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  /** my role's 19 levels from GET /me/permissions (null until loaded, or for a role with no HR side) */
  perms: Levels | null;
  /** the permission matrix: does my role reach `need` on any of `modules`? (Stage 11) */
  can: (modules: Module | Module[], need?: Level) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [perms, setPerms] = useState<Levels | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!getAccessToken() && !getRefreshToken()) {
      setUser(null);
      setPerms(null);
      setLoading(false);
      return;
    }
    try {
      const me = await fetchMe();
      // an older API without /me/permissions leaves the portal on its role checks (perms stays null)
      setPerms(await myPermissions().then((p) => p.perms).catch(() => null));
      setUser(me);
    } catch {
      setUser(null);
      setPerms(null);
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
  const can = useCallback((modules: Module | Module[], need: Level = "view") => allows(perms, modules, need), [perms]);

  return <AuthContext.Provider value={{ user, loading, reload, signOut, hasRole, perms, can }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
