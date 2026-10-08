"use client";

// V117 attendance reports (تقارير الحضور والانصراف) — port of js/attendance/102-ariba-v117-att-reports.js:
// group the day's sessions, classify every day (present/late/absent/leave/remote/off), 8 filters, summary or daily
// detail, print on the letterhead and spreadsheet export.
import { useMemo, useState } from "react";
import { useToast } from "@/components/common/toast";
import { listAttendanceRange, type AttendanceRecord } from "@/lib/attendance";
import { listHolidays, listRequests, type Holiday } from "@/lib/leave";
import { printDoc, tfWrap } from "@/lib/calc/forms";
import type { EmployeeListItem } from "@/lib/api";

type Cls = "present" | "late" | "absent" | "leave" | "remote" | "off" | "pending";
const ST_AR: Record<Cls, string> = { present: "حاضر", late: "متأخر", absent: "غائب", leave: "إجازة", remote: "عن بعد", off: "عطلة", pending: "لم يُسجَّل بعد" };
const pad = (n: number) => (n < 10 ? "0" : "") + n;
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = (s: string) => {
  const p = s.slice(0, 10).split("-");
  return new Date(+p[0], +p[1] - 1, +p[2]);
};
const secs = (t: string | null) => {
  if (!t) return null;
  const p = String(t).split(":");
  return +p[0] * 3600 + (+p[1] || 0) * 60 + (parseFloat(p[2]) || 0);
};
const hm = (t: string | null) => (t ? String(t).slice(0, 5) : "");
const r2 = (n: number) => Math.round(n * 100) / 100;
const dispD = (s: string) => {
  const p = s.split("-");
  return `${p[2]}/${p[1]}/${p[0]}`;
};
const dayName = (d: Date) => d.toLocaleDateString("ar-SA", { weekday: "long" });

interface Grp { in: string | null; out: string | null; status: string; late: number; early: number; hours: number; noOut: boolean; auto: boolean; sessions: number }
interface Day { date: string; dow: string; cls: Cls; rec: Grp | null }
interface Sum { e: EmployeeListItem; expected: number; present: number; late: number; absent: number; leave: number; remote: number; lateMin: number; early: number; earlyDays: number; noOut: number; hours: number; rate: number | null; days: Day[] }

function groupRows(rows: AttendanceRecord[]): Map<string, Grp> {
  const g = new Map<string, AttendanceRecord[]>();
  rows.forEach((r) => {
    const k = r.employee_id + "|" + r.work_date.slice(0, 10);
    g.set(k, [...(g.get(k) ?? []), r]);
  });
  const out = new Map<string, Grp>();
  g.forEach((list, k) => {
    let rs = [...list].sort((a, b) => (secs(a.time_in) ?? 1e9) - (secs(b.time_in) ?? 1e9));
    const seen = new Map<string, number>();
    const uniq: AttendanceRecord[] = [];
    rs.forEach((r) => {
      if (r.time_in && seen.has(r.time_in)) {
        const i = seen.get(r.time_in)!;
        if ((secs(r.time_out) || 0) > (secs(uniq[i].time_out) || 0)) uniq[i] = r;
      } else {
        if (r.time_in) seen.set(r.time_in, uniq.length);
        uniq.push(r);
      }
    });
    rs = uniq;
    const first = rs[0];
    const withIn = rs.filter((r) => r.time_in);
    const isAuto = (r: AttendanceRecord) => /إغلاق تلقائي|auto/i.test(r.notes ?? "");
    let hours = 0;
    let anyAuto = false;
    withIn.forEach((r) => {
      const au = isAuto(r);
      if (au) anyAuto = true;
      if (r.time_out && !au) {
        const dd = ((secs(r.time_out) ?? 0) - (secs(r.time_in) ?? 0)) / 3600;
        if (dd > 0) hours += dd;
      }
    });
    const lastS = withIn.length ? withIn[withIn.length - 1] : first;
    const finalReal = !!(lastS && lastS.time_out && !isAuto(lastS));
    const anyLate = rs.some((r) => r.status === "late");
    const st = first.status || "present";
    out.set(k, {
      in: first.time_in,
      out: finalReal ? lastS.time_out : null,
      status: st === "absent" || st === "leave" || st === "remote" ? st : first.status === "late" || (anyLate && withIn.length <= 1) ? "late" : "present",
      late: first.status === "late" ? first.late_minutes || 0 : 0,
      early: finalReal ? lastS.early_minutes || 0 : 0,
      hours: r2(hours),
      noOut: !!first.time_in && !finalReal,
      auto: anyAuto,
      sessions: withIn.length,
    });
  });
  return out;
}

