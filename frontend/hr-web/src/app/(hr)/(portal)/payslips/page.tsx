"use client";

// Payslip (كشف الراتب) — port of #pg-slip / rSlip (V60) + the official letterhead print (V69).
// Reads the employee's row from the approved payroll sheet for the month; otherwise falls back to
// employee data (total − insurance − deductions), exactly like the legacy.
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/common/toast";
import { PageState } from "@/components/hr/not-built";
import { calcEmployeeGosi, currencyLabel, isLocalCurrency, MONTHS_AR, money, num, p2, type PayRow } from "@/lib/calc/payroll";
import { getGosiRates, getSalaryBasis, fN, type SalaryBasisRow } from "@/lib/salary";
import { getSheet } from "@/lib/sheets";

const row = (l: string, v: React.ReactNode, color?: string) => (
  <div className="prow" style={{ color: color || "var(--dm)" }}>
    <span>{l}</span>
    <span style={{ fontWeight: color ? 600 : 400 }}>{v}</span>
  </div>
);

export default function Page() {
  const toast = useToast();
  const now = new Date();
  const [basis, setBasis] = useState<SalaryBasisRow[] | null>(null);
  const [rates, setRates] = useState<Awaited<ReturnType<typeof getGosiRates>> | null>(null);
  const [sheetRows, setSheetRows] = useState<PayRow[] | null>(null);
  const [approved, setApproved] = useState(false);
  const [empId, setEmpId] = useState("");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const employees = useMemo(
    () =>
      (basis ?? []).filter(
        (e) =>
          num(e.basic_salary) + num(e.housing_allowance) + num(e.transport_allowance) + num(e.project_allowance) + num(e.other_allowances) > 0,
      ),
    [basis],
  );
  const emp = employees.find((e) => String(e.id) === empId);
  const key = `pay_${year}_${p2(month)}`;
  const on = `${year}-${p2(month)}-${p2(new Date(year, month, 0).getDate())}`;

  useEffect(() => {
    let alive = true;
    getSalaryBasis()
      .then((b) => alive && setBasis(b))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [reloadTick]);

  useEffect(() => {
    let alive = true;
    Promise.all([getGosiRates(on), getSheet(key)])
      .then(([r, sheet]) => {
        if (!alive) return;
        setError(null);
        setRates(r);
        setApproved(sheet.approved);
        setSheetRows(Array.isArray(sheet.data) ? (sheet.data as PayRow[]) : null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [key, on, reloadTick]);

  const rowData = useMemo(() => {
    if (!emp) return null;
    const pr = approved && sheetRows ? sheetRows.find((r) => String(r.id) === String(emp.id)) : null;
    if (pr) {
      return {
        basic: num(pr.sal),
        hou: num(pr.hou),
        tra: num(pr.tra),
        prj: num(pr.prj),
        oth: num(pr.oth),
        gross: num(pr.totalDue),
        ins: num(pr.insEmp),
        ded: num(pr.otherDeduct) || num(pr.loanDeduct),
        net: num(pr.net) || num(pr.netSAR),
        employer: num(pr.insEr),
      };
    }
    const basic = num(emp.basic_salary);
    const hou = num(emp.housing_allowance);
    const tra = num(emp.transport_allowance);
    const prj = num(emp.project_allowance);
    const oth = num(emp.other_allowances);
    const gross = basic + hou + tra + prj + oth;
    const g = rates ? calcEmployeeGosi(emp, rates, on) : { employee: 0, employer: 0 };
    const ded = num(emp.other_deductions);
    return { basic, hou, tra, prj, oth, gross, ins: g.employee, ded, net: gross - g.employee - ded, employer: g.employer };
  }, [emp, approved, sheetRows, rates, on]);

  function printOfficial() {
    if (!emp || !rowData) return toast("اختر الموظف أولاً", "err");
    const period = `${MONTHS_AR[month]} ${year}`;
    const cur = isLocalCurrency(emp.currency) ? "ريال سعودي" : currencyLabel(emp.currency);
    const html = `<style>
      @page{size:A4;margin:10mm 12mm}*{box-sizing:border-box}body{margin:0;font-family:"ARIBA Two","Segoe UI",Tahoma,Arial,sans-serif;color:#10231c;direction:rtl}
      .lh-head,.lh-foot{width:100%;display:block}.lh-head{margin-bottom:4mm}.lh-foot{margin-top:4mm}
      .hd{text-align:center;border-bottom:2px solid #014D3D;padding-bottom:6px;margin-bottom:8px}.hd .ti{font-size:18px;font-weight:900;color:#014D3D}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;background:#f6f9f8;border:1px solid #d9e3df;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px}
      .two-col{display:grid;grid-template-columns:1fr 1fr;gap:10px}.doc-table{width:100%;border-collapse:collapse;font-size:12px}
      .doc-table td{border:1px solid #d9e3df;padding:4px 8px}.doc-table td:last-child{text-align:left;font-weight:600}
      .sec{background:#e8f0ee;color:#014D3D;padding:5px 8px;font-size:13px;margin:0 0 6px;border-radius:4px}
      .net-box{margin-top:10px;background:linear-gradient(135deg,rgba(1,77,61,.12),rgba(6,182,212,.08));border:2px solid #014D3D;border-radius:10px;padding:14px;text-align:center}
      .net-box .lbl{font-size:11px;color:#555}.net-box .val{font-size:22px;font-weight:900;color:#014D3D}
      .sign{display:flex;justify-content:space-between;margin-top:14px;font-size:12px;font-weight:700}
    </style>
    <img class="lh-head" src="/brand/letterhead-header.jpg">
    <div class="hd"><div class="ti">كشف راتب — ${period}</div></div>
    <div class="info-grid">
      <div><b>الاسم:</b> ${emp.name_ar}</div><div><b>الرقم الوظيفي:</b> ${emp.emp_no}</div>
      <div><b>الوظيفة:</b> ${emp.job_title || "—"}</div><div><b>جهة العمل:</b> ${emp.workplace || "—"}</div>
      <div><b>البنك:</b> ${emp.bank_name || "—"}</div><div><b>IBAN:</b> ${emp.iban || "—"}</div>
    </div>
    <div class="two-col">
      <div><h3 class="sec">➕ الاستحقاقات</h3><table class="doc-table">
        <tr><td>الراتب الأساسي</td><td>${money(rowData.basic)}</td></tr>
        <tr><td>بدل السكن</td><td>${money(rowData.hou)}</td></tr>
        <tr><td>بدل المواصلات</td><td>${money(rowData.tra)}</td></tr>
        ${rowData.prj ? `<tr><td>بدل المشروع</td><td>${money(rowData.prj)}</td></tr>` : ""}
        ${rowData.oth ? `<tr><td>بدلات أخرى</td><td>${money(rowData.oth)}</td></tr>` : ""}
        <tr style="font-weight:800;background:#f0f6f4"><td>الإجمالي</td><td style="color:#0a7a3f">${money(rowData.gross)}</td></tr>
      </table></div>
      <div><h3 class="sec">➖ الاستقطاعات</h3><table class="doc-table">
        <tr><td>التأمينات الاجتماعية</td><td>${rowData.ins ? "-" + money(rowData.ins) : "—"}</td></tr>
        <tr><td>استقطاعات أخرى</td><td>${rowData.ded ? "-" + money(rowData.ded) : "—"}</td></tr>
        <tr style="font-weight:800;background:#fbeeee"><td>إجمالي الاستقطاعات</td><td style="color:#c0392b">-${money(rowData.ins + rowData.ded)}</td></tr>
      </table></div>
    </div>
    <div class="net-box"><div class="lbl">صافي الراتب المستحق</div><div class="val">${money(rowData.net)} ${cur}</div></div>
    <div class="sign"><div>الموظف: ${emp.name_ar}</div><div>الموارد البشرية: ________________</div></div>
    <img class="lh-foot" src="/brand/letterhead-footer.jpg">`;
    const w = window.open("", "_blank");
    if (!w) return toast("اسمح بالنوافذ المنبثقة", "err");
    w.document.open();
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>كشف راتب — ${emp.name_ar} — ${period}</title></head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch {
        /* ignore */
      }
    }, 500);
  }

  if (error) return <PageState error={error} onRetry={() => setReloadTick((t) => t + 1)} />;
  if (!basis) return <PageState loading />;

  const cur = emp ? (isLocalCurrency(emp.currency) ? "ريال سعودي" : currencyLabel(emp.currency)) : "ريال سعودي";

  return (
    <div className="pg on" id="pg-slip">
      <div className="card" style={{ padding: 0 }}>
        <div className="ch" style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className="ct" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-receipt" />
            <span id="t_slip">كشف الراتب التفصيلي</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">— اختر موظفاً —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name_ar} {e.is_terminated ? "(منتهي)" : ""}
                </option>
              ))}
            </select>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ maxWidth: 120 }}>
              {MONTHS_AR.slice(1).map((name, i) => (
                <option key={i + 1} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ maxWidth: 100 }}>
              {Array.from({ length: 26 }, (_, i) => now.getFullYear() - 15 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button type="button" className="btn bsm" style={{ background: "#014D3D", color: "#fff", whiteSpace: "nowrap" }} onClick={printOfficial}>
              <i className="ti ti-file-certificate" /> طباعة رسمية
            </button>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          {!emp || !rowData ? (
            <div style={{ textAlign: "center", color: "var(--mu)", padding: 20 }}>اختر موظفًا لعرض كشف الراتب</div>
          ) : (
            <div className="psc">
              <div style={{ textAlign: "center", marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid var(--bd)" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "var(--bl)" }}>شركة اريبا لخدمات الأعمال</div>
                <div style={{ fontSize: 12, color: "var(--mu)", marginTop: 3 }}>
                  كشف راتب — {MONTHS_AR[month]} {year} {approved ? "" : "(غير معتمد)"}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16, background: "var(--c2)", borderRadius: 8, padding: 10 }}>
                <div><div style={{ fontSize: 10, color: "var(--dm)" }}>الموظف</div><div style={{ fontWeight: 700 }}>{emp.name_ar}</div></div>
                <div><div style={{ fontSize: 10, color: "var(--dm)" }}>الوظيفة</div><div>{emp.job_title || "—"}</div></div>
                <div><div style={{ fontSize: 10, color: "var(--dm)" }}>جهة العمل</div><div>{emp.workplace || "—"}</div></div>
                <div><div style={{ fontSize: 10, color: "var(--dm)" }}>البنك</div><div>{emp.bank_name || "—"}</div></div>
                <div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: 10, color: "var(--dm)" }}>IBAN</div><div style={{ fontFamily: "monospace", fontSize: 11 }}>{emp.iban || "—"}</div></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div style={{ background: "rgba(16,185,129,.07)", border: "1px solid rgba(16,185,129,.2)", borderRadius: 9, padding: 13 }}>
                  <div style={{ fontWeight: 700, color: "var(--gr)", marginBottom: 9, fontSize: 12 }}>الاستحقاقات</div>
                  {row("الراتب الأساسي", rowData.basic ? `${fN(rowData.basic)} ر.س` : "—")}
                  {row("بدل السكن", rowData.hou ? `${fN(rowData.hou)} ر.س` : "—")}
                  {row("بدل المواصلات", rowData.tra ? `${fN(rowData.tra)} ر.س` : "—")}
                  {row("بدل المشروع", rowData.prj ? `${fN(rowData.prj)} ر.س` : "—")}
                  {row("بدلات أخرى", rowData.oth ? `${fN(rowData.oth)} ر.س` : "—")}
                  <div style={{ borderTop: "1px solid rgba(16,185,129,.3)", marginTop: 8, paddingTop: 7, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
                    <span>الإجمالي</span><span style={{ color: "var(--gr)" }}>{fN(rowData.gross)} {cur}</span>
                  </div>
                </div>
                <div style={{ background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 9, padding: 13 }}>
                  <div style={{ fontWeight: 700, color: "var(--rd)", marginBottom: 9, fontSize: 12 }}>الاستقطاعات</div>
                  {row("التأمينات الاجتماعية", rowData.ins ? `-${fN(rowData.ins)} ر.س` : "—", rowData.ins ? "var(--rd)" : "var(--dm)")}
                  {row("استقطاعات أخرى", rowData.ded ? `-${fN(rowData.ded)} ر.س` : "—", rowData.ded ? "var(--rd)" : "var(--dm)")}
                  <div style={{ borderTop: "1px solid rgba(239,68,68,.3)", marginTop: 8, paddingTop: 7, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
                    <span>إجمالي الاستقطاعات</span><span style={{ color: "var(--rd)" }}>-{fN(rowData.ins + rowData.ded)} {cur}</span>
                  </div>
                </div>
              </div>
              {rowData.employer > 0 && (
                <div className="al alb" style={{ marginBottom: 12 }}>
                  <i className="ti ti-info-circle" />
                  <span style={{ fontSize: 11 }}>تأمينات الشركة: {fN(rowData.employer)} ر.س — لا تُخصم من الموظف</span>
                </div>
              )}
              <div style={{ background: "linear-gradient(135deg,rgba(59,130,246,.15),rgba(6,182,212,.1))", border: "2px solid var(--bl)", borderRadius: 11, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 5 }}>صافي الراتب المستحق</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "var(--bl)" }}>{fN(rowData.net)} <span style={{ fontSize: 16 }}>{cur}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
