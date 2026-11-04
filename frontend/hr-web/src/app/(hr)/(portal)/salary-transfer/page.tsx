"use client";

// Salary transfer file (ملف تحويل الرواتب — WPS / Mudad) in the updated design's form (its finance/Wps.jsx): the rows of
// OUR saved payroll sheet for the month (pay_YYYY_MM), filtered by payment method and employer, checked (10-digit ID,
// valid Saudi IBAN), and saved as Excel or CSV. The ID numbers come from OUR documents registry (HR / payroll readers);
// the IBAN from the payroll row. Employees whose service ended, or who are no longer in the employee list, are left out.
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/common/toast";
import { PageState } from "@/components/hr/not-built";
import type { PayRow } from "@/lib/calc/payroll";
import { money, p2, r2, saveCsv } from "@/lib/calc/month";
import { saveBlob } from "@/lib/exporter";
import { useLocale } from "@/lib/i18n/locale";
import { listDocRegistry, type DocRow } from "@/lib/registry";
import { getSalaryBasis, type SalaryBasisRow } from "@/lib/salary";
import { getSheet } from "@/lib/sheets";
import { buildXlsx } from "@/lib/xlsx";

const BANKS: Record<string, string> = { "05": "مصرف الإنماء", "10": "البنك الأهلي السعودي", "15": "بنك البلاد", "20": "بنك الرياض", "30": "البنك العربي الوطني", "45": "البنك السعودي البريطاني (ساب)", "55": "البنك السعودي الفرنسي", "60": "بنك الجزيرة", "65": "البنك السعودي للاستثمار", "80": "مصرف الراجحي" };
function ibanOK(s: string) {
  s = String(s || "").replace(/\s+/g, "").toUpperCase();
  if (!/^SA\d{22}$/.test(s)) return false;
  const r = s.slice(4) + s.slice(0, 4);
  let n = "";
  for (let i = 0; i < r.length; i++) { const c = r.charCodeAt(i); n += c >= 65 ? String(c - 55) : r[i]; }
  let rem = 0;
  for (let j = 0; j < n.length; j++) rem = (rem * 10 + +n[j]) % 97;
  return rem === 1;
}
const idOK = (s: string) => /^\d{10}$/.test(String(s || "").trim());
const num = (v: unknown) => Number(v) || 0;
const TD: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid rgba(36,48,68,.25)", fontSize: 11.5, whiteSpace: "nowrap" };
const INP: React.CSSProperties = { background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--tx)", padding: "6px 9px", fontSize: 12 };
const Lb = ({ t }: { t: string }) => <label style={{ fontSize: 10.5, color: "var(--mu)", display: "block", marginBottom: 3 }}>{t}</label>;
const Kpi = ({ l, v, c }: { l: string; v: React.ReactNode; c: string }) => (
  <div style={{ background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 12, padding: "10px 14px", minWidth: 170, flex: 1 }}><div style={{ fontSize: 11, color: "var(--mu)" }}>{l}</div><div style={{ fontSize: 19, fontWeight: 800, color: c, marginTop: 2 }}>{v}</div></div>
);