function holidaySet(hols: Holiday[], y1: number, y2: number) {
  const set = new Set<string>();
  for (let y = y1; y <= y2; y++)
    hols.forEach((h) => {
      const b = parseD(h.start_date);
      let s: Date;
      if (h.is_recurring) s = new Date(y, b.getMonth(), b.getDate());
      else if (b.getFullYear() !== y) return;
      else s = b;
      for (let i = 0; i < Math.max(1, h.days || 1); i++) set.add(ymd(new Date(s.getFullYear(), s.getMonth(), s.getDate() + i)));
    });
  return set;
}

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
      const grp = groupRows(rows);
      const off = holidaySet(hols, +f.slice(0, 4), +t.slice(0, 4));
      const lv = new Map<string, string>();
      reqs.forEach((l) => {
        if (!l.from_date) return;
        for (let d = parseD(l.from_date); d <= parseD(l.to_date || l.from_date); d.setDate(d.getDate() + 1))
          lv.set(l.employee_id + "|" + ymd(d), l.type === "remote" ? "remote" : "leave");
      });
      const today = ymd(new Date());
      const list = sel ? emps.filter((e) => sel.has(e.id)) : emps;
      const out: Sum[] = list.map((e) => {
        const s: Sum = { e, expected: 0, present: 0, late: 0, absent: 0, leave: 0, remote: 0, lateMin: 0, early: 0, earlyDays: 0, noOut: 0, hours: 0, rate: null, days: [] };
        for (let d = parseD(f); d <= parseD(t); d.setDate(d.getDate() + 1)) {
          const ds = ymd(d);
          if (ds > today) break;
          if (e.join_date && ds < e.join_date.slice(0, 10)) continue;
          const g = grp.get(e.id + "|" + ds) ?? null;
          const isOff = d.getDay() === 5 || d.getDay() === 6 || off.has(ds);
          let cls: Cls;
          if (g) cls = g.status as Cls;
          else if (isOff) cls = "off";
          else if (lv.has(e.id + "|" + ds)) cls = lv.get(e.id + "|" + ds) as Cls;
          else if (ds === today) cls = "pending";
          else cls = "absent";
          if (cls !== "off" && cls !== "pending" && !(isOff && g)) s.expected++;
          if (cls === "present") s.present++;
          else if (cls === "late") s.late++;
          else if (cls === "absent") s.absent++;
          else if (cls === "leave") s.leave++;
          else if (cls === "remote") s.remote++;
          if (g) {
            if (cls === "late") s.lateMin += g.late;
            if (g.early > 0) { s.early += g.early; s.earlyDays++; }
            if (g.noOut && ds < today) s.noOut++;
            s.hours += g.hours;
          }
          s.days.push({ date: ds, dow: dayName(d), cls, rec: g });
        }
        s.hours = r2(s.hours);
        const base = s.expected - s.leave;
        s.rate = base > 0 ? Math.round(((s.present + s.late + s.remote) / base) * 1000) / 10 : null;
        return s;
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
    const rows: unknown[][] = mode === "det" ? [["الموظف", ...DET_HDR], ...res.flatMap((s) => s.days.filter((d) => d.cls !== "off" || d.rec).map((d) => [s.e.name_ar, ...detRow(d)]))] : [HDR, ...res.map(sumRow)];
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
        {fld("من تاريخ", <input type="date" style={{ width: "100%" }} value={from} onChange={(e) => setFrom(e.target.value)} />)}
        {fld("إلى تاريخ", <input type="date" style={{ width: "100%" }} value={to} onChange={(e) => setTo(e.target.value)} />)}
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
