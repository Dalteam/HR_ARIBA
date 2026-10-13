"use client";

// V117 attendance reports (تقارير الحضور والانصراف) — port of js/attendance/102-ariba-v117-att-reports.js:
// group the day's sessions, classify every day (present/late/absent/leave/remote/off), 8 filters, summary or daily
// detail, print on the letterhead and spreadsheet export.
import { useMemo, useState } from "react";
import { useToast } from "@/components/common/toast";
import { listAttendanceRange } from "@/lib/attendance";
import { listHolidays, listRequests } from "@/lib/leave";
import { printDoc, tfWrap } from "@/lib/calc/forms";
import type { EmployeeListItem } from "@/lib/api";
import { DateField } from "@/components/common/date-time-field";
import { computeReport, ymd, type Cls, type Day, type Sum as SumOf } from "@/lib/calc/att-reports";

const ST_AR: Record<Cls, string> = { present: "حاضر", late: "متأخر", absent: "غائب", leave: "إجازة", remote: "عن بعد", off: "عطلة", pending: "لم يُسجَّل بعد" };
const hm = (t: string | null) => (t ? String(t).slice(0, 5) : "");
const dispD = (s: string) => {
  const p = s.split("-");
  return `${p[2]}/${p[1]}/${p[0]}`;
};
const dayName = (d: Date) => d.toLocaleDateString("ar-SA", { weekday: "long" });
type Sum = SumOf<EmployeeListItem>;

const FILTERS: Record<string, { ar: string; f: (s: Sum, n: number) => boolean }> = {
  all: { ar: "كل الموظفين", f: () => true },
  late: { ar: "المتأخرون فقط", f: (s, n) => s.late >= n },
  absent: { ar: "الغائبون فقط", f: (s, n) => s.absent >= n },
  early: { ar: "عندهم خروج مبكر", f: (s, n) => s.earlyDays >= n },
  noout: { ar: "بدون بصمة انصراف", f: (s, n) => s.noOut >= n },
  remote: { ar: "عن بعد", f: (s, n) => s.remote >= n },
  leave: { ar: "في إجازة", f: (s, n) => s.leave >= n },
  clean: { ar: "ملتزمون (بدون تأخير أو غياب)", f: (s) => s.late === 0 && s.absent === 0 && s.present + s.remote > 0 },
};

const HDR = ["#", "الموظف", "أيام العمل", "حاضر", "متأخر", "غائب", "إجازة", "عن بعد", "دقائق التأخير", "خروج مبكر (د)", "بدون انصراف", "الساعات", "نسبة الحضور"];
const XLS_HDR = [...HDR.slice(1), "متوسط وقت الدخول"];
const DET_HDR = ["التاريخ", "اليوم", "الحالة", "دخول", "خروج", "تأخير (د)", "خروج مبكر (د)", "الساعات", "ملاحظات"];
const sumRow = (s: Sum, i: number) => [i + 1, s.e.name_ar, s.expected, s.present, s.late, s.absent, s.leave, s.remote, s.lateMin, s.early, s.noOut, s.hours, s.rate ?? ""];
function detRow(d: Day) {
  const r = d.rec;
  let note = "";
  if (r) {
    note = r.auto ? "الجلسة الأخيرة اتقفلت تلقائيًا (بدون بصمة انصراف)" : r.noOut ? "بدون بصمة انصراف" : "";
    if (r.sessions > 1) note = (note ? note + " — " : "") + r.sessions + " جلسات، الانصراف = آخر جلسة";
  }
  return [dispD(d.date), d.dow, ST_AR[d.cls], r ? hm(r.in) : "", r ? hm(r.out) : "", r && d.cls === "late" ? r.late : "", r && r.early > 0 ? r.early : "", r ? r.hours : "", note];
}
const NOTE =
  "طريقة الحساب: يوم العمل = غير الجمعة/السبت والعطلات الرسمية وبعد تاريخ المباشرة ولا يشمل اليوم الحالي. الغياب = يوم عمل بدون بصمة وبدون إجازة معتمدة. التأخير والخروج المبكر من حساب النظام (الساعة المرنة وفترة السماح). السجلات المُقفلة تلقائيًا (بدون بصمة انصراف) لا تدخل في مجموع الساعات.";

