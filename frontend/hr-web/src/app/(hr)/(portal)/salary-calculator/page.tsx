"use client";

// Salary calculator (حاسبة الراتب) — the updated design's finance/SalCalc.jsx: gross → components, net → components,
// basic → gross and net, and basic + target net → the allowance needed. Same formulas as the design (insurable wage =
// basic + housing, capped; net = gross − the employee's share). The employee rate comes from OUR GOSI settings for the
// chosen date (the design also offers its own built-in schedule; ours keeps one source, the settings) and can be typed
// by hand. «إنشاء عرض وظيفي بهذه الأرقام» hands the figures to the templates page's job-offer card (lib/offer-draft.ts)
// and goes there, exactly as the design's offerDraft does.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/common/toast";
import { DateField } from "@/components/common/date-time-field";
import { printDoc, tfWrap } from "@/lib/calc/forms";
import { esc, money, r2 } from "@/lib/calc/month";
import { saveBlob } from "@/lib/exporter";
import { todayIso } from "@/lib/format";
import { putLastOffer, putOfferFigures } from "@/lib/offer-draft";
import { useLocale } from "@/lib/i18n/locale";

import { getGosiRates, type GosiRates } from "@/lib/salary";
import { buildXlsx } from "@/lib/xlsx";

type Mode = "gross" | "net" | "basic" | "target";
type P = { G: number; N: number; B: number; sau: boolean; rate: number; cap: number; h: number; hA: number; t: number; tA: number; pr: number; prType: string; O: number };
/** the design's formulas, unchanged */
function calc(mode: Mode, p: P, T: (a: string, b: string) => string) {
  const hp = p.h || 0, tp = p.t || 0, hA = p.hA || 0, tA = p.tA || 0, sau = p.sau, rate = sau ? p.rate : 0, cap = p.cap || 45000;
  const pp = p.prType === "pct" ? p.pr || 0 : 0, pA = p.prType === "amt" ? p.pr || 0 : 0;
  const k = 1 + hp + tp + pp, fixed = hA + tA + pA + (p.O || 0);
  let B = 0, other = p.O || 0, warn = "";
  const baseOf = (b: number) => b * (1 + hp) + hA, insFor = (b: number) => (sau ? Math.min(baseOf(b), cap) * rate : 0);
  if (mode === "gross") B = (p.G - fixed) / k;
  else if (mode === "net") {
    if (!sau || !rate) B = (p.N - fixed) / k;
    else {
      const b1 = (p.N - fixed + rate * hA) / (k - rate * (1 + hp));
      if (baseOf(b1) <= cap) B = b1;
      else { B = (p.N - fixed + rate * cap) / k; warn = T("الأجر الخاضع وصل للحد الأقصى (" + cap + ") فالتأمينات ثابتة", "The insurable wage reached the cap (" + cap + "), so the deduction is fixed"); }
    }
  } else B = p.B;
  if ((mode === "gross" || mode === "net") && B < 0) warn = T("البدلات الثابتة أكبر من المبلغ المدخل — راجع الأرقام", "The fixed allowances exceed the entered amount — check the figures");
  const housing = B * hp + hA, transport = B * tp + tA, project = B * pp + pA;
  if (mode === "target") { other = p.N + insFor(B) - (B + housing + transport + project); if (other < 0) warn = T("الصافي المطلوب أقل من الراتب الأساسي والبدلات الحالية — البدل المطلوب سالب", "The target net is below the basic and allowances — the required allowance is negative"); }
  const gross = B + housing + transport + project + other, ins = insFor(B), net = gross - ins, base = Math.min(baseOf(B), cap);
  return { basic: B, housing, transport, project, other, gross, ins, net, base, rate, warn };
}
const MODES: [Mode, string, string][] = [["gross", "إجمالي ← مكونات", "Gross → components"], ["net", "صافي ← مكونات", "Net → components"], ["basic", "أساسي ← إجمالي وصافي", "Basic → gross & net"], ["target", "أساسي + صافي مطلوب ← بدل مطلوب", "Basic + target net → required allowance"]];
const INP: React.CSSProperties = { background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--tx)", padding: "7px 10px", fontSize: 13, width: "100%", boxSizing: "border-box" };
const TD: React.CSSProperties = { padding: "7px 10px", borderBottom: "1px solid rgba(36,48,68,.25)", fontSize: 12.5 };
const Lb = ({ t }: { t: string }) => <label style={{ fontSize: 10.5, color: "var(--mu)", display: "block", marginBottom: 3, fontWeight: 600 }}>{t}</label>;
const num = (v: unknown) => Number(v) || 0;