export default function Page() {
  const toast = useToast();
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (a: string, b: string) => (en ? b : a);
  const now = new Date(), pm0 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [y, setY] = useState(pm0.getFullYear());
  const [m, setM] = useState(pm0.getMonth() + 1);
  const [meth, setMeth] = useState("dom");
  const [er, setEr] = useState("");
  const [withBad, setWithBad] = useState(false);
  const [basis, setBasis] = useState<SalaryBasisRow[] | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [src, setSrc] = useState<{ rows: PayRow[]; approved: boolean } | null>(null);
  useEffect(() => {
    Promise.all([getSalaryBasis(), listDocRegistry().catch(() => [] as DocRow[])]).then(([b, d]) => { setBasis(b); setDocs(d); }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    let dead = false;
    getSheet(`pay_${y}_${p2(m)}`)
      .then((s) => { if (!dead) setSrc({ rows: Array.isArray(s.data) ? (s.data as PayRow[]) : [], approved: s.approved }); })
      .catch(() => { if (!dead) { setSrc({ rows: [], approved: false }); toast(T("تعذر تحميل المسير", "Could not load payroll"), "err"); } });
    return () => { dead = true; };
  }, [y, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map((basis ?? []).map((e) => [String(e.id), e])), [basis]);
  const idOf = useMemo(() => new Map(docs.map((d) => [String(d.id), d.national_id ?? ""])), [docs]);
  const ers = useMemo(() => [...new Set((src?.rows ?? []).map((r) => r.employer).filter(Boolean))], [src]);
  const built = useMemo(() => {
    const out: { r: PayRow; id: string; iban: string; bank: string; basic: number; hou: number; other: number; ded: number; net: number; problems: string[]; skip: boolean }[] = [];
    let bad = 0, ended = 0;
    (src?.rows ?? []).forEach((r) => {
      if (!r || !r.id) return;
      const cur = byId.get(String(r.id));
      if (!cur || cur.is_terminated || String(r.reason || "") !== "") { ended++; return; }
      const pm = String(r.payMethod || "مدد");
      if (meth === "dom" && !(pm === "مدد" || pm === "تحويل")) return;
      if (meth === "mudad" && pm !== "مدد") return;
      if (meth === "bank" && pm !== "تحويل") return;
      if (er && String(r.employer || "") !== er) return;
      const net = num(r.netSAR);
      if (net <= 0) return;
      const fx = num(r.exchRate) || 1;
      const basic = num(r.salByDays) * fx, hou = num(r.houPay) * fx, other = (num(r.traPay) + num(r.prjPay) + num(r.othPay) + num(r.overtime) + num(r.leaveComp) + num(r.eosAmt) + num(r.otherAllow)) * fx, ded = Math.max(0, basic + hou + other - net);
      const iban = String(cur.iban || r.iban || "").replace(/\s+/g, "").toUpperCase(), id = String(idOf.get(String(r.id)) || "").trim(), bank = iban.length >= 6 ? iban.slice(4, 6) : "";
      const problems: string[] = [];
      if (!idOK(id)) problems.push(T("رقم الهوية ناقص أو خاطئ", "ID missing/invalid"));
      if (!ibanOK(iban)) problems.push(iban ? T("آيبان غير صحيح", "Invalid IBAN") : T("الآيبان ناقص", "IBAN missing"));
      if (problems.length) bad++;
      out.push({ r, id, iban, bank, basic, hou, other, ded, net, problems, skip: problems.length > 0 && !withBad });
    });
    return { rows: out, bad, ended };
  }, [src, byId, idOf, meth, er, withBad, en]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!basis) return <div className="pg on"><PageState loading={!error} error={error} /></div>;

  const use = built.rows.filter((x) => !x.skip);
  const tot = use.reduce((a, x) => ({ basic: a.basic + x.basic, hou: a.hou + x.hou, other: a.other + x.other, ded: a.ded + x.ded, net: a.net + x.net }), { basic: 0, hou: 0, other: 0, ded: 0, net: 0 });
  const HEAD = [T("رقم الهوية/الإقامة", "ID / Iqama"), T("اسم الموظف", "Employee name"), T("رمز البنك", "Bank code"), T("اسم البنك", "Bank"), T("رقم الآيبان", "IBAN"), T("الراتب الأساسي", "Basic salary"), T("بدل السكن", "Housing"), T("بدلات أخرى", "Other earnings"), T("الاستقطاعات", "Deductions"), T("صافي الراتب", "Net salary"), T("شهر الراتب", "Salary month")];
  const dataRows = () => use.map((x) => [x.id, x.r.name || "", x.bank, BANKS[x.bank] || "", x.iban, r2(x.basic), r2(x.hou), r2(x.other), r2(x.ded), r2(x.net), m + "/" + y] as (string | number)[]);
  function xlsx() {
    const rows = dataRows();
    if (!rows.length) return toast(T("لا توجد صفوف للتصدير", "Nothing to export"), "err");
    const t: (string | number)[] = [T("الإجمالي", "Total"), "", "", "", "", 0, 0, 0, 0, 0, ""];
    for (let i = 5; i <= 9; i++) t[i] = r2(rows.reduce((a, r) => a + num(r[i]), 0));
    const blob = buildXlsx([{ name: "WPS", rows: [HEAD, ...rows, t], widths: [16, 30, 10, 24, 28, 14, 14, 14, 14, 14, 12] }]);
    saveBlob({ blob, name: "wps_" + y + "_" + p2(m) + ".xlsx", mime: blob.type });
  }
  function csv() {
    const rows = dataRows();
    if (!rows.length) return toast(T("لا توجد صفوف للتصدير", "Nothing to export"), "err");
    saveCsv("wps_" + y + "_" + p2(m) + ".csv", HEAD, rows);
  }
  const ys: number[] = [];
  for (let k = now.getFullYear() - 3; k <= now.getFullYear() + 10; k++) ys.push(k);
  return (
    <div className="pg on" style={{ padding: "12px 16px" }}>
      <div className="card" style={{ padding: 14 }}>
        <div className="ct" style={{ marginBottom: 10 }}><i className="ti ti-building-bank" /> {T("ملف تحويل الرواتب (WPS / مدد)", "Salary transfer file (WPS / Mudad)")}</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div><Lb t={T("السنة", "Year")} /><select id="WP_Y" value={y} onChange={(e) => setY(+e.target.value)} style={INP}>{ys.map((k) => <option key={k}>{k}</option>)}</select></div>
          <div><Lb t={T("الشهر", "Month")} /><select id="WP_M" value={m} onChange={(e) => setM(+e.target.value)} style={INP}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></div>
          <div><Lb t={T("طريقة الدفع", "Payment method")} /><select value={meth} onChange={(e) => setMeth(e.target.value)} style={INP}><option value="dom">{T("مدد + تحويل بنكي", "Mudad + bank transfer")}</option><option value="mudad">{T("مدد فقط", "Mudad only")}</option><option value="bank">{T("تحويل بنكي فقط", "Bank transfer only")}</option><option value="all">{T("الكل (حتى النقدي والدولي)", "All (incl. cash & international)")}</option></select></div>
          <div><Lb t={T("جهة العمل", "Employer")} /><select value={er} onChange={(e) => setEr(e.target.value)} style={INP}><option value="">{T("كل الجهات", "All employers")}</option>{ers.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
          <label style={{ fontSize: 12, paddingBottom: 7 }}><input type="checkbox" checked={withBad} onChange={(e) => setWithBad(e.target.checked)} /> {T("أضمّن الموظفين اللي بياناتهم ناقصة", "Include employees with incomplete data")}</label>
          <div style={{ display: "flex", gap: 6, marginInlineStart: "auto" }}>
            <button type="button" className="btn bpl bsm" onClick={xlsx}><i className="ti ti-file-spreadsheet" /> Excel</button>
            <button type="button" className="btn bgr bsm" onClick={csv}><i className="ti ti-file-type-csv" /> CSV</button>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12 }}>
          {src && src.rows.length > 0 && <>{T("مصدر المسير: ", "Payroll source: ")}<b>{T("المسير المحفوظ", "the saved payroll")}</b> — {src.approved ? <span style={{ color: "var(--gr)" }}>{T("معتمد", "approved")}</span> : <span style={{ color: "var(--am)" }}>{T("غير معتمد (مسودة)", "not approved (draft)")}</span>}</>}
          {built.ended > 0 && <span style={{ color: "var(--mu)" }}> — {T("استُبعد " + built.ended + " موظف منتهي الخدمة أو غير موجود في بيانات الموظفين", "Excluded " + built.ended + " ended-service / unknown employee(s)")}</span>}
          {built.bad > 0 && <span style={{ color: "var(--rd)" }}> — {built.bad} {T("موظف بياناته ناقصة (هوية/آيبان)", "employee(s) with missing/invalid ID or IBAN")}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
        <Kpi l={T("عدد التحويلات", "Transfers")} v={use.length} c="var(--cy)" />
        <Kpi l={T("إجمالي الصافي المطلوب تحويله (ر.س)", "Total net to transfer (SAR)")} v={money(tot.net)} c="var(--gr)" />
        <Kpi l={T("الاستقطاعات", "Deductions")} v={money(tot.ded)} c="var(--am)" />
      </div>
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        {!src ? <div style={{ padding: 26, textAlign: "center", color: "var(--mu)" }}>…</div> : !built.rows.length ? <div style={{ padding: 26, textAlign: "center", color: "var(--mu)" }}>{T('لا يوجد مسير لهذا الشهر. افتح "مسير الرواتب" أولاً.', 'No payroll for this month. Open "Payroll" first.')}</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{[T("م", "#"), T("الاسم", "Employee"), T("رقم الهوية", "ID"), T("البنك", "Bank"), T("الآيبان", "IBAN"), T("الأساسي", "Basic"), T("السكن", "Housing"), T("بدلات أخرى", "Other earnings"), T("الاستقطاعات", "Deductions"), T("الصافي", "Net"), T("ملاحظات", "Notes")].map((x) => <th key={x} style={{ background: "var(--c2)", padding: "7px 8px", textAlign: "right", fontSize: 10.5, fontWeight: 700, borderBottom: "2px solid var(--bl)", whiteSpace: "nowrap" }}>{x}</th>)}</tr></thead>
            <tbody>
              {built.rows.map((x, i) => {
                const st: React.CSSProperties = x.problems.length ? { background: "rgba(229,72,77,.08)" } : {};
                return (
                  <tr key={x.r.id} style={{ opacity: x.skip ? 0.55 : 1 }}>
                    <td style={{ ...TD, ...st }}>{i + 1}</td><td style={{ ...TD, ...st, fontWeight: 700 }}>{x.r.name || ""}</td><td style={{ ...TD, ...st, direction: "ltr", textAlign: "right" }}>{x.id || "—"}</td>
                    <td style={{ ...TD, ...st }}>{BANKS[x.bank] || x.bank || "—"}</td><td style={{ ...TD, ...st, direction: "ltr", textAlign: "right", fontSize: 10.5 }}>{x.iban || "—"}</td>
                    <td style={{ ...TD, ...st }}>{money(x.basic)}</td><td style={{ ...TD, ...st }}>{money(x.hou)}</td><td style={{ ...TD, ...st }}>{money(x.other)}</td><td style={{ ...TD, ...st, color: "var(--am)" }}>{money(x.ded)}</td><td style={{ ...TD, ...st, fontWeight: 800, color: "var(--gr)" }}>{money(x.net)}</td>
                    <td style={{ ...TD, ...st, color: "var(--rd)", fontSize: 10.5 }}>{x.problems.join(" / ")}{x.skip ? " (" + T("مستبعد", "excluded") + ")" : ""}</td>
                  </tr>
                );
              })}
              <tr style={{ background: "rgba(41,179,94,.12)", fontWeight: 800 }}><td colSpan={5} style={TD}>{T("الإجمالي", "Total")} ({use.length})</td><td style={TD}>{money(tot.basic)}</td><td style={TD}>{money(tot.hou)}</td><td style={TD}>{money(tot.other)}</td><td style={TD}>{money(tot.ded)}</td><td style={TD}>{money(tot.net)}</td><td style={TD} /></tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
