"use client";

import { useState } from "react";
import { getEmployee } from "@/lib/employees";
import { dmy, initials, sar } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import { useApi } from "@/lib/use-api";
import { Modal } from "./modal";
import { PageState } from "./not-built";

type Tab = "d1" | "d2" | "d3" | "d4";

/** The prototype's employee details window (#EM): tabs أساسي / وثائق / مالية / إجازات. */
export function EmployeeDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, tEnum, lang } = useLocale();
  const [tab, setTab] = useState<Tab>("d1");
  const { data: e, error, loading } = useApi(() => getEmployee(id), `ed:${id}`);
  const name = e ? (lang === "en" && e.name_en) || e.name_ar : "";
  const lk = (l: { name_ar: string; name_en: string } | null) => (l ? (lang === "en" ? l.name_en : l.name_ar) : "—");
  const item = (k: MessageKey, v: React.ReactNode) => (
    <div className="di" key={k}>
      <div className="dl">{t(k)}</div>
      <div className="dv">{v ?? "—"}</div>
    </div>
  );

  return (
    <Modal
      width={740}
      onClose={onClose}
      title={
        e && (
          <>
            <div className="av" style={{ width: 32, height: 32, background: "#29B35E22", color: "#29B35E", fontSize: 11, display: "inline-flex" }}>{initials(e.name_ar)}</div>{" "}
            <span style={{ marginRight: 8 }}>{name}</span>
          </>
        )
      }
    >
      {loading || error || !e ? (
        <PageState loading={loading} error={error?.message} />
      ) : (
        <>
          <div className="tbar">
            {(["d1", "d2", "d3", "d4"] as Tab[]).map((k, i) => (
              <div key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
                {t((["ed.basic", "ed.docs", "ed.fin", "ed.leaves"] as MessageKey[])[i])}
              </div>
            ))}
          </div>
          {tab === "d1" && (
            <div className="dg">
              {item("ed.employer", lk(e.workplace))}
              {item("ed.sponsor", e.sponsor || "—")}
              {item("ed.nat", lk(e.nationality))}
              {item("ed.dept", lk(e.department))}
              {item("ed.job", e.job_title || "—")}
              {item("ed.gender", tEnum("gender", e.gender))}
              {item("ed.dob", dmy(e.birth_date))}
              {item("ed.mobile", e.mobile || "—")}
              {item("ed.email", e.email || "—")}
              {item("ed.bank", e.salary?.bank_name || "—")}
              {item("ed.iban", e.salary?.iban || "—")}
              {item("ed.yos", t("common.years", { n: Number(e.years_of_service).toFixed(2) }))}
              {item("ed.empNo", e.emp_no)}
              {item("ed.login", e.has_account ? `${e.emp_no} / ${t("ed.loginYes")}` : t("ed.loginNo"))}
            </div>
          )}
          {tab === "d2" && (
            <div className="dg">
              {item("ed.iq", e.national_id || "—")}
              {item("ed.iqe", dmy(e.national_id_expiry))}
              {item("ed.iqLeft", e.expiry_days.national_id === null ? "—" : t("common.days", { n: e.expiry_days.national_id }))}
              {item("ed.pp", e.passport_no || "—")}
              {item("ed.ppe", dmy(e.passport_expiry))}
              {item("ed.ppLeft", e.expiry_days.passport === null ? "—" : t("common.days", { n: e.expiry_days.passport }))}
              {item("ed.ico", e.insurance_company || "—")}
              {item("ed.icl", e.insurance_class || "—")}
              {item("ed.ie", dmy(e.insurance_expiry))}
            </div>
          )}
          {tab === "d3" &&
            (e.salary ? (
              <div className="dg">
                {item("ed.sal", sar(e.salary.basic_salary))}
                {item("ed.hou", sar(e.salary.housing_allowance))}
                {item("ed.tra", sar(e.salary.transport_allowance))}
                {item("ed.prj", sar(e.salary.project_allowance))}
                {item("ed.oth", sar(e.salary.other_allowances))}
                {item("ed.total", <strong style={{ color: "var(--gr)" }}>{sar(e.salary.total_salary)}</strong>)}
                {item("ed.empIns", sar(-Number(e.salary.gosi_employee)))}
                {item("ed.coIns", sar(e.salary.gosi_employer))}
                {item("ed.net", <strong style={{ color: "var(--cy)" }}>{sar(e.salary.net_salary_sar)}</strong>)}
                {item("ed.eos", e.salary.eos_award === null ? "—" : sar(e.salary.eos_award))}
              </div>
            ) : (
              <div className="al alb"><i className="ti ti-lock" /><div>{t("form.salaryHidden")}</div></div>
            ))}
          {tab === "d4" && (
            <>
              <div className="dg">
                {item("ed.annual", t("common.days", { n: e.annual_leave_days }))}
                {item("ed.cj", dmy(e.join_date))}
                {item("ed.ce", dmy(e.contract_end_date))}
                {item("ed.cn", tEnum("contract_nature", e.contract_nature))}
              </div>
              <div className="al alb" style={{ marginTop: 8 }}><i className="ti ti-info-circle" /><div>{t("ed.leaveSoon")}</div></div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
