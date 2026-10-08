"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PasswordDialog } from "@/components/common/password-dialog";
import { useToast } from "@/components/common/toast";
import { useAuth } from "@/lib/auth-context";
import { longToday } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import { useRefresh } from "@/lib/refresh";
import { canAccess } from "@/lib/routes";
import { useTheme } from "@/lib/theme";

type NavEntry = { sec: MessageKey } | { href: string; id: string; icon: string; label: MessageKey };

// Same order, icons and labels as the prototype's PG_NAV (+ the "نماذج" entry its patches added).
const NAV: NavEntry[] = [
  { sec: "nav.secGeneral" },
  { href: "/dashboard", id: "dash", icon: "ti-layout-dashboard", label: "nav.dash" },
  { sec: "nav.secEmployees" },
  { href: "/employees", id: "emps", icon: "ti-users", label: "nav.emps" },
  { sec: "nav.secAttendance" },
  { href: "/attendance", id: "att", icon: "ti-map-pin", label: "nav.att" },
  { href: "/locations", id: "loc", icon: "ti-map-2", label: "nav.loc" },
  { sec: "nav.secLeaves" },
  { href: "/leaves", id: "lv", icon: "ti-calendar-event", label: "nav.lv" },
  { sec: "nav.secFinance" },
  { href: "/payroll", id: "pay", icon: "ti-cash", label: "nav.pay" },
  { href: "/payslips", id: "slip", icon: "ti-receipt", label: "nav.slip" },
  { href: "/end-of-service", id: "eos", icon: "ti-award", label: "nav.eos" },
  { href: "/settlement", id: "eoscalc", icon: "ti-receipt-2", label: "nav.eoscalc" },
  { sec: "nav.secDocuments" },
  { href: "/documents", id: "docs", icon: "ti-id", label: "nav.docs" },
  { sec: "nav.secAdmin" },
  { href: "/reports", id: "rpt", icon: "ti-report-analytics", label: "nav.rpt" },
  { href: "/settings", id: "set", icon: "ti-settings", label: "nav.set" },
  { href: "/templates", id: "forms", icon: "ti-files", label: "nav.forms" },
];

function pageFor(pathname: string): { icon: string; label: MessageKey } {
  if (pathname === "/employees/new" || /^\/employees\/[^/]+$/.test(pathname)) return { icon: "ti-user-plus", label: "nav.form" };
  const hit = NAV.find((n): n is Extract<NavEntry, { href: string }> => "href" in n && (pathname === n.href || pathname.startsWith(n.href + "/")));
  return hit ? { icon: hit.icon, label: hit.label } : { icon: "ti-layout-dashboard", label: "nav.dash" };
}

export function HrShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut, reload } = useAuth();
  const { t, lang, setLang } = useLocale();
  const { theme, toggle } = useTheme();
  const { refresh } = useRefresh();
  const toast = useToast();
  const [pwOpen, setPwOpen] = useState(false);
  const [today, setToday] = useState("");

  useEffect(() => {
    // Client-only: the date depends on the viewer's clock.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(longToday(lang));
  }, [lang]);

  const page = pageFor(pathname);
  const visible = NAV.filter((n, i) => {
    if ("href" in n) return !user || canAccess(n.href, user.role);
    // keep a section title only if one of its items is visible
    const next = NAV.slice(i + 1);
    const end = next.findIndex((x) => "sec" in x);
    return next.slice(0, end === -1 ? undefined : end).some((x) => "href" in x && (!user || canAccess(x.href, user.role)));
  });

  const switchLang = () => {
    const next = lang === "ar" ? "en" : "ar";
    setLang(next);
    toast(next === "ar" ? "✓ اللغة العربية" : "✓ English Mode", "info");
  };

  return (
    <div className="app">
      <aside className="sb" id="SB">
        <div className="lbx">
          <div className="lic" style={{ background: "transparent", padding: 0, width: 44, height: 44 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ariba-logo.png" style={{ width: 44, height: 44, objectFit: "contain" }} alt="ARIBA" />
          </div>
          <div className="lt">
            <h1 id="coN">{t("hr.systemName")}</h1>
            <p>{t("hr.company")}</p>
          </div>
        </div>
        <div id="NV">
          {visible.map((n) =>
            "sec" in n ? (
              <div className="ns" key={n.sec}>
                {t(n.sec)}
              </div>
            ) : (
              <Link
                key={n.id}
                href={n.href}
                id={`ni-${n.id}`}
                className={`ni ${pathname === n.href || pathname.startsWith(n.href + "/") ? "on" : ""}`}
                style={{ textDecoration: "none" }}
              >
                <i className={`ti ${n.icon}`} />
                <span className="nl">{t(n.label)}</span>
              </Link>
            ),
          )}
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div className="pt" id="PT">
              <i className={`ti ${page.icon}`} /> <span id="PTT">{t(page.label)}</span>
            </div>
          </div>
          <div className="tbr">
            <button id="aribaThemeBtn" className="ariba-theme-btn" type="button" title={theme === "dark" ? t("hr.toLight") : t("hr.toDark")} onClick={toggle}>
              <i className={`ti ${theme === "dark" ? "ti-sun" : "ti-moon"}`} />
              <span className="ariba-theme-label">{theme === "dark" ? t("theme.light") : t("theme.dark")}</span>
            </button>
            <span style={{ fontSize: 11, color: "var(--mu)" }} id="DTS" suppressHydrationWarning>
              {today}
            </span>
            <button className="ib" type="button" onClick={switchLang} title={t("hr.langTitle")} id="langBtn" style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px" }}>
              <span id="langBtnTxt">{lang === "ar" ? "EN" : "AR"}</span>
            </button>
            <button className="ib" type="button" onClick={() => window.print()} aria-label="print">
              <i className="ti ti-printer" />
            </button>
            <button className="btn bpl bsm" type="button" onClick={refresh} title={t("hr.refreshTitle")}>
              <i className="ti ti-refresh" /> {t("hr.refresh")}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 8, fontSize: 11 }}>
              <div className="av" style={{ width: 26, height: 26, background: "linear-gradient(135deg,#29B35E,#014D3D)", color: "#fff", fontSize: 10 }}>
                HR
              </div>
              <span id="HRL" style={{ fontWeight: 700 }}>
                {user ? t(`role.${user.role}` as MessageKey) : ""}
              </span>
              <button id="aribaPwHdrBtn" type="button" className="ib" title={t("pw.myTitle")} aria-label={t("pw.myTitle")} style={{ fontSize: 12 }} onClick={() => setPwOpen(true)}>
                <i className="ti ti-key" />
              </button>
              <button className="ib" type="button" onClick={signOut} title={t("auth.logout")} aria-label={t("auth.logout")} style={{ fontSize: 12, marginInlineStart: 5, paddingInline: 8 }}>
                <i className="ti ti-logout" />
              </button>
            </div>
          </div>
        </div>
        <div className="con">{children}</div>
      </div>

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
    </div>
  );
}
