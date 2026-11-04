"use client";

// The employee web area's home tab: the design's hero (photo, name, job, today's date), its tiles, and the
// two figures a phone opens the app for — the leave balance and the newest approved payslip, each one a
// link to its tab. The design's big clock and punch button belong to the shell step (docs/DESIGN_PORT.md,
// Phase 3 «the shell over the area»), so punching is one tap away in الحضور.
import Link from "next/link";
import { MeState } from "@/components/me/me-shell";
import { usePhoto } from "@/components/me/use-photo";
import { myEmployee } from "@/lib/employees";
import { initials, longToday, sar2 } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import { myLeave, myPayslips } from "@/lib/me";
import { useApi } from "@/lib/use-api";

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function MeHome() {
  const { t, lang } = useLocale();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const { data: e, error, loading } = useApi(myEmployee, "me");
  const leave = useApi(myLeave, `meleave:${e?.id ?? ""}`);
  const slips = useApi(myPayslips, `meslips:${e?.id ?? ""}`);
  const photo = usePhoto(e?.id, e?.has_photo);
  if (error?.status === 404) return <MeState error={t("me.noEmployee")} />;
  if (!e) return <MeState loading={loading} error={error?.message} />;
  const lk = (l: { name_ar: string; name_en: string } | null) => (l ? (lang === "en" ? l.name_en : l.name_ar) : "—");
  const tiles: [MessageKey, string][] = [["me.employer", lk(e.workplace)], ["me.dept", lk(e.department)], ["me.nat", lk(e.nationality)], ["me.job", e.job_title || "—"]];
  const last = slips.data?.[0] ?? null;
  const month = last ? `${lang === "en" ? MONTHS_EN[last.month - 1] : MONTHS_AR[last.month - 1]} ${last.year}` : "";
  const quick: [string, string, string][] = [
    ["/me/attendance", "ti-map-pin", T("الحضور", "Attendance")],
    ["/me/leaves", "ti-calendar", T("طلب إجازة", "Request leave")],
    ["/me/salary", "ti-cash", T("الراتب", "Salary")],
    ["/me/documents", "ti-file-text", T("مستنداتي", "My documents")],
  ];
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
        <div className="card-title"><i className="ti ti-calendar-stats" aria-hidden /> {t("me.lv")}</div>
        {leave.error && <div style={{ color: "var(--mu)", fontSize: 12 }}>{T("تعذر تحميل الرصيد", "Could not load the balance")}</div>}
        {leave.data ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
              {([
                [T("المتاح الآن", "Available now"), leave.data.current],
                [T("مرحّل", "Carried"), leave.data.carry],
                [T("حتى نهاية العام", "By year end"), leave.data.year_end],
              ] as [string, number][]).map(([k, v]) => (
                <div key={k} style={{ background: "var(--c2)", borderRadius: 8, padding: 8 }}>
                  <div style={{ fontSize: 10, color: "var(--mu)" }}>{k}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--gr)" }}>{Number(v)}</div>
                </div>
              ))}
            </div>
            {leave.data.upcoming_holidays[0] && (
              <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 8 }}>
                📅 {T("أقرب إجازة رسمية: ", "Next public holiday: ")}{leave.data.upcoming_holidays[0].name}
              </div>
            )}
            <Link href="/me/leaves" className="btn btn-primary" style={{ display: "flex", justifyContent: "center", marginTop: 10, textDecoration: "none" }}>
              {t("me.lvNew")}
            </Link>
          </>
        ) : (
          !leave.error && <div style={{ fontSize: 12, color: "var(--mu)" }}>{t("common.loading")}</div>
        )}
      </div>

      <div className="card">
        <div className="card-title"><i className="ti ti-cash" aria-hidden /> {t("me.lastSalary")}</div>
        {last ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
              <span>{month}</span>
              <b style={{ color: "var(--gr)" }}>{sar2(last.data.netSAR ?? last.data.net ?? null)}</b>
            </div>
            <Link href="/me/salary" className="btn" style={{ display: "flex", justifyContent: "center", marginTop: 10, textDecoration: "none", border: "1px solid var(--bd)", background: "transparent" }}>
              {t("me.payslip")}
            </Link>
          </>
        ) : (
          <div style={{ color: "var(--mu)", fontSize: 12 }}>{slips.data ? t("me.noPayroll") : t("common.loading")}</div>
        )}
      </div>

      <div className="card">
        <div className="card-title"><i className="ti ti-bolt" aria-hidden /> {T("إجراءات سريعة", "Quick actions")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {quick.map(([href, icon, label]) => (
            <Link key={href} href={href} className="btn" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none", border: "1px solid var(--bd)", background: "var(--c2)", fontSize: 12 }}>
              <i className={`ti ${icon}`} aria-hidden /> {label}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
