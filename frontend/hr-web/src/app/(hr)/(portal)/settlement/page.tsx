"use client";

// Settlement calculator (حاسبة المخالصة) — same markup and behaviour as #pg-eoscalc in
// frontend/legacy/hr-portal/index.html; the arithmetic is in lib/calc/settlement.ts.
import { useEffect, useMemo, useState } from "react";
import { getEmployee, listAllEmployees } from "@/lib/employees";
import { printDoc } from "@/lib/calc/forms";
import { settlementDocHtml } from "@/lib/calc/settlement-doc";
import type { EmployeeListItem } from "@/lib/api";
import { LAW_NAME, REASONS, runSettlement, sDt, sNum, type SettlementReason } from "@/lib/calc/settlement";

const inp: React.CSSProperties = {
  padding: 6,
  border: "1px solid var(--bd)",
  borderRadius: 6,
  background: "var(--c2)",
  color: "var(--tx)",
  fontSize: 12,
  width: "100%",
};
const lbl: React.CSSProperties = { fontSize: 10, color: "var(--mu)", fontWeight: 600, display: "block", marginBottom: 2 };

type Ded = { id: number; label: string; value: string; type: "amount" | "days" };
type Ext = { id: number; label: string; value: string };

const today = () => new Date().toISOString().slice(0, 10);

