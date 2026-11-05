"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PasswordDialog } from "@/components/common/password-dialog";
import { useToast } from "@/components/common/toast";
import { HrBell } from "@/components/hr/hr-bell";
import { IdleGuard } from "@/components/hr/idle-guard";
import { OccasionsAuto } from "@/components/hr/occasions-auto";
import { PageExport } from "@/components/hr/page-export";
import { SectionAudit } from "@/components/hr/section-audit";
import { request } from "@/lib/api";
import { loadLetterhead } from "@/lib/letterhead";
import { useAuth } from "@/lib/auth-context";
import { applyBrand, logoSrc, type PublicBrand } from "@/lib/brand";
import type { EmployeeCounts } from "@/lib/api";
import { isReady } from "@/lib/features";
import { HR_NAV, pageTitle, type BadgeId, type NavItem } from "@/lib/hr-nav";
import { useLocale } from "@/lib/i18n/locale";
import { useRefresh } from "@/lib/refresh";
import { listDocRegistry } from "@/lib/registry";
import { canAccess } from "@/lib/routes";
import { useTheme } from "@/lib/theme";

// The HR portal's frame, laid out like the updated design's components/Layout.jsx: the side menu (lib/hr-nav.ts,
// the design's 27 pages in 7 sections, with its counters), the top bar (title, theme, date, bell, language,
// export, print, refresh, role, password, sign out), the collapsible menu, the company's colours and logo from
// OUR GET /public/brand, and the idle guard. The design's floating AI assistant is out of scope (docs/DESIGN_PORT.md).

const SB_KEY = "hr7_sidebar_hidden";
const mob = () => window.innerWidth <= 900;
const storedClosed = () => {
  try {
    return localStorage.getItem(SB_KEY) === "1";
  } catch {
    return false;
  }
};

const ROLE_LABEL: Record<string, { ar: string; en: string }> = {
  admin: { ar: "مسؤول HR", en: "HR admin" },
  hr: { ar: "مسؤول HR", en: "HR admin" },
  admin_manager: { ar: "المدير الإداري", en: "Administrative manager" },
  chairman: { ar: "رئيس المجلس", en: "Chairman" },
  ceo: { ar: "الرئيس التنفيذي", en: "CEO" },
  finance: { ar: "المالية", en: "Finance" },
  manager: { ar: "مدير", en: "Manager" },
  employee: { ar: "موظف", en: "Employee" },
};

/** The design's document alert windows (its DEF_ALERTS): iqama 60 days, passport 90, medical insurance 90. */
const DOC_ALERT_DAYS = { iqama: 60, passport: 90, insurance: 90 };

const BUILD_STAMP = process.env.NEXT_PUBLIC_BUILD_STAMP ?? "";