export function AttendanceReports({ emps }: { emps: EmployeeListItem[] }) {
  const toast = useToast();
  const now = new Date();
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(ymd(now));
  const [fk, setFk] = useState("all");
  const [n, setN] = useState(1);
  const [mode, setMode] = useState<"sum" | "det">("sum");
  const [panel, setPanel] = useState(false);
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [q, setQ] = useState("");
  const [dep, setDep] = useState("");
  const [res, setRes] = useState<Sum[] | null>(null);
  const [busy, setBusy] = useState(false);
  const deps = useMemo(() => [...new Set(emps.map((e) => e.department?.name_ar).filter(Boolean))] as string[], [emps]);
  const visible = emps.filter((e) => (!dep || e.department?.name_ar === dep) && (!q || `${e.name_ar} ${e.name_en ?? ""} ${e.emp_no}`.toLowerCase().includes(q.toLowerCase())));

  function quick(k: string) {
    const d = new Date();
    let f: string, t: string;
    if (k === "m0") { f = ymd(new Date(d.getFullYear(), d.getMonth(), 1)); t = ymd(d); }
    else if (k === "m1") { f = ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)); t = ymd(new Date(d.getFullYear(), d.getMonth(), 0)); }
    else if (k === "d7") { f = ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6)); t = ymd(d); }
    else { f = d.getFullYear() + "-01-01"; t = ymd(d); }
    setFrom(f);
    setTo(t);
    run(f, t);
  }

  async function run(f = from, t = to): Promise<Sum[] | null> {
    if (!f || !t || t < f) {
      toast("حدد فترة صحيحة (من ≤ إلى)", "err");
      return null;
    }
    setBusy(true);
    try {
      const [rows, hols, reqs] = await Promise.all([listAttendanceRange(f, t), listHolidays(), listRequests({ status: "approved" })]);
      const list = sel ? emps.filter((e) => sel.has(e.id)) : emps;
      const out: Sum[] = computeReport({
        rows, from: f, to: t, emps: list, hols, today: ymd(new Date()), dayName,
        leaves: reqs.map((l) => ({ employee_id: l.employee_id, from_date: l.from_date, to_date: l.to_date, type: l.type })),
      }).filter((s) => FILTERS[fk].f(s, Math.max(1, n)));
      setRes(out);
      return out;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const k = (res ?? []).reduce((t, s) => ({ present: t.present + s.present, late: t.late + s.late, absent: t.absent + s.absent, leave: t.leave + s.leave, remote: t.remote + s.remote, lateMin: t.lateMin + s.lateMin }), { present: 0, late: 0, absent: 0, leave: 0, remote: 0, lateMin: 0 });

  async function doPrint() {
    const r = await run();
    if (!r) return;
    if (!r.length) return toast("مفيش بيانات للطباعة", "err");
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    const table = (h: string[], rows: unknown[][]) => `<table style="width:100%;border-collapse:collapse;font-size:9px"><tr>${h.map((x) => `<th style="background:#014D3D;color:#fff;padding:4px">${x}</th>`).join("")}</tr>${rows.map((rw) => `<tr>${rw.map((x) => `<td style="padding:3px;border-bottom:1px solid #e5ece9;text-align:center">${esc(x)}</td>`).join("")}</tr>`).join("")}</table>`;
    const kp = `<div style="display:flex;gap:5px;margin-bottom:4mm">${[[r.length, "موظف"], [k.present, "حاضر"], [k.late, "متأخر"], [k.absent, "غائب"], [k.leave, "إجازة"], [k.remote, "عن بعد"], [k.lateMin, "دقائق التأخير"]].map(([v, l]) => `<div style="flex:1;background:#eef5f2;border:1px solid #d8e2de;border-radius:7px;padding:5px;text-align:center"><b style="display:block;font-size:14px;color:#014D3D">${v}</b><span style="font-size:8.5px;color:#666">${l}</span></div>`).join("")}</div>`;
    const body = mode === "det"
      ? r.map((s) => `<h4 style="background:#014D3D;color:#fff;padding:4px 8px;border-radius:5px">${esc(s.e.name_ar)} — ${esc(s.e.emp_no)}</h4>${table(DET_HDR, s.days.filter((d) => d.cls !== "off" || d.rec).map(detRow))}`).join("")
      : table(HDR, r.map(sumRow));
    const html = tfWrap("تقرير الحضور والانصراف", "", `<div style="text-align:center;color:#555;margin:1mm 0 4mm;font-size:11px">من ${dispD(from)} إلى ${dispD(to)} — ${FILTERS[fk].ar}</div>${kp}${body}<div style="margin-top:4mm;border-top:1px solid #ddd;font-size:8px;color:#777;line-height:1.7">${NOTE}</div>`);
    printDoc("تقرير الحضور", html);
  }

  function doXls() {
    if (!res?.length) return toast("اعرض التقرير أولاً", "err");
    const rows: unknown[][] = mode === "det" ? [["الموظف", ...DET_HDR], ...res.flatMap((s) => s.days.filter((d) => d.cls !== "off" || d.rec).map((d) => [s.e.name_ar, ...detRow(d)]))] : [XLS_HDR, ...res.map((s, i) => [...sumRow(s, i).slice(1), s.avgIn])];
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `attendance_${from}_${to}.csv`;
    a.click();
  }

  const box = (v: number, l: string) => (
    <div key={l} style={{ background: "var(--c2)", borderRadius: 8, padding: "6px 10px", textAlign: "center", minWidth: 80 }}>
      <div style={{ fontWeight: 800, fontSize: 15 }}>{v}</div>
      <div style={{ fontSize: 10, color: "var(--mu)" }}>{l}</div>
    </div>
  );
  const fld = (l: string, c: React.ReactNode) => (
    <div>
      <label style={{ fontSize: 10, color: "var(--mu)", fontWeight: 600, display: "block", marginBottom: 2 }}>{l}</label>
      {c}
    </div>
  );

  return (
    <div className="card" id="ariba117AttCard" style={{ padding: 12, marginTop: 12 }}>
      <div className="ct" style={{ marginBottom: 10 }}>
        <i className="ti ti-report-analytics" /> تقارير الحضور والانصراف
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, alignItems: "end" }}>
        {fld("من تاريخ", <DateField style={{ width: "100%" }} value={from} onChange={(v) => setFrom(v)} />)}
        {fld("إلى تاريخ", <DateField style={{ width: "100%" }} value={to} onChange={(v) => setTo(v)} />)}
        {fld("الفلتر", <select style={{ width: "100%" }} value={fk} onChange={(e) => setFk(e.target.value)}>{Object.entries(FILTERS).map(([v, x]) => <option key={v} value={v}>{x.ar}</option>)}</select>)}
        {fld("الحد الأدنى للأيام", <input type="number" min={1} style={{ width: "100%" }} value={n} onChange={(e) => setN(Number(e.target.value) || 1)} />)}
        {fld("نوع التقرير", <select style={{ width: "100%" }} value={mode} onChange={(e) => setMode(e.target.value as "sum" | "det")}><option value="sum">ملخص لكل موظف</option><option value="det">تفصيلي يومي</option></select>)}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
        {[["m0", "هذا الشهر"], ["m1", "الشهر الماضي"], ["d7", "آخر 7 أيام"], ["y0", "هذه السنة"]].map(([k2, l]) => (
          <button key={k2} type="button" className="btn bgr bsm" onClick={() => quick(k2)}>{l}</button>
        ))}
        <button type="button" className="btn bgr bsm" onClick={() => setPanel(!panel)}>
          <i className="ti ti-users" /> <span>{sel ? `${sel.size} موظف محدد` : "كل الموظفين"}</span>
        </button>
      </div>
      {panel && (
        <div style={{ border: "1px solid var(--bd)", borderRadius: 8, padding: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input placeholder="بحث بالاسم أو الرقم الوظيفي" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={dep} onChange={(e) => setDep(e.target.value)}><option value="">كل الأقسام</option>{deps.map((d) => <option key={d}>{d}</option>)}</select>
            <button type="button" className="btn bgr bsm" onClick={() => setSel(null)}>تحديد الكل</button>
            <button type="button" className="btn bgr bsm" onClick={() => setSel(new Set())}>إلغاء الكل</button>
          </div>
          <div style={{ maxHeight: 200, overflow: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: "2px 10px" }}>
            {visible.map((e) => (
              <label key={e.id} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12 }}>
                <input type="checkbox" checked={!sel || sel.has(e.id)} onChange={(ev) => { const s2 = new Set(sel ?? emps.map((x) => x.id)); if (ev.target.checked) s2.add(e.id); else s2.delete(e.id); setSel(s2); }} /> {e.name_ar}
              </label>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className="btn bpl bsm" onClick={() => run()} disabled={busy}><i className="ti ti-search" /> عرض التقرير</button>
        <button type="button" className="btn bgr bsm" onClick={doPrint}><i className="ti ti-printer" /> طباعة تقرير الحضور</button>
        <button type="button" className="btn bgr bsm" onClick={doXls}><i className="ti ti-file-spreadsheet" /> Excel</button>
      </div>
      <div style={{ marginTop: 10 }}>
        {busy && <div style={{ padding: 14, color: "var(--mu)" }}>جاري تحميل الحضور…</div>}
        {res && !busy && (res.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--mu)" }}>لا توجد نتائج مطابقة للفلتر</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {box(res.length, "موظف")}{box(k.present, "حاضر")}{box(k.late, "متأخر")}{box(k.absent, "غائب")}{box(k.leave, "إجازة")}{box(k.remote, "عن بعد")}{box(k.lateMin, "دقائق التأخير")}
            </div>
            {mode === "det" ? res.map((s) => (
              <div key={s.e.id}>
                <div style={{ fontWeight: 800, margin: "10px 0 4px" }}>{s.e.name_ar} <span style={{ fontWeight: 400, color: "var(--mu)", fontSize: 11 }}>{s.e.emp_no}</span></div>
                <div className="tw"><table><thead><tr>{DET_HDR.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{s.days.filter((d) => d.cls !== "off" || d.rec).map((d) => <tr key={d.date}>{detRow(d).map((x, i) => <td key={i}>{String(x)}</td>)}</tr>)}</tbody></table></div>
              </div>
            )) : (
              <div className="tw"><table><thead><tr>{HDR.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{res.map((s, i) => <tr key={s.e.id}>{sumRow(s, i).map((x, j) => <td key={j}>{String(x)}</td>)}</tr>)}</tbody></table></div>
            )}
          </>
        ))}
      </div>
    </div>
  );
}