export default function Page() {
  const [emps, setEmps] = useState<EmployeeListItem[]>([]);
  const [empId, setEmpId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [sal, setSal] = useState("");
  const [reason, setReason] = useState<SettlementReason>("m84");
  const [leaveD, setLeaveD] = useState("21");
  const [leaveTaken, setLeaveTaken] = useState("0");
  const [wd, setWd] = useState("");
  const [ad, setAd] = useState("");
  const [extras, setExtras] = useState<Ext[]>([]);
  const [deds, setDeds] = useState<Ded[]>([]);
  const [seq, setSeq] = useState(1);

  useEffect(() => {
    listAllEmployees({ sort: "name_ar" })
      .then((p) => setEmps(p.items.filter((e) => e.category !== "hourly")))
      .catch(() => setEmps([]));
  }, []);

  const emp = emps.find((e) => e.id === empId);

  function onSelect(id: string) {
    setEmpId(id);
    const e = emps.find((x) => x.id === id);
    if (!e) return;
    setStart(e.join_date ?? "");
    setSal(e.total_salary ?? "0");
    setLeaveD("21");
    setLeaveTaken("0");
    setEnd(today());
  }

  const res = useMemo(
    () =>
      runSettlement({
        start,
        end,
        salary: parseFloat(sal) || 0,
        reason,
        leavePerYear: parseInt(leaveD) || 21,
        leaveTaken: parseInt(leaveTaken) || 0,
        monthDays: parseInt(wd) || 0,
        attendanceDays: parseInt(ad) || 0,
        extras: extras.map((x) => parseFloat(x.value) || 0),
        deductions: deds.map((d) => ({ value: parseFloat(d.value) || 0, type: d.type })),
      }),
    [start, end, sal, reason, leaveD, leaveTaken, wd, ad, extras, deds],
  );

  async function printOfficial() {
    if (!empId || !res) return alert("اختر الموظف أولاً");
    const e = await getEmployee(empId);
    const html = settlementDocHtml({
      emp: {
        nameAr: e.name_ar, nationality: e.nationality?.name_ar ?? "", iqamaNo: e.national_id ?? "", empNo: e.emp_no,
        jobTitle: e.job_title ?? "", employer: e.workplace?.name_ar ?? "", bank: e.salary?.bank_name ?? "", iban: e.salary?.iban ?? "",
      },
      start, end, salary: parseFloat(sal) || 0, monthDays: parseInt(wd) || 30, lawLabel: LAW_NAME[reason], res,
      extras: extras.map((x) => ({ label: x.label, amount: parseFloat(x.value) || 0 })),
      deductions: deds.map((d) => ({ label: d.label, value: parseFloat(d.value) || 0, type: d.type })),
      leaveTaken: parseInt(leaveTaken) || 0,
    });
    printDoc("مخالصة نهاية خدمة — " + e.name_ar, html);
  }

  function reset() {
    setEmpId("");
    setStart("");
    setEnd("");
    setSal("");
    setReason("m84");
    setLeaveD("21");
    setLeaveTaken("0");
    setWd("");
    setAd("");
    setExtras([]);
    setDeds([]);
  }

  const law = LAW_NAME[reason];
  const boxes: [string, string, string][] = res
    ? [
        [law, res.award === 0 ? "لا تستحق" : sNum(res.award), res.award === 0 ? "var(--rd)" : "var(--gr)"],
        [`بدل الإجازة (${res.leaveRemaining})`, sNum(res.leaveComp), "var(--am)"],
        ["راتب الفترة", sNum(res.periodSalary), "var(--cy)"],
        ["استحقاقات أخرى", sNum(res.extrasTotal), "var(--gr)"],
        ["الاستقطاعات", sNum(res.deductionsTotal), "var(--rd)"],
        ...(res.leaveExcess > 0
          ? ([[`خصم إجازة زائدة (${res.leaveExcess} يوم)`, "-" + sNum(res.leaveExcessDeduction), "var(--rd)"]] as [
              string,
              string,
              string,
            ][])
          : []),
      ]
    : [];

  const sec = (t: string) => (
    <tr key={"s" + t}>
      <td colSpan={2} style={{ background: "rgba(59,130,246,.08)", color: "var(--bl)", fontWeight: 700, fontSize: 11, padding: "6px 10px" }}>
        📋 {t}
      </td>
    </tr>
  );
  const row = (l: string, v: string, c?: string) => (
    <tr key={l + v}>
      <td style={{ padding: "6px 10px", borderBottom: "1px solid rgba(36,48,68,.3)", fontSize: 11 }}>{l}</td>
      <td style={{ padding: "6px 10px", borderBottom: "1px solid rgba(36,48,68,.3)", textAlign: "left", fontWeight: 600, fontSize: 11, color: c || "var(--tx)" }}>
        {v}
      </td>
    </tr>
  );

  return (
    <div className="pg on" id="pg-eoscalc">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="card" style={{ padding: 10 }}>
          <div className="ct" style={{ marginBottom: 8, fontSize: 12 }}>
            <i className="ti ti-user-search" /> الموظف
          </div>
          <select id="sEmpSel" value={empId} onChange={(e) => onSelect(e.target.value)} style={{ fontSize: 12, width: "100%", marginBottom: 8 }}>
            <option value="">— اختر موظفاً —</option>
            {emps.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name_ar} — {e.workplace?.name_ar ?? ""} {e.is_terminated ? "(منتهي)" : "(حالي)"}
              </option>
            ))}
          </select>
          {emp && (
            <div id="sEmpInfo" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
              <div style={{ fontSize: 11 }}>
                <span style={{ color: "var(--mu)" }}>الاسم: </span>
                {emp.name_ar}
              </div>
              <div style={{ fontSize: 11 }}>
                <span style={{ color: "var(--mu)" }}>سنوات: </span>
                <span style={{ color: "var(--pu)" }}>{Number(emp.years_of_service || 0).toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 11 }}>
                <span style={{ color: "var(--mu)" }}>الإجمالي: </span>
                <span style={{ color: "var(--gr)" }}>{sNum(Number(emp.total_salary || 0))} ر.س</span>
              </div>
            </div>
          )}
        </div>
        <div className="card" style={{ padding: 10 }}>
          <div className="ct" style={{ marginBottom: 8, fontSize: 12 }}>
            <i className="ti ti-briefcase" /> بيانات الخدمة
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <div>
              <label style={lbl}>تاريخ المباشرة</label>
              <input type="date" id="sStart" value={start} onChange={(e) => setStart(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>تاريخ الإنهاء</label>
              <input type="date" id="sEndDate" value={end} onChange={(e) => setEnd(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>الراتب الإجمالي</label>
              <input type="number" id="sSal" placeholder="0" value={sal} onChange={(e) => setSal(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>سبب الإنهاء</label>
              <select id="sReason" value={reason} onChange={(e) => setReason(e.target.value as SettlementReason)} style={{ ...inp, fontSize: 11 }}>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>إجازة/سنة</label>
              <input type="number" id="sLeaveD" value={leaveD} onChange={(e) => setLeaveD(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>إجازة مأخوذة</label>
              <input type="number" id="sLeaveTaken" value={leaveTaken} onChange={(e) => setLeaveTaken(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>أيام الشهر</label>
              <input type="number" id="sWD" placeholder="31" value={wd} onChange={(e) => setWd(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>أيام الحضور</label>
              <input type="number" id="sAD" placeholder="31" value={ad} onChange={(e) => setAd(e.target.value)} style={inp} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <div className="card" style={{ padding: 10 }}>
          <div className="ct" style={{ marginBottom: 8, fontSize: 12, color: "var(--gr)" }}>
            <i className="ti ti-plus-circle" /> استحقاقات
          </div>
          <div id="sExtraList">
            {extras.map((x) => (
              <div key={x.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 6, marginBottom: 6 }}>
                <input placeholder="بدل سفر..." value={x.label} onChange={(e) => setExtras(extras.map((y) => (y.id === x.id ? { ...y, label: e.target.value } : y)))} style={inp} />
                <input type="number" placeholder="0" value={x.value} onChange={(e) => setExtras(extras.map((y) => (y.id === x.id ? { ...y, value: e.target.value } : y)))} style={{ ...inp, padding: 7 }} />
                <button type="button" className="btn bsm" onClick={() => setExtras(extras.filter((y) => y.id !== x.id))} style={{ padding: "7px 10px", background: "var(--rd)", color: "#fff" }}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn bsm" onClick={() => { setExtras([...extras, { id: seq, label: "", value: "" }]); setSeq(seq + 1); }} style={{ color: "var(--gr)" }}>
            <i className="ti ti-plus" /> إضافة
          </button>
        </div>
        <div className="card" style={{ padding: 10 }}>
          <div className="ct" style={{ marginBottom: 8, fontSize: 12 }}>
            <i className="ti ti-minus" /> استقطاعات
          </div>
          <div id="sDedList">
            {deds.map((d) => (
              <div key={d.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 6, marginBottom: 6 }}>
                <input placeholder="سلفة..." value={d.label} onChange={(e) => setDeds(deds.map((y) => (y.id === d.id ? { ...y, label: e.target.value } : y)))} style={inp} />
                <select value={d.type} onChange={(e) => setDeds(deds.map((y) => (y.id === d.id ? { ...y, type: e.target.value as Ded["type"] } : y)))} style={{ ...inp, padding: 7 }}>
                  <option value="amount">مبلغ</option>
                  <option value="days">أيام</option>
                </select>
                <input type="number" placeholder="0" value={d.value} onChange={(e) => setDeds(deds.map((y) => (y.id === d.id ? { ...y, value: e.target.value } : y)))} style={{ ...inp, padding: 7 }} />
                <button type="button" className="btn bsm" onClick={() => setDeds(deds.filter((y) => y.id !== d.id))} style={{ padding: "7px 10px", background: "var(--rd)", color: "#fff" }}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn bsm" onClick={() => { setDeds([...deds, { id: seq, label: "", value: "", type: "amount" }]); setSeq(seq + 1); }} style={{ color: "var(--rd)" }}>
            <i className="ti ti-plus" /> إضافة
          </button>
        </div>
      </div>

      {res && (
        <>
          <div id="sDurInfo" style={{ background: "var(--c2)", borderRadius: 8, padding: "8px 12px", marginTop: 10, fontSize: 12, color: "var(--mu)" }}>
            {sDt(start)} — {sDt(end)} | {res.years} سنة {res.months} شهر {res.days} يوم ({res.totalYears.toFixed(4)})
          </div>
          {res.lawNote && (
            <div id="sLawNote" style={{ background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.2)", borderRadius: 8, padding: "6px 12px", marginTop: 8, fontSize: 11, color: "var(--mu)" }}>
              {res.lawNote}
            </div>
          )}
          <div id="sResult" style={{ marginTop: 10 }}>
            <div id="sBoxes" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 10 }}>
              {boxes.map((b) => (
                <div key={b[0]} style={{ borderRadius: 10, padding: 10, textAlign: "center", background: `color-mix(in srgb, ${b[2]} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${b[2]} 27%, transparent)` }}>
                  <div style={{ fontSize: 10, color: "var(--mu)" }}>{b[0]}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: b[2] }}>{b[1]}</div>
                  <div style={{ fontSize: 10, color: "var(--dm)" }}>ريال</div>
                </div>
              ))}
            </div>
            <div style={{ background: "var(--c2)", borderRadius: 10, padding: 12, textAlign: "center", marginBottom: 10, border: "1px solid var(--bd)" }}>
              <div id="sTotalLbl" style={{ fontSize: 11, color: "var(--mu)", marginBottom: 4 }}>
                إجمالي المخالصة — {law}
              </div>
              <div id="sTotal" style={{ fontSize: 26, fontWeight: 900, color: "var(--bl)" }}>
                {sNum(res.total)}
              </div>
              <div style={{ fontSize: 11, color: "var(--dm)" }}>ريال سعودي</div>
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody id="sBrk">
                  {sec("مدة الخدمة")}
                  {row("من", sDt(start))}
                  {row("إلى", sDt(end))}
                  {row("المدة", `${res.years} سنة + ${res.months} شهر + ${res.days} يوم`)}
                  {sec("مكافأة نهاية الخدمة")}
                  {row(law, sNum(res.e84) + " ر.س", "var(--bl)")}
                  {row("المستحق", res.award > 0 ? sNum(res.award) + " ر.س" : "لا تستحق", res.award > 0 ? "var(--gr)" : "var(--rd)")}
                  {sec("بدل الإجازة")}
                  {row("المتبقي", res.leaveRemaining + " يوم")}
                  {row("البدل", sNum(res.leaveComp) + " ر.س", "var(--am)")}
                  {res.leaveExcess > 0 && row("إجازة زائدة عن المستحق", `${res.leaveExcess} يوم (المستحق ${res.leaveDue} — المأخوذ ${parseInt(leaveTaken) || 0})`, "var(--rd)")}
                  {res.leaveExcess > 0 && row("خصم الإجازة الزائدة", "-" + sNum(res.leaveExcessDeduction) + " ر.س", "var(--rd)")}
                  {sec("راتب الفترة")}
                  {row("الإجمالي", sNum(res.periodSalary) + " ر.س", "var(--cy)")}
                  <tr style={{ background: "rgba(16,185,129,.08)" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 700, fontSize: 13 }}>💰 صافي المخالصة</td>
                    <td style={{ padding: "8px 10px", textAlign: "left", fontSize: 14, fontWeight: 900, color: "var(--bl)" }}>{sNum(res.total)} ريال</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" className="btn bgr bsm" onClick={() => window.print()}>
                <i className="ti ti-printer" /> طباعة
              </button>
              <button type="button" className="btn bsm" style={{ background: "#014D3D", color: "#fff" }} onClick={printOfficial}>
                <i className="ti ti-file-certificate" /> طباعة مخالصة رسمية
              </button>
              <button type="button" className="btn bsm" style={{ background: "var(--am)", color: "#fff" }} onClick={reset}>
                <i className="ti ti-refresh" /> تصفير
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
