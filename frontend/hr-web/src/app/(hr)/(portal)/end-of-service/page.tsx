"use client";

// End-of-service by article (#pg-eos in frontend/legacy/hr-portal/index.html, function rEOS).
// Labour-law corrections (docs/LOGIC_AUDIT.md section 4): the award is on the actual wage (art. 2 / 84: basic + the
// fixed allowances, as the payroll and the settlement), and art. 77 on a fixed-term contract pays the months left.
import { useEffect, useMemo, useState } from "react";
import { dmy } from "@/lib/format";
import { calcByLaw, durationText, EOS_LAW_NAMES, EOS_LAWS, eosYears, type EosLaw } from "@/lib/calc/eos";
import { current, fN, getSalaryBasis, type SalaryBasisRow } from "@/lib/salary";
import { PageState } from "@/components/hr/not-built";
import { DateField } from "@/components/common/date-time-field";

const ths: React.CSSProperties = { padding: "7px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, borderBottom: "2px solid var(--bl)", background: "var(--c2)" };
const thl: React.CSSProperties = { padding: "7px 10px", textAlign: "center", fontSize: 10, fontWeight: 700, borderBottom: "2px solid var(--bl)", background: "rgba(59,130,246,.12)", color: "var(--bl)" };
const tds: React.CSSProperties = { padding: "7px 10px", borderBottom: "1px solid rgba(36,48,68,.25)", textAlign: "right" };
const ftd: React.CSSProperties = { padding: "7px 10px", background: "rgba(59,130,246,.08)", borderTop: "2px solid var(--bl)", fontWeight: 700, fontSize: 11, textAlign: "right" };
/** Actual wage (art. 2): basic + every fixed monthly allowance. */
const allowances = (e: SalaryBasisRow) =>
  [e.housing_allowance, e.transport_allowance, e.project_allowance, e.other_allowances, e.extra_allowance].reduce((s, v) => s + (Number(v) || 0), 0);
/** Art. 77 fixed-term: months between the termination date and the contract end (null = indefinite / already ended). */
const monthsLeft = (e: SalaryBasisRow, endD: Date): number | null => {
  if (!e.contract_end_date) return null;
  const days = (new Date(e.contract_end_date).getTime() - endD.getTime()) / 86400000;
  return days > 0 ? days / 30 : 0;
};

const box = (c: string): React.CSSProperties => ({
  background: `color-mix(in srgb, ${c} 8%, transparent)`,
  border: `1px solid color-mix(in srgb, ${c} 27%, transparent)`,
  borderRadius: 10,
  padding: 10,
  textAlign: "center",
});

export default function Page() {
  const [rows, setRows] = useState<SalaryBasisRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [endDate, setEndDate] = useState("");
  const [law, setLaw] = useState<EosLaw>("m84");
  const [employer, setEmployer] = useState("");

  const load = () => {
    getSalaryBasis()
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(load, []);

  const all = useMemo(() => current(rows ?? []).filter((e) => e.category !== "hourly"), [rows]);
  const employers = useMemo(
    () => [...new Set(all.filter((e) => !e.exclude_from_eos).map((e) => e.workplace ?? ""))].sort(),
    [all],
  );
  const emps = all.filter((e) => (employer ? e.workplace === employer : true));

  const { body, totBase, totEOS } = useMemo(() => {
    const endD = new Date(endDate || new Date().toISOString().slice(0, 10));
    const items = emps.map((e, i) => {
      const yrs = eosYears(e.join_date, endD);
      const sal = Number(e.basic_salary) || 0;
      const hou = allowances(e);
      const base = sal + hou;
      const eos = calcByLaw(sal, hou, yrs, law, monthsLeft(e, endD));
      return { e, i, sal, hou, base, eos, yrs };
    });
    const totBase = items.reduce((s, x) => s + x.base, 0);
    const totEOS = items.reduce((s, x) => s + x.eos, 0);
    const body = items.map(({ e, i, sal, hou, base, eos, yrs }) => {
      const durText = e.join_date ? durationText(e.join_date, endD) : `${yrs.toFixed(2)} سنة`;
      const ec = eos === 0 ? "var(--dm)" : law === "m77" ? "var(--rd)" : "var(--bl)";
      return (
        <tr key={e.id}>
          <td style={{ ...tds, color: "var(--dm)" }}>{i + 1}</td>
          <td style={{ ...tds, fontWeight: 600 }}>{e.name_ar.split(" ").slice(0, 3).join(" ")}</td>
          <td style={tds}>
            <span className="b bb" style={{ fontSize: 10 }}>
              {e.workplace}
            </span>
          </td>
          <td style={tds}>{dmy(e.join_date)}</td>
          <td style={{ ...tds, color: "var(--pu)", fontWeight: 600 }}>{durText}</td>
          <td style={{ ...tds, color: "var(--gr)" }}>{fN(sal)}</td>
          <td style={tds}>{fN(hou)}</td>
          <td style={{ ...tds, color: "var(--cy)", fontWeight: 600 }}>{fN(base)}</td>
          <td style={{ ...tds, color: ec, fontWeight: eos > 0 ? 700 : 400, textAlign: "center" }}>{eos > 0 ? fN(eos) + " ر.س" : "—"}</td>
        </tr>
      );
    });
    return { body, totBase, totEOS };
  }, [emps, law, endDate]);

  function exportEOS() {
    const endD = new Date(endDate || new Date().toISOString().slice(0, 10));
    const head = ["م", "الموظف", "جهة العمل", "تاريخ المباشرة", "مدة الخدمة", "الأساسي", "البدلات", "الوعاء", `المكافأة (${law})`];
    const lines = emps.map((e, i) => {
      const yrs = eosYears(e.join_date, endD);
      const sal = Number(e.basic_salary) || 0;
      const hou = allowances(e);
      const eos = calcByLaw(sal, hou, yrs, law, monthsLeft(e, endD));
      return [i + 1, e.name_ar.split(" ").slice(0, 3).join(" "), e.workplace ?? "", dmy(e.join_date), e.join_date ? durationText(e.join_date, endD) : yrs.toFixed(2) + " سنة", fN(sal), fN(hou), fN(sal + hou), eos > 0 ? fN(eos) + " ر.س" : "0"];
    });
    const csv = "﻿" + [head, ...lines].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `EOS_${law}_${endDate || new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="pg on" id="pg-eos">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--c2)", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--bd)" }}>
          <label style={{ fontSize: 11, color: "var(--mu)", fontWeight: 600 }}>تاريخ الإنهاء:</label>
          <DateField id="eosEndDate" style={{ width: "auto", fontSize: 12, background: "transparent", border: "none", minHeight: 0, padding: "2px 4px" }} value={endDate} onChange={(v) => setEndDate(v)} />
          <button type="button" onClick={() => setEndDate("")} style={{ background: "none", border: "none", color: "var(--mu)", cursor: "pointer", fontSize: 11 }}>
            اليوم
          </button>
        </div>
        <select id="eosLawSel" value={law} onChange={(e) => setLaw(e.target.value as EosLaw)} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--bd)", background: "var(--c2)", color: "var(--tx)" }}>
          {EOS_LAWS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <select id="eosEmpFilter" value={employer} onChange={(e) => setEmployer(e.target.value)} style={{ fontSize: 12, maxWidth: 180, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--bd)", background: "var(--c2)", color: "var(--tx)" }}>
          <option value="">كل جهات العمل</option>
          {employers.map((em) => (
            <option key={em} value={em}>
              {em}
            </option>
          ))}
        </select>
        <button type="button" className="btn bsm" style={{ background: "var(--pu)", color: "#fff" }} onClick={exportEOS}>
          <i className="ti ti-file-spreadsheet" /> Excel
        </button>
      </div>
      {!rows ? (
        <PageState loading={!error} error={error} onRetry={load} />
      ) : (
        <>
          <div id="eosKPIs" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 10 }}>
            <div style={box("var(--bl)")}>
              <div style={{ fontSize: 10, color: "var(--mu)" }}>القانون</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--bl)" }}>{EOS_LAW_NAMES[law]}</div>
            </div>
            <div style={box("var(--gr)")}>
              <div style={{ fontSize: 10, color: "var(--mu)" }}>إجمالي المكافآت</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--gr)" }}>{fN(Math.round(totEOS))} ر.س</div>
            </div>
            <div style={box("var(--cy)")}>
              <div style={{ fontSize: 10, color: "var(--mu)" }}>إجمالي الوعاء</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--cy)" }}>{fN(Math.round(totBase))} ر.س</div>
            </div>
            <div style={box("var(--pu)")}>
              <div style={{ fontSize: 10, color: "var(--mu)" }}>عدد الموظفين</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--pu)" }}>{emps.length}</div>
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead id="eosHead">
                <tr>
                  <th style={ths}>م</th>
                  <th style={{ ...ths, minWidth: 120 }}>الموظف</th>
                  <th style={ths}>جهة العمل</th>
                  <th style={ths}>المباشرة</th>
                  <th style={ths}>الخدمة</th>
                  <th style={ths}>الأساسي</th>
                  <th style={ths}>البدلات</th>
                  <th style={ths}>الوعاء</th>
                  <th style={thl}>{EOS_LAW_NAMES[law]}</th>
                </tr>
              </thead>
              <tbody id="eosBody">{body}</tbody>
              <tfoot id="eosFoot">
                <tr>
                  <td style={ftd} colSpan={7}>
                    الإجمالي ({emps.length} موظف)
                  </td>
                  <td style={{ ...ftd, color: "var(--cy)" }}>{fN(Math.round(totBase))}</td>
                  <td style={{ ...ftd, color: "var(--bl)", textAlign: "center" }}>{fN(Math.round(totEOS))} ر.س</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
