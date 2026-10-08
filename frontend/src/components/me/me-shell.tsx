"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PasswordDialog } from "@/components/common/password-dialog";
import { useAuth } from "@/lib/auth-context";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import { useRefresh } from "@/lib/refresh";
import { useTheme } from "@/lib/theme";

const TABS: { href: string; id: string; icon: string; label: MessageKey }[] = [
  { href: "/me", id: "home", icon: "ti-home-2", label: "me.home" },
  { href: "/me/attendance", id: "att", icon: "ti-map-pin", label: "me.att" },
  { href: "/me/leaves", id: "lv", icon: "ti-calendar", label: "me.lv" },
  { href: "/me/salary", id: "pay", icon: "ti-cash", label: "me.pay" },
  { href: "/me/team", id: "team", icon: "ti-users", label: "me.team" },
  { href: "/me/profile", id: "prof", icon: "ti-user", label: "me.prof" },
  { href: "/me/overtime", id: "overtime", icon: "ti-clock-plus", label: "me.overtime" },
  { href: "/me/documents", id: "docs", icon: "ti-file-text", label: "me.docs" },
];
const APPROVALS = { href: "/me/approvals", id: "approvals", icon: "ti-checklist", label: "me.approvals" as MessageKey };

/** The prototype's #sc-app: .hdr header, #appContent, .bnav bottom navigation. */
export function MeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut, reload, hasRole } = useAuth();
  const { t, lang, setLang } = useLocale();
  const { theme, toggle } = useTheme();
  const { refresh } = useRefresh();
  const [pwOpen, setPwOpen] = useState(false);
  const tabs = hasRole("manager", "hr", "ceo") ? [...TABS, APPROVALS] : TABS;
  const active = tabs.find((x) => (x.href === "/me" ? pathname === "/me" : pathname.startsWith(x.href))) ?? TABS[0];

  return (
    <div className="screen on" id="sc-app">
      <div className="hdr">
        <div className="hdr-title" id="pageTitle">{t(active.label)}</div>
        <div className="hdr-user">
          <button id="aribaPwHdrBtn" type="button" title={t("pw.title")} onClick={() => setPwOpen(true)} style={{ background: "none", border: "none", color: "var(--mu,#888)", cursor: "pointer", padding: 4 }}>
            <i className="ti ti-key" style={{ fontSize: 18 }} />
          </button>
          <button id="aribaLangBtn" type="button" onClick={() => setLang(lang === "ar" ? "en" : "ar")} style={{ background: "var(--c2)", border: "1px solid var(--bd)", color: "var(--tx)", borderRadius: 8, padding: "6px 9px", fontWeight: 700, cursor: "pointer", marginInlineStart: 8 }}>
            {lang === "ar" ? "EN" : "AR"}
          </button>
          <button type="button" onClick={signOut} aria-label={t("auth.logout")} style={{ background: "none", border: "none", color: "var(--rd)", cursor: "pointer", padding: 4 }}>
            <i className="ti ti-logout" style={{ fontSize: 18 }} />
          </button>
        </div>
        <div className="ariba-top-actions">
          <button id="aribaModeBtn" type="button" className="ariba-mode-btn" title={t("me.modeTitle")} onClick={toggle}>
            {theme === "dark" ? t("theme.light") : t("theme.dark")}
          </button>
        </div>
        <button id="ARIBA_MANUAL_REFRESH_EMP" type="button" title={t("me.refresh")} onClick={refresh}>
          <i className="ti ti-refresh" /> <span>{t("me.refresh")}</span>
        </button>
      </div>
      <div className="content" id="appContent">{children}</div>
      <nav className="bnav">
        {tabs.map((x) => (
          <Link key={x.id} href={x.href} id={`tb-${x.id}`} className={`bni ${x === active ? "on" : ""}`} style={{ textDecoration: "none" }}>
            <i className={`ti ${x.icon}`} />
            <span>{t(x.label)}</span>
          </Link>
        ))}
      </nav>
      {(pwOpen || user?.must_change_password) && (
        <PasswordDialog forced={!!user?.must_change_password} onClose={() => setPwOpen(false)} onDone={async () => { setPwOpen(false); await reload(); }} />
      )}
    </div>
  );
}

export function MeNotBuilt() {
  const { t } = useLocale();
  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-info-circle" /> {t("common.notBuilt")}</div>
      <div style={{ color: "var(--mu)", fontSize: 12 }}>{t("common.notBuiltHint")}</div>
    </div>
  );
}

export function MeState({ loading, error }: { loading?: boolean; error?: string | null }) {
  const { t } = useLocale();
  return <div className="card" style={{ color: loading ? "var(--mu)" : "var(--rd)", fontSize: 12 }}>{loading ? t("common.loading") : error}</div>;
}
