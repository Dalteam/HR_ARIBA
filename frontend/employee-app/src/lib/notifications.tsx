// Bell state (legacy V118): the feed comes from the server, "read" is a last-seen time kept on the device.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { notifications, type Notification } from "./api";
import { useAuth } from "./auth";

const SEEN = "ariba.notifications_seen";
const POLL_MS = 60_000;

type Bell = { items: Notification[]; unread: number; seenAt: number; refresh: () => Promise<void>; markAllRead: () => Promise<void> };

const Ctx = createContext<Bell>({ items: [], unread: 0, seenAt: 0, refresh: async () => {}, markAllRead: async () => {} });

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [seenAt, setSeenAt] = useState(0);

  const refresh = useCallback(async () => {
    if (!user || user.must_change_password) return;
    try {
      setItems(await notifications.mine());
    } catch {
      // keep the last list when offline
    }
  }, [user]);

  useEffect(() => {
    SecureStore.getItemAsync(SEEN).then((v) => setSeenAt(Number(v) || 0));
  }, []);

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
    const now = Date.now();
    setSeenAt(now);
    await SecureStore.setItemAsync(SEEN, String(now));
  }, []);

  const unread = items.filter((n) => new Date(n.at).getTime() > seenAt).length;
  return <Ctx.Provider value={{ items, unread, seenAt, refresh, markAllRead }}>{children}</Ctx.Provider>;
}

export const useBell = () => useContext(Ctx);
