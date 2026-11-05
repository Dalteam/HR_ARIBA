"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/common/toast";
import { request } from "@/lib/api";
import { useLocale } from "@/lib/i18n/locale";

// The updated design's HR bell (its components/HrBell.jsx): a counter, a panel, and a toast when a new entry
// arrives, checked every 3 seconds while the page is visible (the design's pace). It reads OUR
// GET /me/notifications and marks read through POST /me/notifications/read; the backend decides what HR sees
// (announcements and greetings are never forwarded through the HR pool, Stage 7).

type Note = { id: string; kind: string; title: string; body: string | null; at: string; target: string; is_read: boolean };

const BELL =
  '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
const KIC: Record<string, string> = {
  template:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  request:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  ok: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/></svg>',
  no: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
};
const iconKind = (n: Note) => {
  if (n.kind === "template") return "template";
  if (n.kind === "request") return "request";
  if (n.kind === "no" || /⚠|رفض|اعترض|reject|object/i.test(n.title)) return "no";
  return "ok";
};

export function HrBell() {
  const { lang } = useLocale();
  const T = useCallback((ar: string, en: string) => (lang === "en" ? en : ar), [lang]);
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [ring, setRing] = useState(false);
  const [top, setTop] = useState(56);
  const known = useRef<string[] | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const unread = items.filter((n) => !n.is_read).length;

  const ago = useCallback(
    (ts: string) => {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "";
      const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
      if (s < 60) return T("الآن", "just now");
      if (s < 3600) return T("منذ " + Math.floor(s / 60) + " د", Math.floor(s / 60) + "m ago");
      if (s < 86400) return T("منذ " + Math.floor(s / 3600) + " س", Math.floor(s / 3600) + "h ago");
      if (s < 172800) return T("أمس", "yesterday");
      return d.toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-ca-gregory-nu-latn", { day: "2-digit", month: "2-digit", year: "numeric" });
    },
    [T, lang],
  );

  const refresh = useCallback(async () => {
    try {
      const its = await request<Note[]>("/me/notifications");
      setErr("");
      const un = its.filter((n) => !n.is_read).map((n) => n.id);
      const fresh = known.current === null ? [] : its.filter((n) => !n.is_read && !known.current!.includes(n.id));
      known.current = known.current === null ? un : known.current.concat(un.filter((i) => !known.current!.includes(i)));
      setItems(its);
      if (fresh.length) {
        setRing(true);
        setTimeout(() => setRing(false), 1000);
        try {
          navigator.vibrate?.([60, 40, 60]);
        } catch {
          /* not supported */
        }
        toast("🔔 " + fresh[0].title + (fresh.length > 1 ? " (+" + (fresh.length - 1) + ")" : ""), "info");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void refresh().finally(() => setLoading(false));
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 3000);
    const vis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const click = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("#a9Panel") && !t.closest("#a9Bell")) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const markIds = async (ids: string[] | null) => {
    try {
      await request<void>("/me/notifications/read", { method: "POST", body: ids && ids.length ? { ids } : {} });
    } catch {
      void refresh();
    }
  };
  const toggle = () => {
    if (!open && btn.current) setTop(Math.round(btn.current.getBoundingClientRect().bottom + 8));
    setOpen((o) => !o);
    if (!open) void refresh();
  };
  const markAll = () => {
    setItems((a) => a.map((n) => ({ ...n, is_read: true })));
    known.current = (known.current ?? []).concat(items.map((n) => n.id));
    void markIds(null);
  };
  const openItem = (n: Note) => {
    if (!n.is_read) {
      setItems((a) => a.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      void markIds([n.id]);
    }
    setOpen(false);
    router.push(n.kind === "template" ? "/templates" : "/leaves");
  };

  return (
    <>
      <button
        type="button"
        id="a9Bell"
        ref={btn}
        className={"a9-bell ib" + (ring ? " ring" : "")}
        aria-label={T("الإشعارات", "Notifications")}
        title={unread > 0 ? T("لديك " + unread + " إشعار جديد", "You have " + unread + " new notification" + (unread > 1 ? "s" : "")) : T("الإشعارات", "Notifications")}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        <span style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: BELL }} />
        <span className={"a9-badge" + (unread > 0 ? " on" : "")} id="a9Badge">
          {unread > 99 ? "99+" : unread}
        </span>
      </button>
      <div id="a9Panel" className={open ? "on" : ""} role="dialog" style={{ top }} onClick={(e) => e.stopPropagation()}>
        <div className="a9-h">
          <b>{T("الإشعارات", "Notifications")}</b>
          {unread > 0 && (
            <span className="a9-new">
              {unread} {T("جديد", "new")}
            </span>
          )}
          <button type="button" className="a9-mk" id="a9MarkAll" disabled={unread === 0} onClick={markAll}>
            {T("تعليم الكل كمقروء", "Mark all as read")}
          </button>
          <button type="button" className="a9-x" id="a9Close" aria-label={T("إغلاق", "Close")} onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <div className="a9-l">
          {err && !items.length ? (
            <div className="a9-e">{err}</div>
          ) : loading && !items.length ? (
            <div className="a9-e">{T("جاري التحميل…", "Loading…")}</div>
          ) : !items.length ? (
            <div className="a9-e">{T("لا توجد إشعارات.", "No notifications.")}</div>
          ) : (
            items.map((n) => {
              const ic = iconKind(n);
              return (
                <div key={n.id} className={"a9-i" + (n.is_read ? "" : " un")} data-id={n.id} onClick={() => openItem(n)}>
                  <div className={"a9-ic " + ic} dangerouslySetInnerHTML={{ __html: KIC[ic] }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="a9-t">{n.title}</div>
                    {n.body && <div className="a9-b">{n.body}</div>}
                    <div className="a9-m">{ago(n.at)}</div>
                  </div>
                  {!n.is_read && <span className="a9-dot" />}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
