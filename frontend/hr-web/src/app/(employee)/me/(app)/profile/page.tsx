"use client";

import { MeState } from "@/components/me/me-shell";
import { usePhoto } from "@/components/me/use-photo";
import { listDocuments, myEmployee, openDocument } from "@/lib/employees";
import { ddmmyyyy, initials, sar2 } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import { useApi } from "@/lib/use-api";

// The prototype's profile tab (renderProf + its "وثائقي" card).
export default function MeProfile() {
  const { t, tEnum, lang } = useLocale();
  const { data: e, error, loading } = useApi(myEmployee, "me");
  const docs = useApi(() => (e ? listDocuments(e.id) : Promise.resolve([])), `mydocs:${e?.id}`);
  const photo = usePhoto(e?.id, e?.has_photo);
  if (error?.status === 404) return <MeState error={t("me.noEmployee")} />;
  if (!e) return <MeState loading={loading} error={error?.message} />;
  const lk = (l: { name_ar: string; name_en: string } | null) => (l ? (lang === "en" ? l.name_en : l.name_ar) : "—");
  const info = (k: MessageKey, v: string | null) => (
    <div className="profile-info" key={k}><span>{t(k)}</span><b>{v || "—"}</b></div>
  );
  const s = e.salary;
  return (
    <>
      <div className="profile-hero">
        <div className="profile-avatar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo ? <img src={photo} alt="" /> : initials(e.name_ar)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="profile-name">{e.name_ar}</div>
          <div className="profile-en">{e.name_en || ""}</div>
          <div className="profile-job">{e.job_title || "—"}</div>
        </div>
      </div>
      <div className="card">
        <div className="card-title">{t("me.personal")}</div>
        <div className="profile-grid">
          {info("me.empNo", e.emp_no)}
          {info("me.nat", lk(e.nationality))}
          {info("me.mobile", e.mobile)}
          {info("me.email", e.email)}
          {info("me.idNo", e.national_id)}
          {info("me.dob", e.birth_date && ddmmyyyy(e.birth_date))}
        </div>
      </div>
      <div className="card">
        <div className="card-title">{t("me.jobContract")}</div>
        <div className="profile-grid">
          {info("me.employer", lk(e.workplace))}
          {info("me.dept", lk(e.department))}
          {info("me.job", e.job_title)}
          {info("me.manager", e.manager ? (lang === "en" && e.manager.name_en) || e.manager.name_ar : null)}
          {info("me.cj", e.join_date && ddmmyyyy(e.join_date))}
          {info("me.ce", e.contract_end_date ? ddmmyyyy(e.contract_end_date) : tEnum("contract_nature", e.contract_nature))}
        </div>
      </div>
      {s && (
        <div className="card">
          <div className="card-title">{t("me.salaryTitle")}</div>
          {([["me.sal", s.basic_salary], ["me.hou", s.housing_allowance], ["me.tra", s.transport_allowance], ["me.prj", s.project_allowance], ["me.oth", s.other_allowances]] as [MessageKey, string][]).map(([k, v]) => (
            <div className="hr-pay-row" key={k}><span>{t(k)}</span><b>{sar2(v)}</b></div>
          ))}
          <div className="hr-pay-row hr-pay-total"><span>{t("me.total")}</span><b>{sar2(s.total_salary)}</b></div>
          <div className="hr-pay-row hr-pay-ded"><span>{t("me.ins")}</span><b>- {sar2(s.gosi_employee)}</b></div>
          <div className="hr-pay-row hr-pay-net"><span>{t("me.net")}</span><b>{sar2(s.net_salary_sar)}</b></div>
        </div>
      )}
      {s && (
        <div className="card">
          <div className="card-title">{t("me.bank")}</div>
          <div className="profile-info"><span>IBAN</span><b>{s.iban || "—"}</b></div>
        </div>
      )}
      <div className="card">
        <div className="card-title">{t("me.myDocs")}</div>
        {docs.data?.length === 0 && <div style={{ color: "var(--mu)", fontSize: 12 }}>{t("me.noDocs")}</div>}
        {docs.data?.map((d) => (
          <div key={d.id} className="req-item" style={{ justifyContent: "space-between" }}>
            <span style={{ fontSize: 12 }}>{tEnum("doc", d.type)}</span>
            <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => openDocument(d.id)}>{t("me.open")}</button>
          </div>
        ))}
      </div>
    </>
  );
}
