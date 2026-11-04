"use client";

// The employee web area's salary tab, as the design's Pay.jsx: the current salary from HR, the newest approved
// payslip, the earlier approved months (each opens in place) and the bank details. Read-only: everything comes
// from GET /me/employee and GET /me/payslips, the same routes the employee app uses.
import { useState } from "react";
import { MeState } from "@/components/me/me-shell";
import { myEmployee } from "@/lib/employees";
import { sar2 } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import { myPayslips, type Payslip } from "@/lib/me";
import { useApi } from "@/lib/use-api";

const n0 = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const nm = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : sar2(v as string | number));
const MN_AR = ["", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MN_EN = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The V119 slip (salByDays …) or an older payroll payload with its own key names (the design's two branches). */
function isNewSlip(d: Payslip["data"]): boolean {
  return d.houPay !== undefined || d.salByDays !== undefined;
}

function Row({ label, value, kind }: { label: string; value: string; kind?: "total" | "ded" | "net" }) {
  return (
    <div className={`hr-pay-row${kind ? ` hr-pay-${kind}` : ""}`}>
      <span>{label}</span>
      <b>{kind === "ded" ? `- ${value}` : value}</b>
    </div>
  );
}

/** Every amount of one approved month, in the design's order: dues, then deductions, then the net. */
function SlipRows({ p }: { p: Payslip }) {
  const { t } = useLocale();
  const d = p.data;
  if (isNewSlip(d)) {
    const cur = d.currency && d.currency !== "ريال سعودي" ? d.currency : "";
    const optional = (k: MessageKey, v: unknown) => (n0(v) ? <Row key={k} label={t(k)} value={nm(v)} /> : null);
    return (
      <>
        <Row label={t("me.slipBasic")} value={nm(d.salByDays)} />
        <Row label={t("me.hou")} value={nm(d.houPay)} />
        <Row label={t("me.tra")} value={nm(d.traPay)} />
        {optional("me.prj", d.prjPay)}
        {optional("me.oth", n0(d.othPay) + n0(d.otherAllow))}
        {optional("me.otPay", d.overtime)}
        {optional("me.leaveComp", d.leaveComp)}
        {optional("me.eosAward", d.eosAmt)}
        <Row label={t("me.slipTotal")} value={nm(d.totalDue)} kind="total" />
        <Row label={t("me.ins")} value={nm(d.noInsDeduct ? 0 : d.insEmp)} kind="ded" />
        {optional("me.advances", d.loanDeduct)}
        {optional("me.otherDed", d.otherDeduct)}
        <Row label={t("me.net")} value={nm(d.netSAR ?? d.net)} kind="net" />
        {cur && <Row label={t("me.origNet")} value={`${n0(d.net).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`} />}
      </>
    );
  }
  // Older payloads (the imported history): the design's fallback key names.
  const g = (...keys: string[]) => {
    for (const k of keys) {
      const v = (d as Record<string, unknown>)[k];
      if (v !== null && v !== undefined) return n0(v);
    }
    return 0;
  };
  const rows: [MessageKey, number][] = [
    ["me.sal", g("sal", "salary")],
    ["me.hou", g("hou", "housingAllowance")],
    ["me.tra", g("tra", "transportAllowance")],
    ["me.prj", g("prj", "projectAllowance")],
    ["me.oth", g("oth", "otherAllowance")],
  ];
  return (
    <>
      {rows.map(([k, v]) => <Row key={k} label={t(k)} value={nm(v)} />)}
      <Row label={t("me.slipTotal")} value={nm(g("tot", "salaryTotal", "totalDue"))} kind="total" />
      <Row label={t("me.ins")} value={nm(g("insEmp", "insuranceSub"))} kind="ded" />
      {g("loanDeduct") ? <Row label={t("me.advances")} value={nm(g("loanDeduct"))} kind="ded" /> : null}
      {g("otherDeduct") ? <Row label={t("me.otherDed")} value={nm(g("otherDeduct"))} kind="ded" /> : null}
      <Row label={t("me.net")} value={nm(g("net", "netSalary", "netSAR"))} kind="net" />
    </>
  );
}

export default function MeSalary() {
  const { t, lang } = useLocale();
  const { data: e, error, loading } = useApi(myEmployee, "me");
  const slips = useApi(myPayslips, `meslips:${e?.id ?? ""}`);
  const [open, setOpen] = useState(-1);
  if (error?.status === 404) return <MeState error={t("me.noEmployee")} />;
  if (!e) return <MeState loading={loading} error={error?.message} />;
  const s = e.salary;
  const MN = lang === "en" ? MN_EN : MN_AR;
  const month = (p: Payslip) => `${MN[p.month] ?? p.month} ${p.year}`;
  const list = slips.data ?? [];
  const [latest, ...older] = list;
  const salaryRow = (k: MessageKey, v: string | null) => <Row key={k} label={t(k)} value={nm(v)} />;

  return (
    <>
      <div className="card">
        <div className="card-title"><i className="ti ti-cash" aria-hidden /> {t("me.curSalary")}</div>
        {s ? (
          <>
            {salaryRow("me.sal", s.basic_salary)}
            {salaryRow("me.hou", s.housing_allowance)}
            {salaryRow("me.tra", s.transport_allowance)}
            {salaryRow("me.prj", s.project_allowance)}
            {salaryRow("me.oth", s.other_allowances)}
            <Row label={t("me.total")} value={nm(s.total_salary)} kind="total" />
            <Row label={t("me.ins")} value={nm(s.gosi_employee)} kind="ded" />
            <Row label={t("me.net")} value={nm(s.net_salary_sar)} kind="net" />
          </>
        ) : <div style={{ color: "var(--mu)", fontSize: 12 }}>{t("me.noSalary")}</div>}
      </div>

      {latest && (
        <div className="card">
          <div className="card-title">
            <i className="ti ti-file-invoice" aria-hidden /> {`${t("me.payslip")} — ${month(latest)}`}
          </div>
          <SlipRows p={latest} />
        </div>
      )}

      {older.length > 0 && (
        <div className="card">
          <div className="card-title"><i className="ti ti-history" aria-hidden /> {t("me.slips")}</div>
          {older.map((p, i) => (
            <div key={`${p.year}-${p.month}`} style={{ borderTop: i ? "1px solid var(--bd)" : undefined, paddingTop: i ? 8 : 0 }}>
              <button type="button" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}
                style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 8, background: "none", border: 0, color: "var(--tx)", padding: "8px 0", cursor: "pointer", font: "inherit" }}>
                <b style={{ fontSize: 12 }}>{`${t("me.payslip")} — ${month(p)}`}</b>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gr)" }}>{nm(p.data.netSAR ?? p.data.net)}</span>
              </button>
              {open === i && <SlipRows p={p} />}
            </div>
          ))}
        </div>
      )}

      {slips.error && <div className="card" style={{ color: "var(--rd)", fontSize: 12 }}>{slips.error.message}</div>}
      {slips.data && !list.length && <div className="card" style={{ color: "var(--mu)", fontSize: 12 }}>{t("me.noSlips")}</div>}

      <div className="card">
        <div className="card-title"><i className="ti ti-building-bank" aria-hidden /> {t("me.bank")}</div>
        <div className="profile-info"><span>{t("me.iban")}</span><b>{s?.iban || "—"}</b></div>
      </div>
    </>
  );
}
