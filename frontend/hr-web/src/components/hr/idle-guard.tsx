"use client";

import { useEffect, useRef, useState } from "react";
import { StatusIcon } from "@/components/common/status-icon";
import { fetchMe } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/i18n/locale";

// The updated design's idle prompt (its components/IdleGuard.jsx): after 5 minutes without activity a 3-minute
// countdown appears (extend or sign out); when it runs out, the session ends and the sign-in screen says why.
export const IDLE_MS = 5 * 60 * 1000;
export const WARN_MS = 3 * 60 * 1000;
export const LOGOUT_REASON_KEY = "ariba_logout_reason";

const card: React.CSSProperties = { background: "#fff", color: "#111", borderRadius: 16, maxWidth: 380, width: "100%", padding: 22, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.4)" };
const bs = (primary: boolean): React.CSSProperties => ({
  flex: 1, padding: 11, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  border: primary ? "none" : "1px solid #ccc", background: primary ? "#29B35E" : "#fff", color: primary ? "#fff" : "#333",
});
const fmt = (ms: number) => {
  let s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  s %= 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
};

export function IdleGuard() {
  const { user, signOut } = useAuth();
  const { lang } = useLocale();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const last = useRef(0);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!last.current) last.current = Date.now();
    const leave = (why: string) => {
      try {
        sessionStorage.setItem(LOGOUT_REASON_KEY, why);
      } catch {
        /* storage blocked */
      }
      void signOut();
    };
    const mark = () => {
      if (left === null) last.current = Date.now();
    };
    const evs = ["click", "keydown", "pointerdown", "touchstart", "scroll", "wheel", "mousemove"] as const;
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true, capture: true }));
    const iv = setInterval(() => {
      if (!user) return;
      const idle = Date.now() - last.current;
      if (idle >= IDLE_MS + WARN_MS) return leave("idle");
      setLeft(idle >= IDLE_MS ? IDLE_MS + WARN_MS - idle : null);
    }, 1000);
    const vis = () => {
      if (document.visibilityState === "visible" && user && Date.now() - last.current >= IDLE_MS + WARN_MS) leave("idle");
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, mark, { capture: true }));
      clearInterval(iv);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [left, user, signOut]);

  if (left === null) return null;
  return (
    <div id="ariba-idle-prompt" role="alertdialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 2147483647, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={card}>
        <div style={{ fontSize: 34 }}><StatusIcon name="wait" size={34} /></div>
        <div style={{ fontWeight: 800, fontSize: 16, margin: "8px 0" }}>{T("هل ما زلت هنا؟", "Are you still there?")}</div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
          {T("لم نرصد أي نشاط منذ 5 دقائق. ستُغلق الجلسة تلقائيًا بعد:", "No activity for 5 minutes. The session will close automatically in:")}
        </div>
        <div id="ax-idle-left" style={{ fontSize: 30, fontWeight: 900, color: "#b45309", direction: "ltr", marginBottom: 16 }}>
          {fmt(left)}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={bs(false)} onClick={() => void signOut()}>
            {T("تسجيل الخروج", "Sign out")}
          </button>
          <button
            type="button"
            style={bs(true)}
            onClick={() => {
              last.current = Date.now();
              setLeft(null);
              // one authenticated call renews the session (our request() refreshes the token when needed)
              fetchMe().catch(() => {
                try {
                  sessionStorage.setItem(LOGOUT_REASON_KEY, "refresh_failed");
                } catch {
                  /* storage blocked */
                }
                void signOut();
              });
            }}
          >
            {T("تمديد الجلسة", "Extend session")}
          </button>
        </div>
      </div>
    </div>
  );
}