export default function Page() {
  const toast = useToast();
  const router = useRouter();
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (a: string, b: string) => (en ? b : a);
  const [mode, setMode] = useState<Mode>("gross");
  const [f, setF] = useState({ G: "", N: "", B: "", nat: "sa", sys: "new", a55: false, H: "25", HT: "pct", T: "10", TT: "pct", PR: "0", PRT: "pct", O: "0", ON: "", date: todayIso(), rate: "", rateManual: false });
  const [R, setR] = useState<GosiRates | null>(null);
  useEffect(() => { getGosiRates(f.date || todayIso()).then(setR).catch(() => setR(null)); }, [f.date]);
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => { const n = { ...s, [k]: v }; if (["sys", "nat", "date", "a55"].includes(k)) n.rateManual = false; if (k === "rate") n.rateManual = true; return n; });
  const sau = f.nat === "sa";
  const empRate = R ? (f.sys === "new" ? (f.a55 ? R.matchEmp55 : R.matchEmp) : f.a55 ? R.noMatchEmp55 : R.noMatchEmp) : f.sys === "new" ? 0.1075 : 0.0975;
  const coRate = R ? (sau ? (f.sys === "new" ? (f.a55 ? R.matchEr55 : R.matchEr) : f.a55 ? R.noMatchEr55 : R.noMatchEr) : R.nonSaudiEr) : sau ? 0.1275 : 0.02;
  const cap = R?.cap || 45000;
  const rateShown = f.rateManual ? f.rate : String(r2(empRate * 100));
  const rate = sau ? num(rateShown) / 100 : 0;
  const hv = num(f.H), tv = num(f.T);
  const p: P = { G: num(f.G), N: num(f.N), B: num(f.B), sau, rate, cap, h: f.HT !== "amt" ? hv / 100 : 0, hA: f.HT !== "amt" ? 0 : hv, t: f.TT !== "amt" ? tv / 100 : 0, tA: f.TT !== "amt" ? 0 : tv, pr: f.PRT === "pct" ? num(f.PR) / 100 : num(f.PR), prType: f.PRT, O: num(f.O) };
  const ok = (mode === "gross" && p.G > 0) || (mode === "net" && p.N > 0) || (mode === "basic" && p.B > 0) || (mode === "target" && p.B > 0 && p.N > 0);
  const c = ok ? calc(mode, p, T) : null;
  const coCost = c ? c.gross + c.base * coRate : 0;
  const rows: [string, number][] = c ? [[T("الراتب الأساسي", "Basic salary"), c.basic], [T("بدل السكن", "Housing allowance"), c.housing], [T("بدل النقل", "Transport allowance"), c.transport], ...(c.project ? [[T("بدل المشروع", "Project allowance"), c.project] as [string, number]] : []), ...(c.other || mode === "target" ? [[f.ON.trim() || T("بدلات أخرى", "Other allowances"), c.other] as [string, number]] : [])] : [];
  const outRows = (): [string, number][] => [...rows.map(([l, v]): [string, number] => [l, r2(v)]), [T("الراتب الإجمالي", "Gross salary"), r2(c!.gross)], [T("خصم التأمينات (حصة الموظف)", "Insurance (employee share)"), r2(c!.ins)], [T("الصافي للموظف", "Net to employee"), r2(c!.net)]];
  const noRes = () => { if (c) return false; toast(T("اكتب الرقم المطلوب أولاً", "Enter the figure first"), "err"); return true; };
  // the design keeps the last result for the offer card's «جلب من حاسبة الراتب» (offerDraft.last)
  useEffect(() => {
    if (!c) return;
    putLastOffer({ basic: r2(c.basic), housing: r2(c.housing), transport: r2(c.transport), project: r2(c.project), other: r2(c.other) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.basic, c?.housing, c?.transport, c?.project, c?.other]);
  /** the design's offer(): leave the components for the templates page's job-offer card and go there */
  function makeOffer() {
    if (noRes()) return;
    putOfferFigures({ basic: r2(c!.basic), housing: r2(c!.housing), transport: r2(c!.transport), project: r2(c!.project), other: r2(c!.other), otherLabel: f.ON.trim() });
    router.push("/templates");
  }
  function print() {
    if (noRes()) return;
    const title = T("حاسبة الراتب", "Salary calculation"), td = "padding:6px 10px;border:1px solid #d9e3df;font-size:12px";
    const html = '<div dir="' + (en ? "ltr" : "rtl") + '" style="font-family:Tahoma,Arial,sans-serif"><div style="font-size:11px;color:#555;text-align:center;margin-bottom:4mm">' + esc(sau ? T("سعودي", "Saudi") + " — " + (f.sys === "new" ? T("النظام الجديد", "New system") : T("النظام القديم", "Old system")) : T("غير سعودي", "Non-Saudi")) + '</div><table style="width:100%;border-collapse:collapse">' + outRows().map((r) => '<tr><td style="' + td + '">' + esc(r[0]) + '</td><td style="' + td + ';text-align:left;font-weight:700;direction:ltr">' + money(r[1]) + "</td></tr>").join("") + "</table></div>";
    printDoc(title, tfWrap(title, "", html));
  }
  function xls() {
    if (noRes()) return;
    const blob = buildXlsx([{ name: T("حاسبة الراتب", "Salary"), rows: [[T("حاسبة الراتب", "Salary calculation")], [], [T("البند", "Item"), T("المبلغ", "Amount")], ...outRows()], widths: [40, 16] }]);
    saveBlob({ blob, name: "salary_calc.xlsx", mime: blob.type });
  }
  async function copy() {
    if (noRes()) return;
    try { await navigator.clipboard.writeText(outRows().map((r) => r[0] + ": " + money(r[1])).join("\n")); toast("✓ " + T("تم النسخ", "Copied"), "ok"); } catch { toast(T("تعذر النسخ", "Could not copy"), "err"); }
  }
  const nfo = !sau ? T("غير سعودي: لا استقطاع على الموظف", "Non-Saudi: no employee deduction") : T("سقف الأجر الخاضع: ", "Wage cap: ") + money(cap) + " — " + (f.rateManual ? T("النسبة يدوية", "manual rate") : T("من إعدادات التأمينات في البرنامج", "from the program's GOSI settings"));
  const numIn = (k: keyof typeof f) => <input type="number" step="0.01" value={String(f[k])} onChange={(e) => set(k, e.target.value)} style={INP} />;
  return (
    <div className="pg on" style={{ padding: "12px 16px" }}>
      <div className="card" style={{ padding: 14, maxWidth: 1000 }}>
        <div className="ct" style={{ marginBottom: 10 }}><i className="ti ti-calculator" /> {T("حاسبة الراتب", "Salary calculator")}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {MODES.map((m) => <button key={m[0]} type="button" className="btn bsm" style={{ fontWeight: 700, background: mode === m[0] ? "var(--gr)" : "", color: mode === m[0] ? "#fff" : "" }} onClick={() => setMode(m[0])}>{T(m[1], m[2])}</button>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
          {mode === "gross" && <div><Lb t={T("الراتب الإجمالي شامل البدلات", "Gross salary incl. allowances")} />{numIn("G")}</div>}
          {(mode === "net" || mode === "target") && <div><Lb t={T("الراتب الصافي (بعد خصم التأمينات)", "Net salary (after insurance)")} />{numIn("N")}</div>}
          {(mode === "basic" || mode === "target") && <div><Lb t={T("الراتب الأساسي", "Basic salary")} />{numIn("B")}</div>}
          <div><Lb t={T("الجنسية", "Nationality")} /><select value={f.nat} onChange={(e) => set("nat", e.target.value)} style={INP}><option value="sa">{T("سعودي", "Saudi")}</option><option value="ns">{T("غير سعودي", "Non-Saudi")}</option></select></div>
          {sau && <div><Lb t={T("نظام التأمينات / العمل", "Insurance / labor system")} /><select value={f.sys} onChange={(e) => set("sys", e.target.value)} style={INP}><option value="new">{T("الجديد (يطابق)", "New (matching)")}</option><option value="old">{T("القديم (لا يطابق)", "Old (non-matching)")}</option></select></div>}
          {sau && <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 8 }}><label style={{ fontSize: 12 }}><input type="checkbox" checked={f.a55} onChange={(e) => set("a55", e.target.checked)} /> {T("عمره 55 سنة أو أكثر", "Age 55 or above")}</label></div>}
        </div>
        <div style={{ marginTop: 10, fontWeight: 700, fontSize: 12, color: "var(--mu)" }}>{T("البدلات (كل بدل: نسبة من الأساسي أو مبلغ ثابت)", "Allowances (each one: % of basic or a fixed amount)")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 6 }}>
          {([["H", "HT", T("بدل السكن", "Housing allowance")], ["T", "TT", T("بدل النقل", "Transport allowance")], ["PR", "PRT", T("بدل المشروع", "Project allowance")]] as const).map(([a, b, l]) => (
            <div key={a}><Lb t={l} /><div style={{ display: "flex", gap: 4 }}>{numIn(a)}<select value={f[b]} onChange={(e) => set(b, e.target.value)} style={{ ...INP, width: 78 }}><option value="pct">%</option><option value="amt">{T("مبلغ", "SAR")}</option></select></div></div>
          ))}
          {mode !== "target" && <div><Lb t={T("بدلات أخرى (مبلغ ثابت)", "Other allowances (fixed)")} />{numIn("O")}</div>}
          {mode !== "target" && <div><Lb t={T("نوع البدل الآخر (يظهر في العرض الوظيفي)", "Name of the other allowance (shown in the offer)")} /><input value={f.ON} onChange={(e) => set("ON", e.target.value)} placeholder={T("مثال: بدل هاتف", "e.g. phone allowance")} style={INP} /></div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 10, alignItems: "end" }}>
          <div><Lb t={T("تاريخ الحساب (يحدد نسب التأمينات)", "Calculation date (selects the insurance rates)")} /><DateField value={f.date} onChange={(v) => set("date", v)} style={INP} /></div>
          <div><Lb t={T("نسبة خصم الموظف % (يمكن تعديلها يدويًا)", "Employee deduction % (editable)")} /><input type="number" step="0.01" value={rateShown} onChange={(e) => set("rate", e.target.value)} style={INP} /></div>
          <div style={{ fontSize: 11, color: "var(--mu)", paddingBottom: 8 }}>{nfo}</div>
        </div>
      </div>
      <div className="card" style={{ padding: 14, maxWidth: 1000, marginTop: 12 }}>
        {!c ? <div style={{ padding: 22, textAlign: "center", color: "var(--mu)" }}>{T("اكتب الرقم المطلوب في الأعلى لتظهر النتيجة", "Enter the figure above to see the result")}</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {rows.map(([l, v], i) => <tr key={i}><td style={TD}>{l}</td><td style={{ ...TD, textAlign: "left", fontWeight: 700, direction: "ltr" }}>{money(v)}</td></tr>)}
              <tr style={{ background: "rgba(41,179,94,.12)" }}><td style={{ ...TD, fontWeight: 800 }}>{T("الراتب الإجمالي", "Gross salary")}</td><td style={{ ...TD, textAlign: "left", fontWeight: 800, direction: "ltr", color: "var(--gr)" }}>{money(c.gross)}</td></tr>
              <tr><td style={TD}>{T("خصم التأمينات الاجتماعية (حصة الموظف)", "Social insurance (employee share)")}{sau && <span style={{ color: "var(--mu)", fontSize: 11 }}> {r2(rate * 100)}% × {money(c.base)}</span>}</td><td style={{ ...TD, textAlign: "left", direction: "ltr", color: "var(--am)" }}>{sau ? "-" : ""}{money(c.ins)}</td></tr>
              <tr style={{ background: "rgba(59,130,246,.12)" }}><td style={{ ...TD, fontWeight: 800 }}>{T("الصافي للموظف", "Net to employee")}</td><td style={{ ...TD, textAlign: "left", fontWeight: 800, direction: "ltr", color: "var(--bl)" }}>{money(c.net)}</td></tr>
              <tr><td style={{ ...TD, color: "var(--mu)", fontSize: 11.5 }}>{T("تكلفة الشركة الشهرية (الإجمالي + حصة الشركة من التأمينات)", "Monthly cost to the company (gross + employer insurance share)")}</td><td style={{ ...TD, textAlign: "left", color: "var(--mu)", direction: "ltr" }}>{money(coCost)}</td></tr>
              <tr><td style={{ ...TD, color: "var(--mu)", fontSize: 11.5 }}>{T("تأكيد (مجموع المكونات)", "Check (sum of components)")}</td><td style={{ ...TD, textAlign: "left", color: "var(--mu)", direction: "ltr" }}>{money(c.basic + c.housing + c.transport + c.project + c.other)}</td></tr>
            </tbody>
          </table>
        )}
        {c?.warn && <div style={{ color: "var(--am)", fontSize: 12, marginTop: 6 }}>{c.warn}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="btn bpl bsm" onClick={makeOffer}><i className="ti ti-file-text" /> {T("إنشاء عرض وظيفي بهذه الأرقام", "Create a job offer with these figures")}</button>
          <button type="button" className="btn bgr bsm" onClick={print}><i className="ti ti-printer" /> {T("طباعة", "Print")}</button>
          <button type="button" className="btn bgr bsm" onClick={xls}>Excel</button>
          <button type="button" className="btn bsm" onClick={copy}>{T("نسخ", "Copy")}</button>
        </div>
      </div>
    </div>
  );
}
