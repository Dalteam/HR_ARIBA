"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { login } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/i18n/locale";
import { homeFor } from "@/lib/routes";

const INPUT: React.CSSProperties = {
  width: "100%", padding: "11px 14px", border: "1px solid rgba(59,130,246,.2)", borderRadius: 10,
  background: "#202522", color: "#D6D3C7", fontSize: 14, direction: "ltr", boxSizing: "border-box",
};
const LABEL: React.CSSProperties = { fontSize: 11, color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: 5 };

// Markup and inline styles reproduce the prototype's #LG login screen.
function HrLogin() {
  const { t } = useLocale();
  const { reload } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!u || !p) return;
    setBusy(true);
    setErr(false);
    try {
      const user = await login(u.trim(), p);
      await reload();
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.role));
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="LG" style={{ position: "fixed", inset: 0, background: "#202522", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={submit} style={{ background: "#1a2332", border: "1px solid rgba(59,130,246,.3)", borderRadius: 20, padding: "44px 36px", width: 320, textAlign: "center", direction: "rtl" }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#29B35E", letterSpacing: 2, marginBottom: 4 }}>{t("auth.hrTitle")}</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 32 }}>{t("auth.hrSubtitle")}</div>
        <div style={{ textAlign: "right", marginBottom: 12 }}>
          <label htmlFor="LU" style={LABEL}>{t("auth.username")}</label>
          <input id="LU" type="text" placeholder="Username" autoComplete="username" style={INPUT} value={u} onChange={(e) => setU(e.target.value)} />
        </div>
        <div style={{ textAlign: "right", marginBottom: 20 }}>
          <label htmlFor="LP" style={LABEL}>{t("auth.password")}</label>
          <input id="LP" type="password" placeholder="Password" autoComplete="current-password" style={INPUT} value={p} onChange={(e) => setP(e.target.value)} />
        </div>
        <button id="LB" type="submit" disabled={busy} style={{ width: "100%", padding: 13, background: "#29B35E", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          {t("auth.signIn")}
        </button>
        {err && (
          <div id="LE" role="alert" style={{ color: "#6B7280", fontSize: 12, marginTop: 10, padding: 9, background: "rgba(248,113,113,.08)", borderRadius: 8 }}>
            {t("auth.badCredentials")}
          </div>
        )}
      </form>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <HrLogin />
    </Suspense>
  );
}
