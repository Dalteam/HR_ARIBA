"use client";

// Monthly provisions report (تقرير المخصصات — end of service and leave) in the updated design's form (its
// finance/Prov.jsx). For every current employee, OUR payroll engine is asked what the company would owe if the service
// ended on the last day of the month for the chosen reason (full award) — the end-of-service award and the value of
// the remaining leave — and the same for the previous month end; the difference is «this month's increase». Leave used
// comes from OUR /leave/used-through. Consultants, Tamheer and trainees get no award (the engine decides, as in payroll).
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/common/toast";
import { PageState } from "@/components/hr/not-built";
import { printDoc, tfWrap } from "@/lib/calc/forms";
import { PAYX } from "@/lib/calc/payx";
import { autoWork, baseRow, enrich, isoDate, recalc, type MonthCtx, type PayRow } from "@/lib/calc/payroll";
import { esc, fillUsed, MN_AR, MN_EN, money, monthCtx, p2, r2 } from "@/lib/calc/month";
import { saveBlob } from "@/lib/exporter";
import { useLocale } from "@/lib/i18n/locale";
import { getGosiRates, getSalaryBasis, type SalaryBasisRow } from "@/lib/salary";
import { buildXlsx } from "@/lib/xlsx";

const TD: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid rgba(36,48,68,.25)", fontSize: 11.5, whiteSpace: "nowrap" };
const INP: React.CSSProperties = { background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--tx)", padding: "6px 9px", fontSize: 12 };
const Kpi = ({ l, v, c, unit }: { l: string; v: string; c: string; unit: string }) => (
  <div style={{ background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 12, padding: "10px 14px", minWidth: 190, flex: 1 }}><div style={{ fontSize: 11, color: "var(--mu)" }}>{l}</div><div style={{ fontSize: 19, fontWeight: 800, color: c, marginTop: 2 }}>{v} <span style={{ fontSize: 11, color: "var(--mu)" }}>{unit}</span></div></div>
);
const Lb = ({ t }: { t: string }) => <label style={{ fontSize: 10.5, color: "var(--mu)", display: "block", marginBottom: 3 }}>{t}</label>;
const NO_EOS = new Set(["consultant", "tamheer", "training"]);
type Line = { id: string; no: string; name: string; employer: string; join: string; svc: string; base: number; eos: number; leaveDays: number; leave: number; total: number; incEos: number; incLeave: number; incTotal: number; noEos: boolean };

/** The engine's rows for "service ends on the last day of `m` for `reason`", for every employee who had joined by then. */
async function ending(emps: SalaryBasisRow[], m: MonthCtx, reason: string): Promise<Map<string, PayRow>> {
  const rates = await getGosiRates(isoDate(m.end));
  const rows = emps
    .filter((e) => e.join_date && e.join_date.slice(0, 10) <= isoDate(m.end))
    .map((e) => {
      const r = enrich(baseRow(e, m.days), e);
      r.reason = reason;
      r.lastDay = isoDate(m.end);
      r.edited = true;
      autoWork(r, m);
      return r;
    });
  await fillUsed(rows, m);
  return new Map(rows.map((r) => [String(r.id), recalc(r, emps.find((e) => String(e.id) === String(r.id)), m, rates)]));
}

