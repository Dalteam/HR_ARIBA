"use client";

// Monthly social-insurance calculator (حاسبة التأمينات) in the updated design's form (its finance/InsCalc.jsx). The
// figures come from OUR payroll engine for the chosen month (the same rows, insurance days and GOSI rates the payroll
// uses), so the calculator and the payroll never disagree. Insurance days can be changed per row («↺» back to automatic);
// the GOSI file uses the ID numbers of OUR documents registry. Payroll readers only (the route list allows them).
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/common/toast";
import { DateField } from "@/components/common/date-time-field";
import { PageState } from "@/components/hr/not-built";
import { printDoc, tfWrap } from "@/lib/calc/forms";
import { buildRows, recalc, type PayRow } from "@/lib/calc/payroll";
import { esc, fillUsed, MN_AR, MN_EN, money, monthCtx, p2, r2, saveCsv } from "@/lib/calc/month";
import { saveBlob } from "@/lib/exporter";
import { useLocale } from "@/lib/i18n/locale";
import { listDocRegistry, type DocRow } from "@/lib/registry";
import { getGosiRates, getSalaryBasis, type GosiRates, type SalaryBasisRow } from "@/lib/salary";
import { buildXlsx } from "@/lib/xlsx";
import { todayIso } from "@/lib/format";

const TD: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid rgba(36,48,68,.25)", textAlign: "right", whiteSpace: "nowrap", fontSize: 11.5 };
const INP: React.CSSProperties = { background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--tx)", padding: "6px 9px", fontSize: 12 };
const Kpi = ({ l, v, c }: { l: string; v: React.ReactNode; c: string }) => (
  <div style={{ background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 12, padding: "10px 14px", minWidth: 150, flex: 1 }}>
    <div style={{ fontSize: 11, color: "var(--mu)" }}>{l}</div><div style={{ fontSize: 19, fontWeight: 800, color: c, marginTop: 2 }}>{v}</div>
  </div>
);
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

