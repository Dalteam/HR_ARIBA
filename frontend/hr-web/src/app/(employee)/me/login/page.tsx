"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { login } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/i18n/locale";

// The prototype's #sc-login screen.
function EmpLogin() {
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
      await login(u.trim(), p);
      await reload();
      const next = params.get("next");
      router.replace(next && next.startsWith("/me") ? next : "/me");
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen on" id="sc-login">
      <div className="login-wrap">
        <form className="login-box" onSubmit={submit}>
          <div className="login-logo">
            <div className="logo-big">ARIBA</div>
            <div className="logo-sub">{t("auth.empSubtitle")}</div>
          </div>
          <div className="fg">
            <label htmlFor="lu">{t("auth.username")}</label>
            <input id="lu" type="text" placeholder="EMPxxx" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} />
            <label htmlFor="lp">{t("auth.password")}</label>
            <input id="lp" type="password" placeholder="****" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} />
          </div>
          {err && <div className="login-err" style={{ display: "block" }} role="alert">{t("auth.badCredentials")}</div>}
          <button className="btn-login" type="submit" disabled={busy}>{t("auth.signIn")}</button>
        </form>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <EmpLogin />
    </Suspense>
  );
}