export default function Page() {
  const toast = useToast();
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (a: string, b: string) => (en ? b : a);
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth() + 1);
  const [reason, setReason] = useState("expiry");
  const [er, setEr] = useState("");
  const [basis, setBasis] = useState<SalaryBasisRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calc, setCalc] = useState<{ key: string; cur: Map<string, PayRow>; prev: Map<string, PayRow> } | null>(null);
  useEffect(() => { getSalaryBasis().then(setBasis).catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);
  const emps = useMemo(() => (basis ?? []).filter((e) => !e.is_terminated && e.category !== "hourly"), [basis]);
  const key = y + "-" + m + "-" + reason;
  useEffect(() => {
    if (!basis) return;
    let alive = true;
    const cm = monthCtx(y, m), pm = monthCtx(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
    Promise.all([ending(emps, cm, reason), ending(emps, pm, reason)])
      .then(([cur, prev]) => { if (alive) setCalc({ key, cur, prev }); })
      .catch((e) => { if (alive) toast(e instanceof Error ? e.message : String(e), "err"); });
    return () => { alive = false; };
  }, [basis, emps, y, m, reason, key, toast]);
  const ers = useMemo(() => [...new Set(emps.map((e) => e.workplace).filter(Boolean))] as string[], [emps]);
  const data = useMemo(() => {
    const rows: Line[] = [];
    if (calc && calc.key === key)
      emps
        .filter((e) => !er || e.workplace === er)
        .sort((a, b) => (String(a.workplace) !== String(b.workplace) ? String(a.workplace).localeCompare(String(b.workplace), "ar") : String(a.emp_no).localeCompare(String(b.emp_no), "en", { numeric: true })))
        .forEach((e) => {
          const c = calc.cur.get(String(e.id));
          if (!c) return;
          const p = calc.prev.get(String(e.id));
          const noEos = NO_EOS.has(e.category) || e.exclude_from_eos;
          const eos = noEos ? 0 : Number(c.eosAmt) || 0, leave = Number(c.leaveComp) || 0;
          const pEos = p && !noEos ? Number(p.eosAmt) || 0 : 0, pLeave = p ? Number(p.leaveComp) || 0 : 0;
          rows.push({ id: e.id, no: e.emp_no, name: e.name_ar.split(" ").slice(0, 3).join(" "), employer: e.workplace ?? "", join: String(e.join_date ?? "").slice(0, 10), svc: `${c.svcY ?? 0}y ${c.svcM ?? 0}m ${c.svcD ?? 0}d`, base: (Number(e.basic_salary) || 0) + (Number(e.housing_allowance) || 0), eos, leaveDays: Math.max(0, Number(c.P) || 0), leave, total: eos + leave, incEos: eos - pEos, incLeave: leave - pLeave, incTotal: eos + leave - pEos - pLeave, noEos });
        });
    const tot = rows.reduce((a, r) => ({ eos: a.eos + r.eos, leave: a.leave + r.leave, total: a.total + r.total, incEos: a.incEos + r.incEos, incLeave: a.incLeave + r.incLeave, incTotal: a.incTotal + r.incTotal }), { eos: 0, leave: 0, total: 0, incEos: 0, incLeave: 0, incTotal: 0 });
    return { rows, tot };
  }, [calc, key, emps, er]);
  if (!basis) return <div className="pg on"><PageState loading={!error} error={error} /></div>;

  const { rows, tot } = data;
  const mn = (en ? MN_EN : MN_AR)[m];
  const title = T("تقرير مخصصات نهاية الخدمة والإجازات — ", "End-of-service & leave provisions — ") + mn + " " + y;
  function print() {
    if (!rows.length) return;
    const th = "background:#014D3D;color:#fff;padding:4px 3px;font-size:8.5px;text-align:center;border:1px solid #014D3D", td = "padding:3px 4px;border:1px solid #d9e3df;text-align:center;font-size:9px";
    const heads = [T("م", "#"), T("الاسم", "Employee"), T("جهة العمل", "Employer"), T("الخدمة", "Service"), T("أجر أساسي + سكن", "Basic+housing"), T("مخصص نهاية الخدمة", "EOS"), T("أيام الإجازة", "Leave days"), T("مخصص الإجازات", "Leave"), T("الإجمالي", "Total"), T("زيادة الشهر", "Month increase")];
    let body = rows.map((r, i) => '<tr><td style="' + td + '">' + (i + 1) + '</td><td style="' + td + ';text-align:right;font-weight:700">' + esc(r.name) + '</td><td style="' + td + '">' + esc(r.employer) + '</td><td style="' + td + ';direction:ltr">' + esc(r.svc) + '</td><td style="' + td + '">' + money(r.base) + '</td><td style="' + td + '">' + (r.noEos ? "—" : money(r.eos)) + '</td><td style="' + td + '">' + r2(r.leaveDays) + '</td><td style="' + td + '">' + money(r.leave) + '</td><td style="' + td + ';font-weight:800">' + money(r.total) + '</td><td style="' + td + '">' + money(r.incTotal) + "</td></tr>").join("");
    body += '<tr style="background:#014D3D;color:#fff;font-weight:800"><td colspan="5" style="' + td + ';text-align:right;color:#fff">' + T("الإجمالي", "Total") + " (" + rows.length + ')</td><td style="' + td + '">' + money(tot.eos) + '</td><td style="' + td + '"></td><td style="' + td + '">' + money(tot.leave) + '</td><td style="' + td + '">' + money(tot.total) + '</td><td style="' + td + '">' + money(tot.incTotal) + "</td></tr>";
    const html = '<div dir="' + (en ? "ltr" : "rtl") + '" style="font-family:Tahoma,Arial,sans-serif"><div style="text-align:center;margin:2mm 0 3mm;font-size:10.5px;color:#555">' + T("المطلوب توفيره عن الشهر: ", "To set aside for the month: ") + "<b>" + money(tot.incTotal) + " " + T("ر.س", "SAR") + '</b></div><table style="width:100%;border-collapse:collapse"><thead><tr>' + heads.map((x) => '<th style="' + th + '">' + esc(x) + "</th>").join("") + "</tr></thead><tbody>" + body + "</tbody></table></div>";
    printDoc(title, tfWrap(title, "", html));
  }
  function xlsx() {
    if (!rows.length) return toast(T("لا يوجد موظفين", "No employees"), "err");
    const head = [T("الرقم", "No."), T("الاسم", "Employee"), T("جهة العمل", "Employer"), T("تاريخ المباشرة", "Joined"), T("مدة الخدمة", "Service"), T("أجر أساسي + سكن", "Basic + housing"), T("مخصص نهاية الخدمة", "EOS provision"), T("أيام الإجازة", "Leave days"), T("مخصص الإجازات", "Leave provision"), T("الإجمالي", "Total"), T("زيادة نهاية الخدمة", "EOS increase"), T("زيادة الإجازات", "Leave increase"), T("زيادة الشهر", "Month increase")];
    const d: (string | number)[][] = rows.map((r) => [r.no, r.name, r.employer, r.join, r.svc, r2(r.base), r2(r.eos), r2(r.leaveDays), r2(r.leave), r2(r.total), r2(r.incEos), r2(r.incLeave), r2(r.incTotal)]);
    d.push([T("الإجمالي", "Total"), "", "", "", "", "", r2(tot.eos), "", r2(tot.leave), r2(tot.total), r2(tot.incEos), r2(tot.incLeave), r2(tot.incTotal)]);
    const blob = buildXlsx([{ name: T("المخصصات", "Provisions"), rows: [[title], [], head, ...d], widths: [10, 28, 14, 12, 12, 14, 16, 12, 16, 16, 16, 16, 16] }]);
    saveBlob({ blob, name: "provisions_" + y + "_" + p2(m) + ".xlsx", mime: blob.type });
  }
  const ys: number[] = [];
  for (let k = now.getFullYear() - 3; k <= now.getFullYear() + 10; k++) ys.push(k);
  const ropts = ["expiry", "agree", "arb77", "retire"].map((k) => PAYX.findReason(k)).filter(Boolean) as { k: string; ar: string; en: string }[];
  const heads = [T("م", "#"), T("الرقم", "No."), T("الاسم", "Employee"), T("جهة العمل", "Employer"), T("مدة الخدمة", "Service"), T("الأجر الأساسي + السكن", "Basic + housing"), T("مخصص نهاية الخدمة", "EOS provision"), T("رصيد الإجازة (يوم)", "Leave balance (days)"), T("مخصص الإجازات", "Leave provision"), T("الإجمالي", "Total"), T("زيادة الشهر", "This month's increase")];
  return (
    <div className="pg on" style={{ padding: "12px 16px" }}>
      <div className="card" style={{ padding: 14 }}>
        <div className="ct" style={{ marginBottom: 10 }}><i className="ti ti-pig-money" /> {T("تقرير المخصصات الشهري (نهاية الخدمة والإجازات)", "Monthly provisions report (end of service & leave)")}</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div><Lb t={T("السنة", "Year")} /><select value={y} onChange={(e) => setY(+e.target.value)} style={INP}>{ys.map((k) => <option key={k}>{k}</option>)}</select></div>
          <div><Lb t={T("الشهر", "Month")} /><select value={m} onChange={(e) => setM(+e.target.value)} style={INP}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{(en ? MN_EN : MN_AR)[i + 1]}</option>)}</select></div>
          <div style={{ minWidth: 260 }}><Lb t={T("أساس حساب مكافأة نهاية الخدمة", "EOS calculation basis")} /><select value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...INP, width: "100%" }}>{ropts.map((R) => <option key={R.k} value={R.k}>{en ? R.en : R.ar}</option>)}</select></div>
          <div><Lb t={T("جهة العمل", "Employer")} /><select value={er} onChange={(e) => setEr(e.target.value)} style={INP}><option value="">{T("كل الجهات", "All employers")}</option>{ers.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
          <div style={{ display: "flex", gap: 6, marginInlineStart: "auto" }}>
            <button type="button" className="btn bgr bsm" onClick={print}><i className="ti ti-printer" /> {T("طباعة", "Print")}</button>
            <button type="button" className="btn bpl bsm" onClick={xlsx}><i className="ti ti-file-spreadsheet" /> Excel</button>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--mu)" }}>{T('المخصص = ما يجب على الشركة دفعه لو انتهت خدمة كل الموظفين الحاليين في آخر الشهر (مكافأة كاملة) + قيمة رصيد الإجازات. "زيادة الشهر" = الفرق عن آخر الشهر السابق. الاستشاري والتمهير والتدريب بدون مكافأة.', 'Provision = what the company would owe if every current employee left at month end (full award) + the value of the leave balance. "Month increase" = difference from the previous month end. Consultants, Tamheer and trainees have no award.')}</div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
        <Kpi l={T("مخصص نهاية الخدمة (تراكمي)", "End-of-service provision (cumulative)")} v={money(tot.eos)} c="var(--bl)" unit={T("ر.س", "SAR")} />
        <Kpi l={T("مخصص الإجازات (تراكمي)", "Leave provision (cumulative)")} v={money(tot.leave)} c="var(--am)" unit={T("ر.س", "SAR")} />
        <Kpi l={T("إجمالي المخصصات", "Total provisions")} v={money(tot.total)} c="var(--gr)" unit={T("ر.س", "SAR")} />
        <Kpi l={T("المطلوب توفيره عن هذا الشهر", "To set aside for this month")} v={money(tot.incTotal)} c="var(--cy)" unit={T("ر.س", "SAR")} />
      </div>
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        {!calc || calc.key !== key ? <div style={{ padding: 26, textAlign: "center", color: "var(--mu)" }}>…</div> : !rows.length ? <div style={{ padding: 26, textAlign: "center", color: "var(--mu)" }}>{T("لا يوجد موظفين", "No employees")}</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{heads.map((x) => <th key={x} style={{ background: "var(--c2)", padding: "7px 8px", textAlign: "right", fontSize: 10.5, fontWeight: 700, borderBottom: "2px solid var(--bl)", whiteSpace: "nowrap" }}>{x}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td style={TD}>{i + 1}</td><td style={TD}>{r.no}</td><td style={{ ...TD, fontWeight: 700 }}>{r.name}</td><td style={TD}>{r.employer}</td><td style={{ ...TD, direction: "ltr", textAlign: "right" }}>{r.svc}</td><td style={TD}>{money(r.base)}</td>
                  <td style={TD}>{r.noEos ? <span style={{ color: "var(--mu)" }}>{T("لا مكافأة", "No award")}</span> : money(r.eos)}</td><td style={TD}>{r2(r.leaveDays)}</td><td style={TD}>{money(r.leave)}</td><td style={{ ...TD, fontWeight: 800 }}>{money(r.total)}</td><td style={{ ...TD, color: "var(--gr)" }}>{money(r.incTotal)}</td>
                </tr>
              ))}
              <tr style={{ background: "rgba(41,179,94,.12)", fontWeight: 800 }}><td colSpan={6} style={TD}>{T("الإجمالي", "Total")} ({rows.length})</td><td style={TD}>{money(tot.eos)}</td><td style={TD} /><td style={TD}>{money(tot.leave)}</td><td style={TD}>{money(tot.total)}</td><td style={TD}>{money(tot.incTotal)}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
