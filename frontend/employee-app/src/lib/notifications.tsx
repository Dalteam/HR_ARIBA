// Bell state (legacy V118): the feed comes from the server, "read" is a last-seen time kept on the device.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { notifications, type Notification } from "./api";
import { useAuth } from "./auth";

const POLL_MS = 60_000;

type Bell = { items: Notification[]; unread: number; refresh: () => Promise<void>; markAllRead: () => Promise<void> };

const Ctx = createContext<Bell>({ items: [], unread: 0, refresh: async () => {}, markAllRead: async () => {} });

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);

  const refresh = useCallback(async () => {
    if (!user || user.must_change_password) return;
    try {
      setItems(await notifications.mine());
    } catch {
      // keep the last list when offline
    }
  }, [user]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    try {
      await notifications.markAllRead();
      setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    } catch {
      // Keep the existing list when the server is temporarily unavailable.
    }
  }, []);

  const unread = items.filter((n) => !n.is_read).length;
  return <Ctx.Provider value={{ items, unread, refresh, markAllRead }}>{children}</Ctx.Provider>;
}

export const useBell = () => useContext(Ctx);
