// The updated design's IdleGuard (its components/IdleGuard.jsx) for the employee app: after 5 minutes without a touch
// a 3-minute countdown appears («تمديد الجلسة» or «تسجيل الخروج»); when it runs out the session is closed. Coming
// back to the app after the whole 8 minutes signs out at once. React Native only (Modal, AppState, a touch-capturing
// wrapper), so it works in Expo Go and on the web. The design also renews its token on activity; ours keeps the
// refresh the API client already does on every call.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Modal, Pressable, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/i18n";
import { T } from "@/components/text";
import { useTheme } from "@/theme";

const IDLE_MS = 5 * 60 * 1000;
const WARN_MS = 3 * 60 * 1000;
const fmt = (ms: number) => { let s = Math.max(0, Math.ceil(ms / 1000)); const m = Math.floor(s / 60); s %= 60; return m + ":" + (s < 10 ? "0" : "") + s; };

export function IdleGuard({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { lang } = useLang();
  const t = useTheme();
  const L = (ar: string, en: string) => (lang === "en" ? en : ar);
  const last = useRef(Date.now());
  const [left, setLeft] = useState<number | null>(null);
  const leftRef = useRef<number | null>(null);
  leftRef.current = left;
  const out = useCallback(() => { setLeft(null); void signOut(); }, [signOut]);

  useEffect(() => {
    if (!user) return;
    last.current = Date.now();
    const iv = setInterval(() => {
      const idle = Date.now() - last.current;
      if (idle >= IDLE_MS + WARN_MS) return out();
      setLeft(idle >= IDLE_MS ? IDLE_MS + WARN_MS - idle : null);
    }, 1000);
    // back from the background: the time away counts as idle time
    const sub = AppState.addEventListener("change", (s) => { if (s === "active" && Date.now() - last.current >= IDLE_MS + WARN_MS) out(); });
    return () => { clearInterval(iv); sub.remove(); };
  }, [user, out]);

  // any touch counts as activity while the countdown is not showing; the touch still reaches the screen
  const mark = () => { if (leftRef.current === null) last.current = Date.now(); return false; };
  return (
    <View style={{ flex: 1 }} onStartShouldSetResponderCapture={mark} onMoveShouldSetResponderCapture={mark}>
      {children}
      {user && left !== null && (
        <Modal transparent animationType="fade" visible onRequestClose={() => { last.current = Date.now(); setLeft(null); }}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,.65)", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <View accessibilityRole="alert" style={{ backgroundColor: t.c, borderRadius: 16, maxWidth: 380, width: "100%", padding: 22, alignItems: "center", gap: 8 }}>
              <T size={34}>⏳</T>
              <T size={16} weight={800} center>{L("هل ما زلت هنا؟", "Are you still there?")}</T>
              <T size={13} color={t.mu} center>{L("لم نرصد أي نشاط منذ 5 دقائق. ستُغلق الجلسة تلقائيًا بعد:", "No activity for 5 minutes. The session will close automatically in:")}</T>
              <T size={30} weight={900} color={t.rd} center style={{ writingDirection: "ltr" }}>{fmt(left)}</T>
              <View style={{ flexDirection: "row", gap: 8, width: "100%", marginTop: 8 }}>
                <Pressable onPress={out} style={{ flex: 1, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: t.bd, alignItems: "center" }}>
                  <T weight={700}>{L("تسجيل الخروج", "Sign out")}</T>
                </Pressable>
                <Pressable onPress={() => { last.current = Date.now(); setLeft(null); }} style={{ flex: 1, padding: 11, borderRadius: 10, backgroundColor: t.gr, alignItems: "center" }}>
                  <T weight={700} color="#fff">{L("تمديد الجلسة", "Extend session")}</T>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
