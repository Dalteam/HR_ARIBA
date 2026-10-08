"use client";

import { MeState } from "@/components/me/me-shell";
import { usePhoto } from "@/components/me/use-photo";
import { myEmployee } from "@/lib/employees";
import { initials, longToday } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import { useApi } from "@/lib/use-api";

// The prototype's home tab (renderHome). Leave balance cards return with the leave module.
export default function MeHome() {
  const { t, lang } = useLocale();
  const { data: e, error, loading } = useApi(myEmployee, "me");
  const photo = usePhoto(e?.id, e?.has_photo);
  if (error?.status === 404) return <MeState error={t("me.noEmployee")} />;
  if (!e) return <MeState loading={loading} error={error?.message} />;
  const lk = (l: { name_ar: string; name_en: string } | null) => (l ? (lang === "en" ? l.name_en : l.name_ar) : "—");
  const tiles: [MessageKey, string][] = [["me.employer", lk(e.workplace)], ["me.dept", lk(e.department)], ["me.nat", lk(e.nationality)], ["me.job", e.job_title || "—"]];
  return (
    <>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "color-mix(in srgb, var(--bl) 13%, transparent)", color: "var(--bl)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 19, flexShrink: 0, overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(e.name_ar)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{(lang === "en" && e.name_en) || e.name_ar}</div>
            <div style={{ fontSize: 12, color: "var(--mu)" }}>{e.job_title || "—"}</div>
            <div style={{ fontSize: 11, color: "var(--mu)" }} suppressHydrationWarning>{longToday(lang)}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {tiles.map(([k, v]) => (
            <div key={k} style={{ background: "var(--c2)", borderRadius: 8, padding: 8, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--mu)" }}>{t(k)}</div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{t("me.lastSalary")}</div>
        <div style={{ color: "var(--mu)", fontSize: 12 }}>{t("me.noPayroll")}</div>
      </div>
    </>
  );
}