export function HrShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut, reload, perms } = useAuth();
  const { lang, setLang } = useLocale();
  const en = lang === "en";
  const T = (ar: string, en_: string) => (en ? en_ : ar);
  const { theme, toggle } = useTheme();
  const { tick, refresh } = useRefresh();
  const toast = useToast();
  const [pwOpen, setPwOpen] = useState(false);
  const [today, setToday] = useState("");
  const [closed, setClosedState] = useState(false);
  const [brand, setBrand] = useState<PublicBrand | null>(null);
  const [badges, setBadges] = useState<Partial<Record<BadgeId, number>>>({});

  useEffect(() => {
    // Client-only: the date depends on the viewer's clock.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", year: "numeric", month: "long", day: "numeric" }));
  }, [lang]);

  // the company's colours, names and logo (the same answer the login screen and the employee app use)
  useEffect(() => {
    request<PublicBrand>("/public/brand", { anonymous: true })
      .then((b) => {
        setBrand(b);
        applyBrand(b.brand);
      })
      .catch(() => applyBrand(null));
    void loadLetterhead(); // every print reads the saved letterhead (Stage 16)
  }, [tick]);

  // the menu counters: active employees, pending requests, documents inside their alert window
  useEffect(() => {
    if (!user) return;
    const next: Partial<Record<BadgeId, number>> = {};
    const jobs: Promise<unknown>[] = [];
    if (canAccess("/employees", user.role, perms))
      jobs.push(request<EmployeeCounts>("/employees/counts").then((c) => { next.emp = c.active; }).catch(() => undefined));
    if (canAccess("/leaves", user.role, perms))
      jobs.push(request<unknown[]>("/requests", { query: { status: "pending" } }).then((r) => { next.lv = r.length; }).catch(() => undefined));
    if (canAccess("/documents", user.role, perms))
      jobs.push(
        listDocRegistry()
          .then((rows) => {
            const due = (d: number | null, w: number) => (d != null && d <= w ? 1 : 0);
            next.docs = rows.reduce(
              (n, r) => n + due(r.national_id_days, DOC_ALERT_DAYS.iqama) + due(r.passport_days, DOC_ALERT_DAYS.passport) + due(r.insurance_days, DOC_ALERT_DAYS.insurance),
              0,
            );
          })
          .catch(() => undefined),
      );
    void Promise.all(jobs).then(() => setBadges(next));
  }, [user, perms, tick]);

  // the collapsible menu: remembered on a desktop, closed on a phone, Escape and the backdrop close it
  const setClosed = (c: boolean, save: boolean) => {
    setClosedState(c);
    if (save && !mob()) {
      try {
        localStorage.setItem(SB_KEY, c ? "1" : "0");
      } catch {
        /* storage blocked */
      }
    }
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClosedState(mob() ? true : storedClosed());
    document.body.classList.add("a9-hr");
    let was = mob();
    const rs = () => {
      const m = mob();
      if (m !== was) {
        was = m;
        setClosedState(m ? true : storedClosed());
      }
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && mob() && setClosedState(true);
    window.addEventListener("resize", rs);
    document.addEventListener("keydown", esc);
    return () => {
      document.body.classList.remove("a9-hr");
      window.removeEventListener("resize", rs);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  useEffect(() => {
    document.body.classList.toggle("sbx-closed", closed);
    document.body.classList.toggle("sidebar-hidden-v17", closed);
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 420);
    return () => clearTimeout(t);
  }, [closed]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mob()) setClosedState(true);
  }, [pathname]);

  const info = pageTitle(pathname);
  const items = HR_NAV.filter((n) => !("id" in n) || !user || canAccess(n.href, user.role, perms));
  // a page typed in by address that the matrix closes to this role (the proxy cannot read the matrix)
  const blocked = !!user && !canAccess(pathname, user.role, perms);
  // a section title stays only when an item follows it
  const visible = items.filter((n, i) => "id" in n || (items[i + 1] && "id" in items[i + 1]));
  const isOn = (n: NavItem) => pathname === n.href || pathname.startsWith(n.href + "/");
  const coName = brand ? (en ? brand.names.coEn : brand.names.coAr).trim() : "";
  const logo = logoSrc(brand?.logo);
  const role = user ? ROLE_LABEL[user.role] ?? ROLE_LABEL.admin : null;

  const sync = () => {
    refresh();
    toast(T("تم التحديث والمزامنة بنجاح ✓", "Updated and synced ✓"), "info");
  };

  return (
    <>
      <div className="app">
        <aside className="sb" id="SB" aria-hidden={closed}>
          <div className="lbx">
            <div className="lic" style={{ background: "transparent", padding: 0, width: 44, height: 44 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo ? <img src={logo} style={{ width: 44, height: 44, objectFit: "contain" }} alt="logo" /> : <span style={{ width: 44, height: 44 }} />}
            </div>
            <div className="lt">
              <h1 id="coN">{coName}</h1>
              <p>اريبا للاستشارات</p>
            </div>
          </div>
          <div id="NV">
            {visible.map((n, i) =>
              "sec" in n ? (
                <div className="ns" key={"s" + i}>
                  {n.sec.ar} / {n.sec.en}
                </div>
              ) : (
                <Link key={n.id} href={n.href} id={"ni-" + n.id} className={"ni" + (isOn(n) ? " on" : "")} style={{ textDecoration: "none" }}>
                  <i className={"ti " + n.icon} />
                  <span className="nl">{en ? n.en : n.ar}</span>
                  {n.badge && (badges[n.badge.id] ?? 0) > 0 && (
                    <span className={"nbg " + n.badge.cls} id={"nb_" + n.badge.id}>
                      {badges[n.badge.id]}
                    </span>
                  )}
                </Link>
              ),
            )}
          </div>
          <div id="BUILD_STAMP" style={{ padding: "10px 14px", fontSize: 10, opacity: 0.55, textAlign: "center" }}>
            {"build " + BUILD_STAMP}
          </div>
        </aside>
        <div className="main">
          <div className="topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <button id="SBX_BTN" type="button" aria-label={T("القائمة", "Menu")} aria-controls="SB" aria-expanded={!closed} onClick={() => setClosed(!closed, true)}>
                <span />
                <span />
                <span />
              </button>
              <div className="pt" id="PT">
                <i className={"ti " + info.icon} /> <span id="PTT">{en ? info.en : info.ar}</span>
              </div>
            </div>
            <div className="tbr">
              <button id="aribaThemeBtn" className="ariba-theme-btn" type="button" onClick={toggle} title={theme === "dark" ? T("التبديل إلى الوضع النهاري", "Switch to day mode") : T("التبديل إلى الوضع الليلي", "Switch to night mode")}>
                <i className={"ti " + (theme === "dark" ? "ti-sun" : "ti-moon")} />
              </button>
              <span style={{ fontSize: 11, color: "var(--mu)" }} id="DTS" suppressHydrationWarning>
                {today}
              </span>
              {isReady("bell") && <HrBell />}
              <OccasionsAuto />
              <button className="ib" id="langBtn" type="button" onClick={() => setLang(en ? "ar" : "en")} title={T("تغيير اللغة", "Change language")} style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px" }}>
                <span id="langBtnTxt">{en ? "AR" : "EN"}</span>
              </button>
              <PageExport title={en ? info.en : info.ar} />
              <button className="ib" type="button" onClick={() => window.print()} title={T("طباعة", "Print")}>
                <i className="ti ti-printer" />
              </button>
              <button className="btn bpl bsm" type="button" onClick={sync} title={T("تحديث البيانات وحفظها", "Refresh and save the data")}>
                <i className="ti ti-refresh" /> {T("تحديث البيانات", "Refresh data")}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 8, fontSize: 11 }}>
                <div className="av" style={{ width: 26, height: 26, background: "linear-gradient(135deg,var(--ariba-bright,#29B35E),var(--ariba-dark,#014D3D))", color: "#fff", fontSize: 10 }}>
                  HR
                </div>
                <span id="HRL" style={{ fontWeight: 700 }}>
                  {role ? (en ? role.en : role.ar) : ""}
                </span>
                <button id="aribaPwHdrBtn" type="button" className="ib" title={T("تغيير كلمة مرور حسابي", "Change my password")} aria-label={T("تغيير كلمة مرور حسابي", "Change my password")} style={{ fontSize: 12, color: theme === "dark" ? "#E4E4BC" : undefined }} onClick={() => setPwOpen(true)}>
                  <i className="ti ti-key" />
                </button>
                <button className="ib" type="button" onClick={() => void signOut()} title={T("تسجيل الخروج", "Sign out")} aria-label={T("تسجيل الخروج", "Sign out")} style={{ color: theme === "dark" ? "#E4E4BC" : "var(--ariba-dark,#014D3D)", fontSize: 12, marginInlineStart: 5, paddingInline: 8 }}>
                  <i className="ti ti-logout" />
                </button>
              </div>
            </div>
          </div>
          <div className="con" key={tick}>
            {blocked ? (
              <div className="al alb" style={{ margin: 16 }}>
                <i className="ti ti-lock" />
                <div>{T("لا تملك صلاحية لهذه الصفحة. يمكن لمدير النظام تعديل الصلاحيات من الإعدادات.", "You have no access to this page. The administrator can change permissions in Settings.")}</div>
              </div>
            ) : (
              <>
                <SectionAudit />
                {children}
              </>
            )}
          </div>
        </div>
      </div>
      <IdleGuard />
      {(pwOpen || user?.must_change_password) && (
        <PasswordDialog
          forced={!!user?.must_change_password}
          onClose={() => setPwOpen(false)}
          onDone={async () => {
            setPwOpen(false);
            await reload();
          }}
        />
      )}
      <div id="SBX_BD" onClick={() => setClosed(true, false)} />
    </>
  );
}