export default function Page() {
  const toast = useToast();
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (a: string, b: string) => (en ? b : a);
  const [basis, setBasis] = useState<SalaryBasisRow[] | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [selEmp, setSelEmp] = useState("");
  const [selEr, setSelEr] = useState("");
  const [over, setOver] = useState<Record<string, string>>({});
  const [calc, setCalc] = useState<{ key: string; rows: PayRow[]; rates: GosiRates } | null>(null);
  useEffect(() => {
    Promise.all([getSalaryBasis(), listDocRegistry().catch(() => [] as DocRow[])]).then(([b, d]) => { setBasis(b); setDocs(d); }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const d = new Date((date || todayIso()) + "T00:00:00");
  const yy = d.getFullYear(), mm = d.getMonth() + 1;
  const m = useMemo(() => monthCtx(yy, mm), [yy, mm]);
  const mkey = m.y + "-" + m.m;
  useEffect(() => {
    if (!basis) return;
    let alive = true;
    (async () => {
      const rates = await getGosiRates(iso(m.end));
      const rows = buildRows(basis, m, []);
      await fillUsed(rows, m).catch(() => undefined);
      if (alive) setCalc({ key: mkey, rows: rows.map((r) => recalc(r, basis.find((e) => String(e.id) === String(r.id)), m, rates)), rates });
    })().catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [basis, m, mkey]);
  const byId = useMemo(() => new Map((basis ?? []).map((e) => [String(e.id), e])), [basis]);
  const ers = useMemo(() => [...new Set((calc?.rows ?? []).map((r) => r.employer).filter(Boolean))], [calc]);
  const data = useMemo(() => {
    if (!calc || calc.key !== mkey) return { rows: [] as (PayRow & { manual: boolean })[], tot: { emp: 0, co: 0, total: 0 } };
    const rows = calc.rows
      .filter((r) => (!selEmp || String(r.id) === selEmp) && (!selEr || r.employer === selEr))
      .map((r) => {
        const k = mkey + "-" + r.id;
        if (over[k] === undefined) return { ...r, manual: false };
        const x = { ...r, manualEdits: { ...r.manualEdits, insDays: true }, insDays: Math.max(0, Math.min(m.days, Number(over[k]) || 0)) };
        return { ...recalc(x, byId.get(String(r.id)), m, calc.rates), manual: true };
      })
      .sort((a, b) => (a.employer !== b.employer ? String(a.employer).localeCompare(String(b.employer), "ar") : String(a.empNo).localeCompare(String(b.empNo), "en", { numeric: true })));
    const tot = { emp: 0, co: 0, total: 0 };
    rows.forEach((r) => { tot.emp += Number(r.insEmp) || 0; tot.co += Number(r.insEr) || 0; tot.total += (Number(r.insEmp) || 0) + (Number(r.insEr) || 0); });
    return { rows, tot };
  }, [calc, mkey, selEmp, selEr, over, byId, m]);
  if (!basis) return <div className="pg on"><PageState loading={!error} error={error} /></div>;

  const mn = (en ? MN_EN : MN_AR)[m.m];
  const shift = (k: number) => setDate(iso(new Date(d.getFullYear(), d.getMonth() + k, 1)));
  const head = [T("م", "#"), T("الرقم", "No."), T("الاسم", "Employee"), T("جهة العمل", "Employer"), T("حالة التأمينات", "Status"), T("الأجر الخاضع", "Insurable wage"), T("أيام التأمينات", "Ins. days"), T("حصة الموظف", "Employee share"), T("حصة الشركة", "Company share"), T("الإجمالي", "Total")];
  const short = (s: string) => s.split(" ").slice(0, 3).join(" ");
  const tot = (r: PayRow) => (Number(r.insEmp) || 0) + (Number(r.insEr) || 0);
  function xlsx() {
    if (!data.rows.length) return toast(T("لا يوجد موظفين", "No employees"), "err");
    const hh = [T("م", "#"), T("الرقم", "No."), T("الاسم", "Employee"), T("جهة العمل", "Employer"), T("الجنسية", "Nationality"), T("حالة التأمينات", "Status"), T("الأجر الخاضع", "Insurable wage"), T("أيام التأمينات", "Ins. days"), T("حصة الموظف", "Employee share"), T("حصة الشركة", "Company share"), T("الإجمالي", "Total")];
    const rows = [[T("حاسبة التأمينات الاجتماعية — ", "Social insurance calculation — ") + mn + " " + m.y], [], hh, ...data.rows.map((x, i) => [i + 1, x.empNo, short(x.name), x.employer, x.nat, x.insStatus, r2(x.insBase), x.insDays, r2(x.insEmp), r2(x.insEr), r2(tot(x))]), [T("الإجمالي", "Total"), "", "", "", "", "", "", "", r2(data.tot.emp), r2(data.tot.co), r2(data.tot.total)]];
    const blob = buildXlsx([{ name: T("التأمينات", "Insurance"), rows, widths: [6, 10, 28, 14, 14, 16, 14, 12, 14, 14, 14] }]);
    saveBlob({ blob, name: "insurance_" + m.y + "_" + p2(m.m) + ".xlsx", mime: blob.type });
  }
  function gosi(csv: boolean) {
    const rows = data.rows.filter((x) => x.insStatus !== "غير خاضع" && x.insStatus !== "لا يطبق" && Number(x.insBase) > 0);
    if (!rows.length) return toast(T("لا يوجد مشتركين خاضعين في هذا الشهر", "No subject subscribers this month"), "err");
    const idOf = (id: string) => docs.find((x) => String(x.id) === String(id))?.national_id ?? "";
    const h = [T("رقم الهوية/الإقامة", "ID / Iqama"), T("اسم المشترك", "Subscriber name"), T("الجنسية", "Nationality"), T("تاريخ الميلاد", "Date of birth"), T("تاريخ الالتحاق", "Joining date"), T("الأجر الأساسي", "Basic wage"), T("بدل السكن", "Housing"), T("الأجر الخاضع", "Insurable wage"), T("أيام الاشتراك", "Days"), T("حصة المشترك", "Employee share"), T("حصة المنشأة", "Employer share"), T("الإجمالي", "Total")];
    const body = rows.map((x) => { const e = byId.get(String(x.id)); return [idOf(x.id), short(x.name), x.nat, String(e?.birth_date ?? "").slice(0, 10), String(e?.join_date ?? "").slice(0, 10), r2(e?.basic_salary), r2(e?.housing_allowance), r2(x.insBase), x.insDays, r2(x.insEmp), r2(x.insEr), r2(tot(x))] as (string | number)[]; });
    const t: (string | number)[] = [T("الإجمالي", "Total") + " (" + body.length + ")", "", "", "", "", "", "", "", "", 0, 0, 0];
    [9, 10, 11].forEach((i) => { t[i] = r2(body.reduce((a, r) => a + (Number(r[i]) || 0), 0)); });
    const name = "gosi_" + m.y + "_" + p2(m.m);
    if (csv) return saveCsv(name + ".csv", h, [...body, t]);
    const blob = buildXlsx([{ name: "GOSI", rows: [h, ...body, t], widths: [16, 28, 14, 12, 12, 14, 14, 14, 10, 14, 14, 14] }]);
    saveBlob({ blob, name: name + ".xlsx", mime: blob.type });
  }
  function print() {
    if (!data.rows.length) return toast(T("لا يوجد موظفين", "No employees"), "err");
    const title = T("حاسبة التأمينات الاجتماعية — ", "Social insurance calculation — ") + mn + " " + m.y;
    const th = "background:#014D3D;color:#fff;padding:4px 3px;font-size:9px;text-align:center;border:1px solid #014D3D", td = "padding:3px 4px;border:1px solid #d9e3df;text-align:center;font-size:9.5px", tdn = "padding:3px 4px;border:1px solid #d9e3df;text-align:right;font-size:9.5px;font-weight:700";
    let body = "", i = 0, cur: string | null = null, grp: { emp: number; co: number; total: number; n: number } | null = null;
    const flush = () => { if (grp) body += '<tr style="background:#e8f3ee;font-weight:800"><td colspan="7" style="' + tdn + '">' + T("إجمالي ", "Total ") + esc(cur || "—") + " (" + grp.n + ')</td><td style="' + td + '">' + money(grp.emp) + '</td><td style="' + td + '">' + money(grp.co) + '</td><td style="' + td + '">' + money(grp.total) + "</td></tr>"; };
    data.rows.forEach((x) => {
      if (x.employer !== cur || !grp) { flush(); cur = x.employer; grp = { emp: 0, co: 0, total: 0, n: 0 }; body += '<tr style="background:#f1f6f4"><td colspan="10" style="' + tdn + ';color:#014D3D">' + esc(cur || "—") + "</td></tr>"; }
      grp.emp += Number(x.insEmp) || 0; grp.co += Number(x.insEr) || 0; grp.total += tot(x); grp.n++; i++;
      body += '<tr><td style="' + td + '">' + i + '</td><td style="' + td + '">' + esc(x.empNo) + '</td><td style="' + tdn + '">' + esc(short(x.name)) + '</td><td style="' + td + '">' + esc(x.employer) + '</td><td style="' + td + '">' + esc(x.insStatus) + '</td><td style="' + td + '">' + money(x.insBase) + '</td><td style="' + td + '">' + x.insDays + '</td><td style="' + td + '">' + money(x.insEmp) + '</td><td style="' + td + '">' + money(x.insEr) + '</td><td style="' + td + ';font-weight:800">' + money(tot(x)) + "</td></tr>";
    });
    flush();
    body += '<tr style="background:#014D3D;color:#fff;font-weight:800"><td colspan="7" style="' + tdn + ';color:#fff">' + T("الإجمالي العام", "Grand total") + " (" + data.rows.length + ')</td><td style="' + td + '">' + money(data.tot.emp) + '</td><td style="' + td + '">' + money(data.tot.co) + '</td><td style="' + td + '">' + money(data.tot.total) + "</td></tr>";
    const html = '<div dir="' + (en ? "ltr" : "rtl") + '" style="font-family:Tahoma,Arial,sans-serif"><div style="text-align:center;margin:2mm 0 3mm"><div style="font-size:10.5px;color:#555">' + m.days + " " + T("يوم", "days") + " — " + T("المبلغ المطلوب توفيره: ", "Amount to set aside: ") + "<b>" + money(data.tot.total) + " " + T("ر.س", "SAR") + '</b></div></div><table style="width:100%;border-collapse:collapse"><thead><tr>' + head.map((x) => '<th style="' + th + '">' + esc(x) + "</th>").join("") + "</tr></thead><tbody>" + body + "</tbody></table></div>";
    printDoc(title, tfWrap(title, "", html));
  }
  const L = (t: string) => <label style={{ fontSize: 10.5, color: "var(--mu)", display: "block", marginBottom: 3 }}>{t}</label>;
  let cur: string | null = null, g: { emp: number; co: number; total: number; n: number } | null = null, idx = 0;
  const out: React.ReactNode[] = [];
  const gs: React.CSSProperties = { background: "rgba(1,77,61,.10)", fontWeight: 800 };
  const flush = () => { if (g) out.push(<tr key={"g" + cur}><td colSpan={7} style={{ ...TD, ...gs }}>{T("إجمالي ", "Total ")}{cur || "—"} ({g.n})</td><td style={{ ...TD, ...gs }}>{money(g.emp)}</td><td style={{ ...TD, ...gs }}>{money(g.co)}</td><td style={{ ...TD, ...gs }}>{money(g.total)}</td></tr>); };
  data.rows.forEach((x) => {
    if (x.employer !== cur || !g) { flush(); cur = x.employer; g = { emp: 0, co: 0, total: 0, n: 0 }; }
    g.emp += Number(x.insEmp) || 0; g.co += Number(x.insEr) || 0; g.total += tot(x); g.n++; idx++;
    const k = mkey + "-" + x.id;
    out.push(
      <tr key={x.id}>
        <td style={TD}>{idx}</td><td style={TD}>{x.empNo}</td><td style={{ ...TD, fontWeight: 700 }}>{short(x.name)}</td><td style={TD}>{x.employer}</td><td style={TD}>{x.insStatus}</td><td style={TD}>{money(x.insBase)}</td>
        <td style={TD}>
          <input type="number" min="0" max={m.days} value={x.insDays} onChange={(ev) => setOver({ ...over, [k]: ev.target.value })} style={{ width: 52, background: "transparent", border: "1px solid " + (x.manual ? "var(--am)" : "transparent"), borderRadius: 4, color: "var(--tx)", fontSize: 11.5, padding: 2, textAlign: "right" }} />
          {x.manual && <button type="button" title={T("رجوع للتلقائي", "Back to automatic")} onClick={() => { const o = { ...over }; delete o[k]; setOver(o); }} style={{ color: "var(--cy)", background: "none", border: 0, cursor: "pointer" }}>↺</button>}
        </td>
        <td style={{ ...TD, color: "var(--am)" }}>{money(x.insEmp)}</td><td style={{ ...TD, color: "var(--bl)" }}>{money(x.insEr)}</td><td style={{ ...TD, fontWeight: 800, color: "var(--gr)" }}>{money(tot(x))}</td>
      </tr>,
    );
  });
  flush();
  const gt: React.CSSProperties = { ...TD, background: "rgba(59,130,246,.12)", fontWeight: 800 };
  out.push(<tr key="gt"><td colSpan={7} style={gt}>{T("الإجمالي العام", "Grand total")} ({data.rows.length})</td><td style={gt}>{money(data.tot.emp)}</td><td style={gt}>{money(data.tot.co)}</td><td style={gt}>{money(data.tot.total)}</td></tr>);

  return (
    <div className="pg on" style={{ padding: "12px 16px" }}>
      <div className="card" style={{ padding: 14 }}>
        <div className="ct" style={{ marginBottom: 10 }}><i className="ti ti-shield-check" /> {T("حاسبة التأمينات الاجتماعية الشهرية", "Monthly social insurance calculator")}</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>{L(T("التاريخ (الشهر اللي هيتحسب)", "Date (month to calculate)"))}<DateField value={date} onChange={(v) => setDate(v)} style={INP} /></div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn bsm" onClick={() => shift(-1)}>‹</button>
            <button type="button" className="btn bsm" onClick={() => setDate(todayIso())}>{T("الشهر الحالي", "This month")}</button>
            <button type="button" className="btn bsm" onClick={() => shift(1)}>{T("الشهر القادم", "Next month")}</button>
          </div>
          <div>{L(T("الموظف", "Employee"))}<select value={selEmp} onChange={(e) => setSelEmp(e.target.value)} style={{ ...INP, minWidth: 200 }}><option value="">{T("كل الموظفين", "All employees")}</option>{(calc?.rows ?? []).map((r) => <option key={r.id} value={r.id}>{short(r.name)}</option>)}</select></div>
          <div>{L(T("جهة العمل", "Employer"))}<select value={selEr} onChange={(e) => setSelEr(e.target.value)} style={INP}><option value="">{T("كل الجهات", "All employers")}</option>{ers.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
          <div style={{ display: "flex", gap: 6, marginInlineStart: "auto" }}>
            <button type="button" className="btn bgr bsm" onClick={print}><i className="ti ti-printer" /> {T("طباعة رسمي", "Print (official)")}</button>
            <button type="button" className="btn bpl bsm" onClick={xlsx}><i className="ti ti-file-spreadsheet" /> Excel</button>
            <button type="button" className="btn bsm" onClick={() => gosi(false)} title={T("ملف الاشتراكات الشهري للمحاسب", "Monthly subscription file for the accountant")}><i className="ti ti-file-upload" /> {T("ملف التأمينات (GOSI)", "GOSI file")}</button>
            <button type="button" className="btn bsm" onClick={() => gosi(true)}>CSV</button>
          </div>
        </div>
        <div style={{ marginTop: 10, fontWeight: 800, fontSize: 13 }}>{mn} {m.y} — {m.days} {T("يوم", "days")}</div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
        <Kpi l={T("حصة الموظفين", "Employees' share")} v={money(data.tot.emp)} c="var(--am)" />
        <Kpi l={T("حصة الشركة", "Company share")} v={money(data.tot.co)} c="var(--bl)" />
        <Kpi l={T("المبلغ المطلوب توفيره", "Amount to set aside")} v={money(data.tot.total) + " " + T("ر.س", "SAR")} c="var(--gr)" />
        <Kpi l={T("عدد الموظفين", "Employees")} v={data.rows.length} c="var(--cy)" />
      </div>
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        {!calc ? <div style={{ padding: 26, textAlign: "center", color: "var(--mu)" }}>…</div> : !data.rows.length ? <div style={{ padding: 26, textAlign: "center", color: "var(--mu)" }}>{T("لا يوجد موظفين", "No employees")}</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{head.map((x) => <th key={x} style={{ background: "var(--c2)", padding: "7px 8px", textAlign: "right", fontSize: 10.5, fontWeight: 700, borderBottom: "2px solid var(--bl)", whiteSpace: "nowrap" }}>{x}</th>)}</tr></thead>
            <tbody>{out}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
