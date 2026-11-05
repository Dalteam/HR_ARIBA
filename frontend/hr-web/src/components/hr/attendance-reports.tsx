"use client";

// The attendance report builder (منشئ تقرير الحضور والانصراف) in the updated design's form (its
// pages/attendance/AttReport.jsx): period and report type (a row per employee, or a row per day), the design's
// column catalogue with presets, column order and templates saved in this browser, the employees (all, filtered, or
// hand-picked, terminated optional), and extra sections (KPI cards, departments, rankings, daily trend with chart,
// weekdays, absence / lateness / early-exit / no-check-out / leave / day-off details, the matrix, the daily detail).
// The days are classified by OUR engine (lib/calc/att-reports.ts) from OUR /attendance/range, approved requests and
// holidays. Print, PDF, Excel and Word are local; e-mailing an export and the stamp wait (lib/features.ts).
// Not ported: the design's "direct manager" and "mobile" columns (our employee list does not return them), and its
// shift schedule (official / Ramadan) which waits for the flexible-hours stage: required hours come from the number
// in step 4 (it starts at our attendance settings' shift length), and the scheduled shift from our work start.
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/common/toast";
import { DateField } from "@/components/common/date-time-field";
import { Modal } from "@/components/hr/modal";
import { useSealStudio } from "@/components/hr/seal-studio";
import { listAttendanceRange } from "@/lib/attendance";
import { listHolidays, listRequests } from "@/lib/leave";
import { printDoc, tfWrap } from "@/lib/calc/forms";
import { htmlPdfBlob, saveBlob } from "@/lib/exporter";
import { FEATURES } from "@/lib/features";
import { previewDoc } from "@/lib/seal";
import { useLocale } from "@/lib/i18n/locale";
import type { AttendanceSettings } from "@/lib/settings";
import { buildXlsx, type Sheet } from "@/lib/xlsx";
import type { EmployeeListItem } from "@/lib/api";
import { computeReport, fmtHM, FILTERS, hm, secs, ST_AR, ST_EN, ymd, type Cls, type Day, type Sum as SumOf } from "@/lib/calc/att-reports";

type E = EmployeeListItem;
type Sum = SumOf<E>;
type V = string | number;
/** [key, Arabic, English, on by default, group] */
type Col = [string, string, string, number, string];
type Res = { r: Sum[]; from: string; to: string; fk: string; at: Date };
type TableBlock = {
  type: "table"; key: string; title: string; name: string; head: string[]; rows: (V[] | { sub: string })[];
  totals?: V[] | null; rowCls?: string[]; cls?: string; nameCol?: number; small?: boolean; cards?: boolean; h4?: boolean; emp?: V[];
};
type Block = { type: "kpi"; items: [V, string][] } | { type: "html"; html: string; excel?: { name: string; head: string[]; rows: V[][] } } | TableBlock;

const pad = (n: number) => (n < 10 ? "0" : "") + n;
const dispD = (s: string) => { const p = String(s).slice(0, 10).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; };
const dm = (s: string) => String(s).slice(8, 10) + "/" + String(s).slice(5, 7);
const fH = (h: number | null | undefined) => { if (h == null || isNaN(h)) return ""; const m = Math.round(Number(h) * 60); return Math.floor(m / 60) + ":" + pad(m % 60); };
const fT = (sec: number | null | undefined) => { if (sec == null || isNaN(sec)) return ""; const m = Math.round(sec / 60); return pad(Math.floor(m / 60) % 24) + ":" + pad(m % 60); };
const r1 = (n: number) => Math.round(n * 10) / 10;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const empNoSort = (a: E, b: E) => String(a.emp_no).localeCompare(String(b.emp_no), "en", { numeric: true });

// ===== the design's catalogues =====
const SUM: Col[] = [
  ["no", "#", "#", 1, "emp"], ["name", "الموظف", "Employee", 1, "emp"], ["empNo", "الرقم الوظيفي", "Emp. no", 1, "emp"], ["idNo", "رقم الهوية / الإقامة", "ID / Iqama no.", 0, "emp"], ["nat", "الجنسية", "Nationality", 0, "emp"],
  ["dept", "القسم", "Department", 1, "emp"], ["job", "الوظيفة", "Job title", 0, "emp"], ["employer", "جهة العمل", "Employer", 0, "emp"], ["join", "تاريخ المباشرة", "Join date", 0, "emp"],
  ["expected", "أيام العمل المطلوبة", "Working days", 1, "days"], ["attended", "أيام الحضور الفعلي", "Days attended", 1, "days"], ["present", "حاضر في الموعد", "On time", 0, "days"], ["late", "أيام التأخير", "Late days", 1, "days"], ["absent", "أيام الغياب", "Absent days", 1, "days"],
  ["leave", "أيام الإجازة", "Leave days", 1, "days"], ["remote", "عن بعد", "Remote days", 0, "days"], ["offWorked", "عمل في العطل", "Worked on days off", 0, "days"], ["earlyDays", "أيام الخروج المبكر", "Early-exit days", 0, "days"], ["noOut", "أيام بدون انصراف", "No check-out days", 0, "days"], ["multi", "أيام بأكثر من بصمة", "Multi-punch days", 0, "days"], ["streak", "أطول غياب متصل (يوم)", "Longest absence streak", 0, "days"],
  ["lateTot", "إجمالي التأخير", "Total late", 1, "time"], ["lateAvg", "متوسط التأخير لليوم", "Avg late per late day", 0, "time"], ["lateMax", "أكبر تأخير", "Max late", 0, "time"], ["earlyTot", "إجمالي الخروج المبكر", "Total early exit", 0, "time"],
  ["avgIn", "متوسط أول حضور", "Avg first check-in", 0, "time"], ["avgOut", "متوسط آخر انصراف", "Avg last check-out", 0, "time"], ["minIn", "أبكر حضور", "Earliest check-in", 0, "time"], ["maxOut", "أخر انصراف", "Latest check-out", 0, "time"],
  ["span", "الساعات (أول حضور ← آخر انصراف)", "Hours (first in → last out)", 1, "hours"], ["net", "صافي ساعات العمل (بدون الفواصل)", "Net work hours", 0, "hours"], ["brk", "إجمالي الفواصل (خروج ورجوع)", "Total breaks", 0, "hours"], ["avgDay", "متوسط الساعات اليومية", "Avg daily hours", 0, "hours"],
  ["req", "الساعات المطلوبة", "Required hours", 0, "hours"], ["short", "نقص الساعات", "Hours shortfall", 0, "hours"], ["over", "ساعات إضافية", "Overtime hours", 0, "hours"],
  ["rate", "نسبة الحضور %", "Attendance %", 1, "rate"], ["absRate", "نسبة الغياب %", "Absence %", 0, "rate"], ["lateRate", "نسبة التأخير %", "Lateness %", 0, "rate"], ["punct", "نسبة الالتزام بالموعد %", "Punctuality %", 0, "rate"], ["grade", "التقييم", "Rating", 0, "rate"],
  ["absentDates", "تواريخ الغياب", "Absence dates", 0, "dates"], ["lateDates", "تواريخ التأخير (بالدقائق)", "Late dates (min)", 0, "dates"], ["leaveDates", "تواريخ الإجازات", "Leave dates", 0, "dates"], ["earlyDates", "تواريخ الخروج المبكر", "Early-exit dates", 0, "dates"], ["noOutDates", "تواريخ بدون انصراف", "No check-out dates", 0, "dates"], ["locs", "مواقع البصمة", "Punch locations", 0, "dates"],
];
const GRP: Record<string, [string, string]> = { emp: ["بيانات الموظف", "Employee data"], days: ["الأيام والعدّادات", "Days & counters"], time: ["الأوقات والتأخير", "Times & lateness"], hours: ["ساعات العمل", "Work hours"], rate: ["النِّسب والتقييم", "Rates & rating"], dates: ["التواريخ التفصيلية", "Detailed dates"] };
const DET: [string, string, string, number][] = [["date", "التاريخ", "Date", 1], ["dow", "اليوم", "Day", 1], ["st", "الحالة", "Status", 1], ["sched", "الدوام المطلوب", "Scheduled shift", 0], ["in", "أول حضور", "First check-in", 1], ["out", "آخر انصراف", "Last check-out", 1],
  ["span", "الساعات (أول ← آخر)", "Hours (first → last)", 1], ["net", "صافي العمل", "Net work", 0], ["brk", "الفواصل", "Breaks", 0], ["sess", "عدد البصمات", "Punch count", 0], ["punches", "كل البصمات (خروج ورجوع)", "All punches (out & back)", 0],
  ["late", "تأخير", "Late", 1], ["early", "خروج مبكر", "Early exit", 1], ["short", "نقص الساعات", "Shortfall", 0], ["over", "إضافي", "Overtime", 0], ["loc", "الموقع", "Location", 0], ["notes", "ملاحظات", "Notes", 1]];
const DAYC: Col[] = [["name", "الموظف", "Employee", 1, "emp"], ["empNo", "الرقم الوظيفي", "Emp. no", 1, "emp"], ["dept", "القسم", "Department", 0, "emp"], ["job", "الوظيفة", "Job title", 0, "emp"], ...DET.map((c): Col => [c[0], c[1], c[2], c[3], "day"])];
const GRPD: Record<string, [string, string]> = { emp: ["بيانات الموظف", "Employee data"], day: ["بيانات اليوم", "Day data"] };
const SECT: [string, string, string, number][] = [["meta", "بيانات التقرير (الفترة، النطاق، وقت الإصدار)", "Report info (period, scope, issued at)", 1], ["kpi", "ملخص الأرقام (البطاقات)", "KPI cards", 1], ["dept", "ملخص الأقسام", "Department summary", 0],
  ["rank", "الترتيب: الأكثر تأخيرًا والأكثر غيابًا والأفضل التزامًا", "Rankings: most late / absent / best", 0], ["trend", "الملخص اليومي للمنشأة + رسم بياني", "Daily company summary + chart", 0], ["wday", "تحليل أيام الأسبوع", "Weekday analysis", 0],
  ["absentDet", "تفصيل أيام الغياب (بالتاريخ)", "Absence days detail", 0], ["lateDet", "تفصيل التأخيرات (التاريخ والوقت والدقائق)", "Lateness detail", 0], ["earlyDet", "تفصيل الخروج المبكر", "Early-exit detail", 0], ["noOutDet", "تفصيل أيام بدون بصمة انصراف", "Missing check-out detail", 0],
  ["leaveDet", "تفصيل الإجازات والعمل عن بعد (فترات)", "Leave / remote periods", 0], ["offDet", "تفصيل العمل في العطل", "Work on days off detail", 0], ["matrix", "مصفوفة الحضور (موظف × يوم) — حتى 31 يومًا", "Attendance matrix (employee × day) — up to 31 days", 0],
  ["det", "التفصيل اليومي مجمّعًا تحت كل موظف", "Daily detail grouped under each employee", 0], ["note", "ملاحظة طريقة الحساب (اختيارية)", "Method note (optional)", 0]];
const KPIS: [string, string, string, number][] = [["emps", "عدد الموظفين", "Employees", 1], ["expected", "أيام العمل", "Working days", 0], ["attended", "أيام الحضور الفعلي", "Days attended", 1], ["present", "حاضر في الموعد", "On time", 1], ["late", "أيام التأخير", "Late days", 1], ["absent", "أيام الغياب", "Absent days", 1],
  ["leave", "أيام الإجازة", "Leave days", 1], ["remote", "عن بعد", "Remote", 1], ["offWorked", "عمل في العطل", "Worked on days off", 0], ["lateTot", "إجمالي التأخير", "Total late", 1], ["lateAvg", "متوسط التأخير", "Avg late", 0], ["earlyTot", "إجمالي الخروج المبكر", "Total early exit", 0],
  ["noOut", "بدون انصراف", "No check-out", 0], ["span", "الساعات (أول ← آخر)", "Hours (first → last)", 1], ["net", "صافي الساعات", "Net hours", 0], ["req", "الساعات المطلوبة", "Required hours", 0], ["short", "نقص الساعات", "Shortfall", 0], ["over", "ساعات إضافية", "Overtime", 0],
  ["rate", "نسبة الحضور %", "Attendance %", 1], ["absRate", "نسبة الغياب %", "Absence %", 0], ["punct", "نسبة الالتزام بالموعد %", "Punctuality %", 0], ["clean", "ملتزمون (بلا تأخير/غياب)", "Fully compliant", 0], ["avgIn", "متوسط أول حضور", "Avg check-in", 0], ["avgOut", "متوسط آخر انصراف", "Avg check-out", 0]];
const SORTS: [string, string, string][] = [["name", "الاسم", "Name"], ["empNo", "الرقم الوظيفي", "Employee no."], ["dept", "القسم", "Department"], ["rateA", "نسبة الحضور (الأقل أولًا)", "Attendance % (lowest first)"], ["rateD", "نسبة الحضور (الأعلى أولًا)", "Attendance % (highest first)"], ["lateD", "الأكثر تأخيرًا", "Most late"], ["absD", "الأكثر غيابًا", "Most absent"], ["hoursD", "الأكثر ساعات", "Most hours"]];
const ALLK = (c: { 0: string }[]) => c.map((x) => x[0]);
type Opts = { mode: "sum" | "day"; sum: string[]; day: string[]; sect: string[]; kpi: string[]; offDays: boolean; sort: string; byDept: boolean; totals: boolean; reqH: number | string; topN: number | string; fs: number };
type Preset = ["sum" | "day", string, string, Partial<Opts>];
const PRESETS: Preset[] = [
  ["sum", "مختصر", "Brief", { sum: ["no", "name", "empNo", "attended", "late", "absent", "leave", "rate"], sect: ["meta", "kpi"], kpi: ["emps", "attended", "late", "absent", "leave", "rate"] }],
  ["sum", "أساسي", "Basic", { sum: ["no", "name", "empNo", "dept", "expected", "attended", "late", "absent", "leave", "lateTot", "span", "rate"], sect: ["meta", "kpi"], kpi: ["emps", "attended", "late", "absent", "leave", "span", "rate"] }],
  ["sum", "الغياب والتأخير", "Absence & lateness", { sum: ["no", "name", "empNo", "dept", "expected", "late", "absent", "lateTot", "absentDates", "lateDates", "rate"], sect: ["meta", "kpi", "rank", "absentDet", "lateDet"], kpi: ["emps", "late", "absent", "lateTot", "absRate", "clean"] }],
  ["sum", "ساعات للمحاسبة", "Hours for payroll", { sum: ["no", "name", "empNo", "dept", "expected", "attended", "absent", "leave", "span", "net", "req", "short", "over", "lateTot", "rate"], sect: ["meta", "kpi", "dept"], kpi: ["emps", "attended", "span", "net", "req", "short", "over", "lateTot"] }],
  ["sum", "كامل", "Everything", { sum: ALLK(SUM), sect: ALLK(SECT).filter((k) => k !== "note"), kpi: ALLK(KPIS) }],
  ["day", "يومي مختصر", "Daily brief", { day: ["name", "empNo", "date", "dow", "st", "in", "out", "span", "late"], sect: ["meta"], kpi: [] }],
  ["day", "يومي بكل البصمات", "Daily with all punches", { day: ["name", "empNo", "date", "dow", "st", "in", "out", "span", "net", "sess", "punches", "late", "early", "loc", "notes"], sect: ["meta"], kpi: [] }],
  ["day", "يومي كامل", "Daily everything", { day: ALLK(DAYC), sect: ["meta"], kpi: [] }],
];
// the design's browser keys: the chosen options and the saved templates live in this browser only
const LS = "ariba_att_rpt_opts4", LST = "ariba_att_tpl_v1";
const defOpts = (reqH: number): Opts => ({ mode: "sum", sum: SUM.filter((c) => c[3]).map((c) => c[0]), day: DAYC.filter((c) => c[3]).map((c) => c[0]), sect: SECT.filter((c) => c[3]).map((c) => c[0]), kpi: KPIS.filter((c) => c[3]).map((c) => c[0]), offDays: false, sort: "empNo", byDept: false, totals: true, reqH, topN: 5, fs: 8.5 });
const loadOpts = (reqH: number): Opts => {
  try {
    const o = JSON.parse(localStorage.getItem(LS) || "null");
    if (o && typeof o === "object") return { ...defOpts(reqH), ...o };
  } catch { /* ignore */ }
  return defOpts(reqH);
};
type Tpl = { n: string; o: Partial<Opts> };
const readTpl = (): Tpl[] => { try { const a = JSON.parse(localStorage.getItem(LST) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
const gradeOf = (r: number | null, en: boolean) => (r == null ? "" : r >= 98 ? (en ? "Excellent" : "ممتاز") : r >= 95 ? (en ? "Very good" : "جيد جدًا") : r >= 90 ? (en ? "Good" : "جيد") : r >= 80 ? (en ? "Fair" : "مقبول") : en ? "Poor" : "ضعيف");

const CSS = '<style>*{box-sizing:border-box}body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#14231d;margin:0}.rp{padding:0 11mm}.t{text-align:center;font-size:18px;font-weight:900;color:#014D3D}.s{text-align:center;color:#555;margin:1mm 0 2mm;font-size:11px}.mt{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;font-size:9px;color:#666;margin-bottom:3mm}.k{display:flex;gap:5px;margin-bottom:4mm;flex-wrap:wrap}.k div{flex:1;min-width:76px;background:#eef5f2;border:1px solid #d8e2de;border-radius:7px;padding:5px;text-align:center}.k b{display:block;font-size:14px;color:#014D3D}.k span{font-size:8.5px;color:#666}table{width:100%;border-collapse:collapse;margin-bottom:3mm}th{background:#014D3D;color:#fff;padding:4px 3px;text-align:center}td{padding:3px;border-bottom:1px solid #e5ece9;text-align:center}tr{page-break-inside:avoid}tr:nth-child(even) td{background:#f8faf9}tr.a td{background:#fdecec;color:#9b1c1c}tr.l td{background:#fff6e0}tr.v td{background:#eef2ff}tr.o td{color:#889}tr.tt td{background:#dfeee8;font-weight:800}tr.sub td{background:#cfe3db;font-weight:800;text-align:start;color:#014D3D}h4{background:#014D3D;color:#fff;padding:4px 8px;border-radius:5px;margin:4mm 0 1mm;font-size:11px;page-break-after:avoid}h5{margin:4mm 0 1mm;font-size:11px;color:#014D3D;border-bottom:2px solid #014D3D;padding-bottom:1px;page-break-after:avoid}.n{margin-top:4mm;padding-top:2mm;border-top:1px solid #ddd;font-size:8px;color:#777;line-height:1.7}.al{text-align:start}.mx td,.mx th{padding:2px 1px;font-size:7px;min-width:12px}.mx td.P{background:#d7f0e0;color:#0a6b35}.mx td.L{background:#ffe9b8;color:#8a5a00}.mx td.A{background:#f9c9c9;color:#9b1c1c;font-weight:800}.mx td.V{background:#d9e4ff;color:#1b3f99}.mx td.R{background:#d9f3f5;color:#0b6b73}.mx td.O{background:#efefef;color:#aaa}.lg{font-size:8px;color:#555;margin:1mm 0 3mm}.ch{display:flex;align-items:flex-end;gap:1px;height:70px;border-bottom:1px solid #999;margin:2mm 0 1mm;direction:ltr}.ch i{flex:1;display:flex;flex-direction:column-reverse;min-width:2px;height:100%}.ch u{display:block;text-decoration:none;width:100%}.ch .p{background:#2e9e5b}.ch .l{background:#f0a800}.ch .a{background:#d64545}.ch .v{background:#4a78d6}.ec{border:1px solid #cfdcd6;border-radius:7px;margin:0 0 2.5mm;page-break-inside:avoid}.ec h6{margin:0;background:#014D3D;color:#fff;padding:3px 8px;font-size:10.5px;border-radius:6px 6px 0 0}.ec.tt h6{background:#0a7a5a}.eg{display:grid;grid-template-columns:repeat(4,1fr);gap:0}.eg div{padding:2px 6px;border-bottom:1px solid #eef2f0;border-inline-end:1px solid #eef2f0;min-height:20px}.eg span{display:block;font-size:7.5px;color:#777}.eg b{font-size:9px;font-weight:700;color:#14231d;word-break:break-word}.chl{display:flex;gap:10px;font-size:8px;color:#555;margin-bottom:3mm}</style>';

/** A numbered step heading of the builder (the design's `St`). */
function St({ n, t, sub, right }: { n: string; t: string; sub?: string; right?: React.ReactNode }) {
  return <div className="cr-st"><span className="cr-n">{n}</span><div style={{ flex: 1 }}><div className="cr-t">{t}</div>{sub && <div className="cr-s">{sub}</div>}</div>{right}</div>;
}

/** `emps` are the current employees; `terms` the terminated ones (the design's «مع المنتهية خدمتهم»). */
export function AttendanceReports({ emps: empsProp, terms, att }: { emps: E[]; terms: E[]; att: AttendanceSettings | null }) {
  const toast = useToast();
  const { lang } = useLocale();
  const [rl, setRl] = useState("");
  const en = rl ? rl === "en" : lang === "en";
  const T = (x: string, y: string) => (en ? y : x);
  const ms = (d: Date) => ymd(new Date(d.getFullYear(), d.getMonth(), 1));
  const shiftH = Number(att?.shift_hours) || 8;
  const [from, setFrom] = useState(() => ms(new Date()));
  const [to, setTo] = useState(() => ymd(new Date()));
  const [fk, setFk] = useState("all");
  const [minN, setMinN] = useState<number | string>(1);
  const [scope, setScope] = useState<"all" | "pick">("all");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [inclTerm, setInclTerm] = useState(false);
  const [fEmployer, setFEmployer] = useState("");
  const [fDept, setFDept] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [opts, setOptsS] = useState<Opts>(() => defOpts(shiftH));
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [tname, setTname] = useState("");
  const [xd, setXd] = useState<Res | null>(null);
  const [seal, setSeal] = useState(false);
  const { askSeal, sealNode } = useSealStudio();
  useEffect(() => {
    // read this browser's saved options and templates once (localStorage is not there during the server render)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptsS(loadOpts(shiftH));
    setTpls(readTpl());
  }, [shiftH]);
  const setOpts = (o: Opts) => { setOptsS(o); try { localStorage.setItem(LS, JSON.stringify(o)); } catch { /* ignore */ } };
  const quick = (k: string) => {
    const n = new Date();
    let f: string, t: string;
    if (k === "m0") { f = ms(n); t = ymd(n); }
    else if (k === "m1") { f = ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)); t = ymd(new Date(n.getFullYear(), n.getMonth(), 0)); }
    else if (k === "d7") { f = ymd(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 6)); t = ymd(n); }
    else if (k === "d30") { f = ymd(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 29)); t = ymd(n); }
    else if (k === "d1") { f = t = ymd(n); }
    else { f = n.getFullYear() + "-01-01"; t = ymd(n); }
    setFrom(f);
    setTo(t);
  };
  const nameOf = (e: E) => (en ? e.name_en || e.name_ar : e.name_ar || e.name_en || e.emp_no);
  const lk = (x: { name_ar: string; name_en: string } | null) => (x ? (en ? x.name_en || x.name_ar : x.name_ar) : "");
  const deptOf = (e: E) => lk(e.department);
  const emplOf = (e: E) => lk(e.workplace);
  const allE = useMemo(() => [...empsProp, ...terms], [empsProp, terms]);
  const employers = useMemo(() => [...new Set(allE.map((e) => e.workplace?.name_ar).filter(Boolean))] as string[], [allE]);
  const depts = useMemo(() => [...new Set(allE.map((e) => e.department?.name_ar).filter(Boolean))] as string[], [allE]);
  const pool = useMemo(
    () => [...empsProp, ...(inclTerm ? terms : [])].filter((e) => (!fEmployer || e.workplace?.name_ar === fEmployer) && (!fDept || e.department?.name_ar === fDept)).sort(empNoSort),
    [empsProp, terms, inclTerm, fEmployer, fDept],
  );
  const selected = scope === "all" ? pool : pool.filter((e) => sel[e.id]);
  const list = pool.filter((e) => !q.trim() || `${e.name_ar} ${e.name_en ?? ""} ${e.emp_no}`.toLowerCase().includes(q.trim().toLowerCase()));
  const key = opts.mode === "day" ? "day" : "sum", CAT = key === "day" ? DAYC : SUM, GR = key === "day" ? GRPD : GRP, fields = opts[key];
  const L = (c: { 1: string; 2: string }) => (en ? c[2] : c[1]);
  const stL = (c: Cls) => (en ? ST_EN : ST_AR)[c] || c;
  const arrow = en ? "→" : "←";
  const tog = (grp: "sum" | "day" | "sect" | "kpi", k: string) => setOpts({ ...opts, [grp]: opts[grp].includes(k) ? opts[grp].filter((x) => x !== k) : [...opts[grp], k] });
  const move = (i: number, d: number) => { const n = [...fields], j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setOpts({ ...opts, [key]: n }); };
  const grpAll = (g: string, on: boolean) => { const ks = CAT.filter((c) => c[4] === g).map((c) => c[0]); setOpts({ ...opts, [key]: on ? [...fields, ...ks.filter((k) => !fields.includes(k))] : fields.filter((k) => !ks.includes(k)) }); };
  const saveTpl = () => {
    const n = tname.trim();
    if (!n) return;
    const nx = [...tpls.filter((t) => t.n !== n), { n, o: { mode: opts.mode, sum: opts.sum, day: opts.day, sect: opts.sect, kpi: opts.kpi } }];
    setTpls(nx);
    setTname("");
    try { localStorage.setItem(LST, JSON.stringify(nx)); } catch { /* ignore */ }
  };
  const delTpl = (n: string) => { const nx = tpls.filter((t) => t.n !== n); setTpls(nx); try { localStorage.setItem(LST, JSON.stringify(nx)); } catch { /* ignore */ } };
  const applyPreset = (p: Preset) => setOpts({ ...opts, mode: p[0], ...p[3] });

  async function run(): Promise<Res | null> {
    if (!from || !to || to < from) { toast(T("حدد فترة صحيحة (من ≤ إلى)", "Choose a valid date range"), "err"); return null; }
    if (!selected.length) { toast(T("اختر موظفًا واحدًا على الأقل", "Select at least one employee"), "err"); return null; }
    setBusy("run");
    setMsg("");
    try {
      const [rows, hols, reqs] = await Promise.all([listAttendanceRange(from, to), listHolidays(), listRequests({ status: "approved" })]);
      const dayName = (d: Date) => d.toLocaleDateString(en ? "en-US" : "ar-SA", { weekday: "long" });
      const r = computeReport({
        rows, from, to, emps: selected, hols, today: ymd(new Date()), dayName,
        leaves: reqs.map((l) => ({ employee_id: l.employee_id, from_date: l.from_date, to_date: l.to_date, type: l.type })),
      }).filter((s) => FILTERS[fk].f(s, Math.max(1, parseInt(String(minN), 10) || 1)));
      const out = { r, from, to, fk, at: new Date() };
      setRes(out);
      return out;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy("");
    }
  }
  // as in the design: the report runs when the screen opens and when its language changes
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void run(); }, [rl]);

  // ===== derived values =====
  // our settings have one fixed shift (work start + shift length) unless flexible hours are on; the design's
  // official / Ramadan schedule waits for its stage
  const fixedStart = att?.work_start && !att.flexible_enabled ? hm(att.work_start) : "";
  const fixedEnd = fixedStart ? fT((secs(fixedStart) ?? 0) + shiftH * 3600) : "";
  const reqFor = () => Number(opts.reqH) || 0;
  const dayX = (d: Day) => {
    const r = d.rec;
    if (!r) return { span: null as number | null, net: 0, brk: null as number | null, i: null as number | null, o: null as number | null };
    const i = r.in ? secs(r.in) : null, o = r.out ? secs(r.out) : null;
    const span = i != null && o != null && o > i ? (o - i) / 3600 : null;
    return { span, net: r.hours, brk: span != null ? Math.max(0, span - r.hours) : null, i, o };
  };
  const calc = (s: Sum) => {
    const A = { span: 0, brk: 0, multi: 0, worked: 0, req: 0, short: 0, over: 0, lateMax: 0, streak: 0, absentDates: [] as string[], leaveDates: [] as string[], lateList: [] as [string, number, string | null][], earlyList: [] as [string, number, string | null][], noOutList: [] as string[], locs: {} as Record<string, number>, avgIn: "", avgOut: "", minIn: "", maxOut: "", attended: 0, absRate: "" as V, lateRate: "" as V, punct: "" as V, lateAvg: 0 };
    let inS = 0, inN = 0, outS = 0, outN = 0, cur = 0, minIn: number | null = null, maxOut: number | null = null;
    const today = ymd(new Date());
    s.days.forEach((d) => {
      const r = d.rec, c = d.cls, need = c === "off" || c === "leave" || c === "pending" ? 0 : reqFor();
      if (c === "absent") { A.absentDates.push(d.date); cur++; A.streak = Math.max(A.streak, cur); } else if (c !== "off" && c !== "pending") cur = 0;
      if (c === "leave" || c === "remote") A.leaveDates.push(d.date);
      A.req += need;
      if (r && r.in) {
        const x = dayX(d);
        A.worked++;
        if (x.span != null) { A.span += x.span; A.brk += x.brk ?? 0; }
        if (r.sessions > 1) A.multi++;
        inS += x.i ?? 0; inN++;
        if (x.o != null) { outS += x.o; outN++; if (maxOut == null || x.o > maxOut) maxOut = x.o; }
        if (x.i != null && (minIn == null || x.i < minIn)) minIn = x.i;
        if (r.loc) A.locs[r.loc] = (A.locs[r.loc] || 0) + 1;
        if (need > 0 && r.hours < need) A.short += need - r.hours;
        if (r.hours > need) A.over += r.hours - need;
        if (c === "late") { A.lateList.push([d.date, r.late, r.in]); A.lateMax = Math.max(A.lateMax, r.late); }
        if (r.early > 0) A.earlyList.push([d.date, r.early, r.out]);
        if (r.noOut && d.date < today) A.noOutList.push(d.date);
      } else if (need > 0 && c === "absent") A.short += need;
    });
    A.avgIn = inN ? fT(inS / inN) : ""; A.avgOut = outN ? fT(outS / outN) : ""; A.minIn = minIn != null ? fT(minIn) : ""; A.maxOut = maxOut != null ? fT(maxOut) : "";
    A.attended = s.present + s.late + s.remote;
    const base = s.expected - s.leave;
    A.absRate = base > 0 ? r1((s.absent / base) * 100) : ""; A.lateRate = A.attended ? r1((s.late / A.attended) * 100) : ""; A.punct = A.attended ? r1((s.present / A.attended) * 100) : "";
    A.lateAvg = s.late ? s.lateMin / s.late : 0;
    return A;
  };
  const dl = (arr: string[]) => arr.map(dm).join("، ");
  const rangesOf = (s: Sum) => {
    const out: { t: Cls; from: string; to: string; n: number }[] = [];
    let cur: (typeof out)[number] | null = null;
    s.days.forEach((d) => {
      if (d.cls === "leave" || d.cls === "remote") {
        if (cur && cur.t === d.cls) { cur.to = d.date; cur.n++; } else { cur = { t: d.cls, from: d.date, to: d.date, n: 1 }; out.push(cur); }
      } else if (d.cls !== "off") cur = null;
    });
    return out;
  };

  const build = (o: Res): Block[] => {
    const memo = new Map<Sum, ReturnType<typeof calc>>(), X = (s: Sum) => { if (!memo.has(s)) memo.set(s, calc(s)); return memo.get(s)!; };
    const has = (k: string) => opts.sect.includes(k), cmpName = (a: Sum, b: Sum) => String(nameOf(a.e)).localeCompare(String(nameOf(b.e)), en ? "en" : "ar");
    const sorters: Record<string, (a: Sum, b: Sum) => number> = {
      name: cmpName, empNo: (a, b) => empNoSort(a.e, b.e), dept: (a, b) => String(deptOf(a.e)).localeCompare(String(deptOf(b.e)), "ar") || cmpName(a, b),
      rateA: (a, b) => (a.rate ?? 999) - (b.rate ?? 999), rateD: (a, b) => (b.rate ?? -1) - (a.rate ?? -1), lateD: (a, b) => b.lateMin - a.lateMin, absD: (a, b) => b.absent - a.absent, hoursD: (a, b) => b.hours - a.hours,
    };
    let rows = o.r.slice().sort(sorters[opts.sort] || sorters.empNo);
    if (opts.byDept) rows = rows.sort((a, b) => String(deptOf(a.e)).localeCompare(String(deptOf(b.e)), "ar"));
    const blocks: Block[] = [], push = (b: Block) => blocks.push(b);
    const SK = Object.fromEntries(SUM.map((c) => [c[0], c])), DK = Object.fromEntries(DAYC.map((c) => [c[0], c]));
    const sCols = opts.sum.map((k) => SK[k]).filter(Boolean), dayCols = opts.day.map((k) => DK[k]).filter(Boolean), dCols = dayCols.filter((c) => c[4] === "day");
    const RAW: Record<string, (s: Sum) => number> = {
      expected: (s) => s.expected, attended: (s) => X(s).attended, present: (s) => s.present, late: (s) => s.late, absent: (s) => s.absent, leave: (s) => s.leave, remote: (s) => s.remote, offWorked: (s) => s.offWorked, earlyDays: (s) => s.earlyDays, noOut: (s) => s.noOut, multi: (s) => X(s).multi,
      lateTot: (s) => s.lateMin, earlyTot: (s) => s.early, span: (s) => X(s).span, net: (s) => s.hours, brk: (s) => X(s).brk, req: (s) => X(s).req, short: (s) => X(s).short, over: (s) => X(s).over,
    };
    const MIN: Record<string, 1> = { lateTot: 1, earlyTot: 1, lateAvg: 1, lateMax: 1 }, HRS: Record<string, 1> = { span: 1, net: 1, brk: 1, req: 1, short: 1, over: 1, avgDay: 1 };
    const fmtCol = (k: string, v: number): V => (MIN[k] ? fmtHM(v, en) : HRS[k] ? fH(v) : v);
    const sumVal = (k: string, s: Sum, i: number): V => {
      const a = X(s), e = s.e;
      switch (k) {
        case "no": return i + 1; case "name": return nameOf(e); case "empNo": return String(e.emp_no || ""); case "idNo": return String(e.national_id_masked || ""); case "nat": return lk(e.nationality); case "dept": return deptOf(e); case "job": return e.job_title || ""; case "employer": return emplOf(e);
        case "join": return e.join_date ? dispD(e.join_date) : ""; case "streak": return a.streak; case "lateMax": return fmtHM(a.lateMax, en); case "lateAvg": return s.late ? fmtHM(a.lateAvg, en) : "";
        case "avgIn": return a.avgIn; case "avgOut": return a.avgOut; case "minIn": return a.minIn; case "maxOut": return a.maxOut; case "avgDay": return a.worked ? fH(s.hours / a.worked) : ""; case "rate": return s.rate == null ? "" : s.rate; case "absRate": return a.absRate; case "lateRate": return a.lateRate; case "punct": return a.punct; case "grade": return gradeOf(s.rate, en);
        case "absentDates": return dl(a.absentDates); case "lateDates": return a.lateList.map((x) => dm(x[0]) + " (" + x[1] + ")").join("، "); case "leaveDates": return dl(a.leaveDates); case "earlyDates": return a.earlyList.map((x) => dm(x[0]) + " (" + x[1] + ")").join("، "); case "noOutDates": return dl(a.noOutList);
        case "locs": return Object.keys(a.locs).join("، ");
        default: return RAW[k] ? fmtCol(k, RAW[k](s)) : "";
      }
    };
    const dv = (k: string, d: Day): V => {
      const r = d.rec, x = dayX(d);
      switch (k) {
        case "date": return dispD(d.date); case "dow": return d.dow; case "st": return stL(d.cls); case "in": return r ? hm(r.in) : ""; case "out": return r ? hm(r.out) : "";
        case "sched": return fixedStart && d.cls !== "off" ? fixedStart + " - " + fixedEnd : "";
        case "span": return x.span != null ? fH(x.span) : ""; case "net": return r ? fH(r.hours) : ""; case "brk": return x.brk != null && r && r.sessions > 1 ? fH(x.brk) : ""; case "sess": return r ? r.sessions : "";
        case "punches": return r ? r.periods.map((p) => p.in + " " + arrow + " " + (p.out || "…")).join("  ،  ") : "";
        case "late": return r && d.cls === "late" ? fmtHM(r.late, en) : ""; case "early": return r && r.early > 0 ? fmtHM(r.early, en) : "";
        case "short": { const need = d.cls === "off" || d.cls === "leave" || d.cls === "pending" ? 0 : reqFor(), got = r ? r.hours : 0; return need > got ? fH(need - got) : ""; }
        case "over": { const need = d.cls === "off" || d.cls === "leave" ? 0 : reqFor(); return r && r.hours > need ? fH(r.hours - need) : ""; }
        case "loc": return r ? r.loc : "";
        case "notes": {
          let note = "";
          if (r) {
            note = r.auto ? T("الجلسة الأخيرة أُغلقت تلقائيًا (بدون بصمة انصراف)", "Last session auto-closed") : r.noOut ? T("بدون بصمة انصراف", "No check-out") : "";
            if (r.sessions > 1) note = (note ? note + " — " : "") + r.sessions + T(" بصمات", " punches");
            if (r.notes && !r.auto) note = (note ? note + " — " : "") + r.notes;
          } else if (d.cls === "leave") note = T("إجازة معتمدة", "Approved leave");
          else if (d.cls === "absent") note = T("بدون بصمة وبدون إجازة", "No punch, no leave");
          return note;
        }
        default: return "";
      }
    };
    const rowCl = (d: Day) => (d.cls === "absent" ? "a" : d.cls === "late" ? "l" : d.cls === "leave" || d.cls === "remote" ? "v" : d.cls === "off" ? "o" : "");
    const dayRows = (s: Sum) => s.days.filter((d) => d.cls !== "off" || d.rec || opts.offDays);
    // ---- KPI ----
    const tot: Record<string, number> = {};
    Object.keys(RAW).forEach((k) => { tot[k] = rows.reduce((a, s) => a + (Number(RAW[k](s)) || 0), 0); });
    const base = tot.expected - tot.leave, attd = tot.attended, clean = rows.filter((s) => s.late === 0 && s.absent === 0 && s.present + s.remote > 0).length;
    let inS = 0, inN = 0, outS = 0, outN = 0;
    rows.forEach((s) => s.days.forEach((d) => { const x = d.rec && d.rec.in ? dayX(d) : null; if (x) { inS += x.i ?? 0; inN++; if (x.o != null) { outS += x.o; outN++; } } }));
    const KV: Record<string, V> = { emps: rows.length, ...tot, lateAvg: tot.late ? fmtHM(tot.lateTot / tot.late, en) : "0", rate: base > 0 ? r1((attd / base) * 100) + "%" : "", absRate: base > 0 ? r1((tot.absent / base) * 100) + "%" : "", punct: attd ? r1((tot.present / attd) * 100) + "%" : "", clean, avgIn: inN ? fT(inS / inN) : "", avgOut: outN ? fT(outS / outN) : "" };
    KV.lateTot = fmtHM(tot.lateTot, en);
    KV.earlyTot = fmtHM(tot.earlyTot, en);
    ["span", "net", "req", "short", "over"].forEach((k) => { KV[k] = fH(tot[k]); });
    if (has("kpi")) push({ type: "kpi", items: KPIS.filter((c) => opts.kpi.includes(c[0])).map((c): [V, string] => [KV[c[0]], L(c)]) });
    // ---- the summary ----
    if (opts.mode !== "day" && sCols.length) {
      const head = sCols.map(L), body: (V[] | { sub: string })[] = [];
      let last: string | null = null;
      rows.forEach((s, i) => {
        if (opts.byDept && deptOf(s.e) !== last) { last = deptOf(s.e); body.push({ sub: last || T("بدون قسم", "No department") }); }
        body.push(sCols.map((c) => sumVal(c[0], s, i)));
      });
      const pct = (k: string) => String(KV[k]).replace("%", "");
      const totals = opts.totals ? sCols.map((c, i): V => (i === 0 ? "" : c[0] === "name" ? T("الإجمالي", "Total") : RAW[c[0]] ? fmtCol(c[0], tot[c[0]]) : c[0] === "rate" || c[0] === "absRate" || c[0] === "punct" ? pct(c[0]) : c[0] === "lateAvg" ? KV.lateAvg : "")) : null;
      push({ type: "table", key: "sum", title: "", name: T("ملخص", "Summary"), head, rows: body, totals, nameCol: sCols.findIndex((c) => c[0] === "name"), small: sCols.length > 9, cards: sCols.length > 12 });
    }
    if (opts.mode === "day" && dayCols.length) {
      const flat: V[][] = [], cls: string[] = [];
      let n = 0;
      rows.forEach((s) => dayRows(s).forEach((d) => { n++; flat.push(dayCols.map((c) => (c[4] === "emp" ? sumVal(c[0], s, n - 1) : dv(c[0], d)))); cls.push(rowCl(d)); }));
      push({ type: "table", key: "sum", title: "", name: T("التفصيل اليومي", "Daily detail"), head: dayCols.map(L), rows: flat, rowCls: cls, nameCol: dayCols.findIndex((c) => c[0] === "name"), small: dayCols.length > 9 });
    }
    // ---- departments ----
    if (has("dept")) {
      const g: Record<string, { n: number; ex: number; at: number; p: number; l: number; a: number; v: number; m: number; lm: number; sp: number; nt: number; ov: number; sh: number }> = {};
      rows.forEach((s) => {
        const d = deptOf(s.e) || T("بدون قسم", "No dept");
        const x = (g[d] = g[d] || { n: 0, ex: 0, at: 0, p: 0, l: 0, a: 0, v: 0, m: 0, lm: 0, sp: 0, nt: 0, ov: 0, sh: 0 }), a = X(s);
        x.n++; x.ex += s.expected; x.at += a.attended; x.p += s.present; x.l += s.late; x.a += s.absent; x.v += s.leave; x.m += s.remote; x.lm += s.lateMin; x.sp += a.span; x.nt += s.hours; x.ov += a.over; x.sh += a.short;
      });
      push({
        type: "table", key: "dept", title: T("ملخص الأقسام", "Department summary"), name: T("الأقسام", "Departments"),
        head: [T("القسم", "Department"), T("موظفون", "Staff"), T("أيام الحضور", "Days attended"), T("في الموعد", "On time"), T("تأخير", "Late"), T("غياب", "Absent"), T("إجازة", "Leave"), T("عن بعد", "Remote"), T("إجمالي التأخير", "Total late"), T("الساعات", "Hours"), T("صافي", "Net"), T("إضافي", "Overtime"), T("نقص", "Shortfall"), T("نسبة الحضور %", "Attendance %")],
        rows: Object.keys(g).map((d) => { const x = g[d], b = x.ex - x.v; return [d, x.n, x.at, x.p, x.l, x.a, x.v, x.m, fmtHM(x.lm, en), fH(x.sp), fH(x.nt), fH(x.ov), fH(x.sh), b > 0 ? r1((x.at / b) * 100) : ""]; }),
        small: true,
      });
    }
    // ---- rankings ----
    if (has("rank")) {
      const N = Math.max(1, Number(opts.topN) || 5);
      const tb = (title: string, arr: Sum[], f2: (s: Sum) => V, h2: string): TableBlock => ({ type: "table", key: "rank", title, name: title.slice(0, 28), head: ["#", T("الموظف", "Employee"), T("القسم", "Department"), h2], rows: arr.slice(0, N).map((s, i) => [i + 1, nameOf(s.e), deptOf(s.e), f2(s)]) });
      push(tb(T("الأكثر تأخيرًا", "Most late"), rows.filter((s) => s.lateMin > 0).sort((a, b) => b.lateMin - a.lateMin), (s) => fmtHM(s.lateMin, en) + " (" + s.late + T(" يوم", " d") + ")", T("إجمالي التأخير", "Total late")));
      push(tb(T("الأكثر غيابًا", "Most absent"), rows.filter((s) => s.absent > 0).sort((a, b) => b.absent - a.absent), (s) => s.absent + T(" يوم", " d"), T("أيام الغياب", "Absent days")));
      push(tb(T("الأفضل التزامًا (نسبة الحضور)", "Best attendance"), rows.filter((s) => s.rate != null).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0) || a.lateMin - b.lateMin), (s) => s.rate + "%", T("نسبة الحضور", "Attendance %")));
    }
    // ---- daily company summary + weekdays ----
    const dayAgg: Record<string, { dow: string; p: number; l: number; a: number; v: number; m: number; ex: number; hrs: number }> = {};
    rows.forEach((s) => s.days.forEach((d) => {
      const x = (dayAgg[d.date] = dayAgg[d.date] || { dow: d.dow, p: 0, l: 0, a: 0, v: 0, m: 0, ex: 0, hrs: 0 });
      if (d.cls === "present") x.p++; else if (d.cls === "late") x.l++; else if (d.cls === "absent") x.a++; else if (d.cls === "leave") x.v++; else if (d.cls === "remote") x.m++;
      if (d.cls !== "off" && d.cls !== "pending") x.ex++;
      if (d.rec) x.hrs += d.rec.hours;
    }));
    const dkeys = Object.keys(dayAgg).sort().filter((k) => dayAgg[k].ex > 0 || dayAgg[k].p + dayAgg[k].l + dayAgg[k].m > 0);
    if (has("trend") && dkeys.length) {
      const mx = Math.max(1, ...dkeys.map((k) => dayAgg[k].p + dayAgg[k].l + dayAgg[k].a + dayAgg[k].v + dayAgg[k].m));
      const bar = (c: string, n: number) => '<u class="' + c + '" style="height:' + (n / mx) * 100 + '%"></u>';
      push({ type: "html", html: "<h5>" + esc(T("الملخص اليومي للمنشأة", "Daily company summary")) + '</h5><div class="ch">' + dkeys.map((k) => { const x = dayAgg[k]; return '<i title="' + dm(k) + '">' + bar("p", x.p + x.m) + bar("l", x.l) + bar("v", x.v) + bar("a", x.a) + "</i>"; }).join("") + '</div><div class="chl"><span style="color:#2e9e5b">■ ' + esc(T("حاضر", "Present")) + '</span><span style="color:#f0a800">■ ' + esc(T("متأخر", "Late")) + '</span><span style="color:#4a78d6">■ ' + esc(T("إجازة", "Leave")) + '</span><span style="color:#d64545">■ ' + esc(T("غائب", "Absent")) + "</span></div>" });
      push({
        type: "table", key: "trend", title: "", name: T("ملخص يومي", "Daily summary"),
        head: [T("التاريخ", "Date"), T("اليوم", "Day"), T("المطلوب", "Expected"), T("حاضر", "Present"), T("متأخر", "Late"), T("غائب", "Absent"), T("إجازة", "Leave"), T("عن بعد", "Remote"), T("الساعات", "Hours"), T("نسبة الحضور %", "Attendance %")],
        rows: dkeys.map((k) => { const x = dayAgg[k], b = x.ex - x.v; return [dispD(k), x.dow, x.ex, x.p, x.l, x.a, x.v, x.m, fH(x.hrs), b > 0 ? r1(((x.p + x.l + x.m) / b) * 100) : ""]; }),
      });
    }
    if (has("wday") && dkeys.length) {
      const g: Record<number, { dow: string; n: number; p: number; l: number; a: number; v: number; m: number; ex: number }> = {};
      dkeys.forEach((k) => { const x = dayAgg[k], di = new Date(k + "T00:00:00").getDay(), w = (g[di] = g[di] || { dow: x.dow, n: 0, p: 0, l: 0, a: 0, v: 0, m: 0, ex: 0 }); w.n++; w.p += x.p; w.l += x.l; w.a += x.a; w.v += x.v; w.m += x.m; w.ex += x.ex; });
      push({
        type: "table", key: "wday", title: T("تحليل أيام الأسبوع", "Weekday analysis"), name: T("أيام الأسبوع", "Weekdays"),
        head: [T("اليوم", "Day"), T("عدد الأيام", "Days"), T("حاضر", "Present"), T("متأخر", "Late"), T("غائب", "Absent"), T("إجازة", "Leave"), T("عن بعد", "Remote"), T("نسبة الغياب %", "Absence %"), T("نسبة التأخير %", "Lateness %")],
        rows: Object.keys(g).map(Number).sort((a, b) => a - b).map((di) => { const w = g[di], b = w.ex - w.v, at = w.p + w.l + w.m; return [w.dow, w.n, w.p, w.l, w.a, w.v, w.m, b > 0 ? r1((w.a / b) * 100) : "", at ? r1((w.l / at) * 100) : ""]; }),
      });
    }
    // ---- details: absence / lateness / early exit / no check-out / leaves / days off ----
    const eh = [T("الموظف", "Employee"), T("الرقم الوظيفي", "Emp. no"), T("القسم", "Department")], ev = (s: Sum): V[] => [nameOf(s.e), String(s.e.emp_no || ""), deptOf(s.e)];
    const flat = (fn: (s: Sum) => V[][]) => { const r: V[][] = []; rows.forEach((s) => fn(s).forEach((x) => r.push([...ev(s), ...x]))); return r; };
    const dwDay = (ds: string) => dayAgg[ds]?.dow ?? "";
    if (has("absentDet")) push({ type: "table", key: "absentDet", title: T("تفصيل أيام الغياب", "Absence days detail"), name: T("تفصيل الغياب", "Absences"), head: [...eh, T("التاريخ", "Date"), T("اليوم", "Day")], rows: flat((s) => X(s).absentDates.map((d) => [dispD(d), dwDay(d)])), cls: "a" });
    if (has("lateDet")) push({ type: "table", key: "lateDet", title: T("تفصيل التأخيرات", "Lateness detail"), name: T("تفصيل التأخير", "Lateness"), head: [...eh, T("التاريخ", "Date"), T("اليوم", "Day"), T("وقت الحضور", "Check-in"), T("الدوام يبدأ", "Shift start"), T("مدة التأخير", "Late by")], rows: flat((s) => X(s).lateList.map((x) => [dispD(x[0]), dwDay(x[0]), hm(x[2]), fixedStart, fmtHM(x[1], en)])), cls: "l" });
    if (has("earlyDet")) push({ type: "table", key: "earlyDet", title: T("تفصيل الخروج المبكر", "Early-exit detail"), name: T("الخروج المبكر", "Early exit"), head: [...eh, T("التاريخ", "Date"), T("اليوم", "Day"), T("وقت الانصراف", "Check-out"), T("مدة الخروج المبكر", "Early by")], rows: flat((s) => X(s).earlyList.map((x) => [dispD(x[0]), dwDay(x[0]), hm(x[2]), fmtHM(x[1], en)])) });
    if (has("noOutDet")) push({ type: "table", key: "noOutDet", title: T("أيام بدون بصمة انصراف", "Missing check-out days"), name: T("بدون انصراف", "No check-out"), head: [...eh, T("التاريخ", "Date"), T("اليوم", "Day")], rows: flat((s) => X(s).noOutList.map((d) => [dispD(d), dwDay(d)])) });
    if (has("leaveDet")) push({ type: "table", key: "leaveDet", title: T("الإجازات والعمل عن بعد", "Leave & remote periods"), name: T("الإجازات", "Leaves"), head: [...eh, T("النوع", "Type"), T("من", "From"), T("إلى", "To"), T("عدد الأيام", "Days")], rows: flat((s) => rangesOf(s).map((x) => [stL(x.t), dispD(x.from), dispD(x.to), x.n])), cls: "v" });
    if (has("offDet")) push({ type: "table", key: "offDet", title: T("العمل في أيام العطل", "Work on days off"), name: T("عمل في العطل", "Off-day work"), head: [...eh, T("التاريخ", "Date"), T("اليوم", "Day"), T("حضور", "In"), T("انصراف", "Out"), T("ساعات العمل", "Hours")], rows: flat((s) => s.days.filter((d) => d.rec && d.rec.in && d.off).map((d) => [dispD(d.date), d.dow, hm(d.rec!.in), hm(d.rec!.out), fH(d.rec!.hours)])) });
    // ---- the matrix ----
    if (has("matrix")) {
      const ds = Object.keys(dayAgg).sort();
      if (ds.length > 31) push({ type: "html", html: '<div class="n">' + esc(T("المصفوفة تُعرض لفترة لا تتجاوز 31 يومًا — قصّر الفترة.", "The matrix needs a period of 31 days or less.")) + "</div>" });
      else if (ds.length) {
        const SY: Record<Cls, string> = en ? { present: "P", late: "L", absent: "A", leave: "V", remote: "R", off: "-", pending: "·" } : { present: "ح", late: "ت", absent: "غ", leave: "إ", remote: "ب", off: "-", pending: "·" };
        const CL: Record<Cls, string> = { present: "P", late: "L", absent: "A", leave: "V", remote: "R", off: "O", pending: "O" };
        push({
          type: "html",
          excel: { name: T("المصفوفة", "Matrix"), head: [T("الموظف", "Employee"), ...ds.map(dm)], rows: rows.map((s) => { const m: Record<string, string> = {}; s.days.forEach((d) => { m[d.date] = SY[d.cls] || ""; }); return [nameOf(s.e), ...ds.map((k) => m[k] || "")]; }) },
          html: "<h5>" + esc(T("مصفوفة الحضور", "Attendance matrix")) + '</h5><table class="mx"><tr><th class="al">' + esc(T("الموظف", "Employee")) + "</th>" + ds.map((k) => "<th>" + k.slice(8) + "</th>").join("") + "</tr>" +
            rows.map((s) => { const m: Record<string, Day> = {}; s.days.forEach((d) => { m[d.date] = d; }); return '<tr><td class="al">' + esc(nameOf(s.e)) + "</td>" + ds.map((k) => { const d = m[k]; return '<td class="' + (d ? CL[d.cls] : "O") + '">' + (d ? SY[d.cls] : "") + "</td>"; }).join("") + "</tr>"; }).join("") +
            '</table><div class="lg">' + esc(en ? "P present · L late · A absent · V leave · R remote · - day off" : "ح حاضر · ت متأخر · غ غائب · إ إجازة · ب عن بعد · - عطلة") + "</div>",
        });
      }
    }
    // ---- the daily detail under each employee ----
    if (has("det") && dCols.length)
      rows.forEach((s) => push({ type: "table", key: "det", title: nameOf(s.e) + " — " + (s.e.emp_no || "") + (deptOf(s.e) ? " — " + deptOf(s.e) : ""), h4: true, name: "", head: dCols.map(L), rows: dayRows(s).map((d) => dCols.map((c) => dv(c[0], d))), rowCls: dayRows(s).map(rowCl), small: dCols.length > 9, emp: [nameOf(s.e), String(s.e.emp_no || "")] }));
    return blocks;
  };

  // ===== rendering =====
  function full(o: Res, forPdf?: boolean) {
    const dir = en ? "ltr" : "rtl", al = en ? "left" : "right", blocks = build(o), fs = Number(opts.fs) || 8.5;
    const scopeTxt = scope === "all" ? T("كل الموظفين", "All employees") : selected.length + " " + T("موظف محدد", "selected employees");
    const tbl = (b: TableBlock) =>
      '<table style="font-size:' + (b.small ? Math.max(6.5, fs - 1.5) : fs) + 'px"><tr>' + b.head.map((h) => "<th>" + esc(h) + "</th>").join("") + "</tr>" +
      b.rows.map((r, i) => ("sub" in r ? '<tr class="sub"><td colspan="' + b.head.length + '">' + esc(r.sub) + "</td></tr>" : "<tr" + (b.rowCls && b.rowCls[i] ? ' class="' + b.rowCls[i] + '"' : b.cls ? ' class="' + b.cls + '"' : "") + ">" + r.map((c, ci) => "<td" + (ci === b.nameCol ? ' style="text-align:' + al + '"' : "") + ">" + esc(c) + "</td>").join("") + "</tr>")).join("") +
      (b.totals ? '<tr class="tt">' + b.totals.map((c) => "<td>" + esc(c) + "</td>").join("") + "</tr>" : "") +
      (b.rows.length ? "" : '<tr><td colspan="' + b.head.length + '" style="color:#888">' + esc(T("لا توجد بيانات", "None")) + "</td></tr>") + "</table>";
    let b = '<div class="t">' + esc(T("تقرير الحضور والانصراف", "Attendance Report")) + '</div><div class="s">' + esc(T("من ", "From ") + dispD(o.from) + T(" إلى ", " to ") + dispD(o.to) + " — " + scopeTxt + " — " + FILTERS[o.fk][en ? "en" : "ar"]) + "</div>";
    if (opts.sect.includes("meta")) b += '<div class="mt"><span>' + esc(T("عدد الموظفين: ", "Employees: ") + o.r.length) + "</span><span>" + esc(T("أُصدر: ", "Issued: ") + dispD(ymd(o.at)) + " " + pad(o.at.getHours()) + ":" + pad(o.at.getMinutes())) + "</span></div>";
    const cardsOf = (x: TableBlock) => {
      const ni = x.nameCol ?? -1, skip = (i: number) => x.head[i] === "#" || i === ni;
      const grid = (r: V[]) => '<div class="eg">' + r.map((c, i) => (skip(i) ? "" : "<div><span>" + esc(x.head[i]) + "</span><b>" + esc(c === "" || c == null ? "—" : c) + "</b></div>")).join("") + "</div>";
      return x.rows.map((r) => ("sub" in r ? "<h5>" + esc(r.sub) + "</h5>" : '<div class="ec"><h6>' + esc((r[0] !== "" && x.head[0] === "#" ? r[0] + ". " : "") + (ni >= 0 ? r[ni] : r[0])) + "</h6>" + grid(r) + "</div>")).join("") +
        (x.totals ? '<div class="ec tt"><h6>' + esc(T("الإجمالي", "Total")) + "</h6>" + grid(x.totals) + "</div>" : "");
    };
    blocks.forEach((x) => {
      if (x.type === "kpi") b += '<div class="k" style="font-size:' + fs + 'px">' + x.items.map((i) => "<div><b>" + esc(i[0]) + "</b><span>" + esc(i[1]) + "</span></div>").join("") + "</div>";
      else if (x.type === "html") b += x.html;
      else if (x.cards) b += cardsOf(x);
      else b += (x.h4 ? "<h4>" + esc(x.title) + "</h4>" : x.title ? "<h5>" + esc(x.title) + "</h5>" : "") + tbl(x);
    });
    if (opts.sect.includes("note"))
      b += '<div class="n">' + esc(T(
        "طريقة الحساب: يوم العمل = غير الجمعة/السبت والعطلات الرسمية وبعد تاريخ المباشرة ولا يشمل اليوم الحالي. الساعات (أول حضور ← آخر انصراف) = الفرق بين أول بصمة دخول وآخر بصمة خروج في اليوم، وصافي العمل = مجموع الفترات الفعلية بدون الفواصل. الغياب = يوم عمل بدون بصمة وبدون إجازة معتمدة. أيام الحضور الفعلي = في الموعد + متأخر + عن بعد. نسبة الحضور = أيام الحضور الفعلي ÷ (أيام العمل − الإجازات). النقص والإضافي مقابل " + (Number(opts.reqH) || 0) + " ساعات يوميًا. التأخير والخروج المبكر من حساب النظام (الساعة المرنة وفترة السماح). السجلات المُقفلة تلقائيًا (بدون بصمة انصراف) لا تدخل في الساعات.",
        "Method: a working day excludes Fri/Sat, official holidays, days before the hire date and today. Hours (first in → last out) = difference between the first check-in and last check-out of the day; net = sum of actual periods without breaks. Absent = working day with no punch and no approved leave. Attended = on time + late + remote. Attendance % = attended ÷ (working days − leave). Shortfall/overtime are measured against " + (Number(opts.reqH) || 0) + " h/day. Late / early-exit come from the system. Auto-closed records are excluded from hours.",
      )) + "</div>";
    return CSS + '<div class="rp" dir="' + dir + '"' + (forPdf ? ' style="padding:7mm 11mm"' : "") + ">" + b + "</div>";
  }
  const ready = async () => { const o = await run(); if (!o) return null; if (!o.r.length) { toast(T("لا توجد بيانات", "No data"), "err"); return null; } return o; };
  const ttl = () => T("تقرير الحضور", "Attendance report");
  const fname = (o: Res, ext: string) => "attendance_" + o.from + "_to_" + o.to + "." + ext;
  async function doPrint() { const o = await ready(); if (!o) return; printDoc(ttl(), tfWrap("", "", full(o))); }
  const xlsxBlob = (o: Res) => {
    const blocks = build(o), sheets: Sheet[] = [], used: Record<string, 1> = {};
    const nm = (n: string) => { let x = String(n || "Sheet").replace(/[\\/?*[\]:]/g, " ").slice(0, 28), i = 1; while (used[x]) x = x.slice(0, 25) + " " + ++i; used[x] = 1; return x; };
    const tables = blocks.filter((x): x is TableBlock => x.type === "table");
    const kp = blocks.find((x) => x.type === "kpi");
    if (kp && kp.type === "kpi") sheets.push({ name: nm(T("الأرقام", "KPIs")), rows: [[T("البند", "Item"), T("القيمة", "Value")], ...kp.items.map((i) => [i[1], i[0]])], widths: [34, 18] });
    const det = tables.filter((x) => x.key === "det"), rk = tables.filter((x) => x.key === "rank");
    tables.filter((x) => x.key !== "det" && x.key !== "rank").forEach((x) => sheets.push({ name: nm(x.name), rows: [x.head, ...x.rows.filter((r): r is V[] => !("sub" in r)), ...(x.totals ? [x.totals] : [])], widths: x.head.map((h, i) => (i === ((x.nameCol ?? -1) >= 0 ? x.nameCol : 0) ? 26 : Math.max(11, Math.min(40, String(h).length + 4)))) }));
    if (rk.length) { const rows: V[][] = []; rk.forEach((x) => { rows.push([x.title]); rows.push(x.head); x.rows.forEach((r) => !("sub" in r) && rows.push(r)); rows.push([]); }); sheets.push({ name: nm(T("الترتيب", "Rankings")), rows, widths: [8, 26, 20, 22] }); }
    blocks.forEach((x) => { if (x.type === "html" && x.excel) sheets.push({ name: nm(x.excel.name), rows: [x.excel.head, ...x.excel.rows], widths: [26] }); });
    if (det.length) { const h0 = det[0].head, rows: V[][] = [[T("الموظف", "Employee"), T("الرقم الوظيفي", "Emp. no"), ...h0]]; det.forEach((x) => x.rows.forEach((r) => !("sub" in r) && rows.push([...(x.emp ?? []), ...r]))); sheets.push({ name: nm(T("تفصيلي", "Detail")), rows, widths: [26, 12, ...h0.map(() => 14)] }); }
    return buildXlsx(sheets, { rtl: !en });
  };
  async function doXls(o0?: Res) { const o = o0 ?? (await ready()); if (!o) return; const blob = xlsxBlob(o); saveBlob({ blob, name: fname(o, "xlsx"), mime: blob.type }); }
  async function doPdf(o0?: Res, sealIt = false) {
    const o = o0 ?? (await ready());
    if (!o) return;
    setBusy("pdf");
    try {
      let overlay: string | undefined;
      if (sealIt) {
        // the design's sealForReport: the studio opens on the report itself, page 1 gets the layer
        const a = await askSeal(previewDoc(full(o, true), en ? "ltr" : "rtl"), ttl());
        if (a === null) {
          setBusy("");
          return;
        }
        if (a !== "plain") overlay = a.overlay;
      }
      const blob = await htmlPdfBlob(full(o, true), { landscape: (opts.mode === "day" ? opts.day : opts.sum).length > 9, overlay });
      saveBlob({ blob, name: fname(o, "pdf"), mime: "application/pdf" });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    } finally {
      setBusy("");
    }
  }
  function doDoc(o: Res) {
    const h = '<html dir="' + (en ? "ltr" : "rtl") + '"><head><meta charset="utf-8"><title>' + esc(ttl()) + "</title></head><body>" + full(o) + "</body></html>";
    saveBlob({ blob: new Blob(["﻿", h], { type: "application/msword" }), name: fname(o, "doc"), mime: "application/msword" });
  }
  async function doSend() { const o = await ready(); if (o) setXd(o); }

  const ok = !!res && res.r.length > 0 && fields.length > 0;
  const byK = Object.fromEntries(CAT.map((c) => [c[0], c])), cols = fields.map((k) => byK[k]).filter(Boolean);
  const GICO: Record<string, string> = { emp: "ti-user", days: "ti-calendar-stats", time: "ti-clock", hours: "ti-hourglass", rate: "ti-percentage", dates: "ti-calendar-event", day: "ti-calendar-event" };
  const chip = (grp: "sum" | "day" | "sect" | "kpi", c: { 0: string; 1: string; 2: string }) => (
    <label key={c[0]} className={"cr-chip" + (opts[grp].includes(c[0]) ? " on" : "")}><input type="checkbox" data-col={grp + ":" + c[0]} checked={opts[grp].includes(c[0])} onChange={() => tog(grp, c[0])} />{L(c)}</label>
  );
  const radio = (on: boolean, label: string, fn: () => void, id: string) => <label className={"cr-radio" + (on ? " on" : "")}><input type="radio" id={id} checked={on} onChange={fn} /> {label}</label>;
  const waits = (id: "exportEmail" | "attSchedule") => (en ? FEATURES[id].waits?.en : FEATURES[id].waits?.ar);

  return (
    <div className="card crx" id="ariba117AttCard" style={{ marginTop: 12 }}>
      <div className="ch">
        <div className="ct"><i className="ti ti-report-analytics" /> <span>{T("منشئ تقرير الحضور والانصراف", "Attendance report builder")}</span></div>
        <span style={{ fontSize: 11, color: "var(--mu)" }}>{T("اختر الفترة والأعمدة والموظفين ثم اطبع أو صدّر PDF أو Excel أو Word أو أرسله بالبريد الإلكتروني — مع الختم والتوقيع", "Pick period, columns & employees, then print / export / email — with stamp & signature")}</span>
      </div>
      <div className="cr-wrap">
        <div className="cr-side">
          <div className="cr-sec">
            <St n="1" t={T("الفترة ونوع التقرير", "Period & report type")} sub={T("من تاريخ إلى تاريخ، وصف لكل موظف أو لكل يوم", "Date range; one row per employee or per day")} />
            <div className="cr-row">{radio(opts.mode !== "day", T("ملخص (صف لكل موظف)", "Summary (row per employee)"), () => setOpts({ ...opts, mode: "sum" }), "A117ModeSum")}{radio(opts.mode === "day", T("تفصيل يومي (صف لكل يوم وكل البصمات)", "Daily detail (row per day, all punches)"), () => setOpts({ ...opts, mode: "day" }), "A117ModeDay")}</div>
            <div className="cr-row">
              <label style={{ fontSize: 11 }}>{T("من", "From")} <DateField value={from} onChange={(v) => setFrom(v)} /></label>
              <label style={{ fontSize: 11 }}>{T("إلى", "To")} <DateField value={to} onChange={(v) => setTo(v)} /></label>
            </div>
            <div className="cr-pre">{[["d1", T("اليوم", "Today")], ["d7", T("آخر 7 أيام", "Last 7 days")], ["d30", T("آخر 30 يومًا", "Last 30 days")], ["m0", T("هذا الشهر", "This month")], ["m1", T("الشهر الماضي", "Last month")], ["y0", T("هذه السنة", "This year")]].map(([id, l]) => <button type="button" key={id} className="cr-pbtn" onClick={() => quick(id)}>{l}</button>)}</div>
            <div className="cr-row">
              <select id="A117Flt" value={fk} onChange={(e) => setFk(e.target.value)}>{Object.keys(FILTERS).map((x) => <option key={x} value={x}>{FILTERS[x][en ? "en" : "ar"]}</option>)}</select>
              <label style={{ fontSize: 11 }}>{T("الحد الأدنى للأيام", "Min. days")} <input type="number" id="A117N" min="1" style={{ width: 60 }} value={minN} onChange={(e) => setMinN(e.target.value)} /></label>
              <select id="A117Sort" value={opts.sort} onChange={(e) => setOpts({ ...opts, sort: e.target.value })}>{SORTS.map((x) => <option key={x[0]} value={x[0]}>{T("ترتيب: ", "Sort: ") + (en ? x[2] : x[1])}</option>)}</select>
            </div>
          </div>
          <div className="cr-sec">
            <St n="2" t={T("اختر الأعمدة", "Choose columns")} sub={T("ابدأ بقالب جاهز أو اختر بنفسك", "Start from a preset or pick your own")}
              right={<><span className="b bb">{cols.length}</span><button type="button" id="A117ColsAll" className="btn bsm" onClick={() => setOpts({ ...opts, [key]: CAT.map((c) => c[0]) })}>{T("الكل", "All")}</button><button type="button" className="btn bsm" onClick={() => setOpts({ ...opts, [key]: [] })}>{T("مسح", "None")}</button></>} />
            <div className="cr-pre">
              {PRESETS.filter((p) => p[0] === key).map((p) => <button type="button" key={p[1]} className="cr-pbtn" data-preset={p[1]} onClick={() => applyPreset(p)}>{en ? p[2] : p[1]}</button>)}
              {tpls.map((t) => <span key={t.n} className="cr-pbtn cr-tpl"><button type="button" onClick={() => setOpts({ ...opts, ...t.o })}><i className="ti ti-bookmark" /> {t.n}</button><button type="button" title={T("حذف القالب", "Delete")} onClick={() => delTpl(t.n)}>×</button></span>)}
            </div>
            <div className="cr-groups">
              {Object.keys(GR).map((g) => {
                const items = CAT.filter((c) => c[4] === g), n = items.filter((c) => fields.includes(c[0])).length;
                return (
                  <div key={g} className="cr-g">
                    <div className="cr-gh"><i className={"ti " + (GICO[g] || "ti-list")} /> <b>{GR[g][en ? 1 : 0]}</b><span className="cr-gc">{n}/{items.length}</span>
                      <button type="button" className="cr-gl" onClick={() => grpAll(g, n < items.length)}>{n < items.length ? T("تحديد الكل", "All") : T("إلغاء", "None")}</button></div>
                    <div className="cr-chips">{items.map((c) => chip(key, c))}</div>
                  </div>
                );
              })}
            </div>
            {cols.length > 0 && (
              <div className="cr-order"><div className="cr-ot">{T("ترتيب الأعمدة في التقرير", "Column order")}</div>
                <div className="cr-ol">{cols.map((c, i) => <span key={c[0]} className="cr-oi"><button type="button" disabled={i === 0} onClick={() => move(i, -1)} title={T("تقديم", "Earlier")}>›</button><b>{i + 1}.</b> {L(c)}<button type="button" disabled={i === cols.length - 1} onClick={() => move(i, 1)} title={T("تأخير", "Later")}>‹</button></span>)}</div></div>
            )}
            <div className="cr-save"><input placeholder={T("احفظ هذه الاختيارات كقالب باسم…", "Save as template…")} value={tname} onChange={(e) => setTname(e.target.value)} /><button type="button" className="btn bsm" disabled={!tname.trim()} onClick={saveTpl}><i className="ti ti-device-floppy" /> {T("حفظ", "Save")}</button></div>
          </div>
          <div className="cr-sec">
            <St n="3" t={T("اختر الموظفين", "Choose employees")} sub={T("الكل أو تصفية بجهة العمل/القسم أو اختيار يدوي", "All, filtered, or hand-picked")} />
            <div className="cr-row">
              {radio(scope === "all", T("كل الموظفين", "All employees"), () => setScope("all"), "A117ScAll")}{radio(scope === "pick", T("موظف / موظفون محددون", "Selected employees"), () => setScope("pick"), "A117ScPick")}
              <label className={"cr-radio" + (inclTerm ? " on" : "")}><input type="checkbox" checked={inclTerm} onChange={(e) => setInclTerm(e.target.checked)} /> {T("مع المنتهية خدمتهم", "Include terminated")}</label>
            </div>
            <div className="cr-row">
              <select value={fEmployer} onChange={(e) => setFEmployer(e.target.value)}><option value="">{T("كل جهات العمل", "All employers")}</option>{employers.map((x) => <option key={x}>{x}</option>)}</select>
              <select value={fDept} onChange={(e) => setFDept(e.target.value)}><option value="">{T("كل الأقسام", "All departments")}</option>{depts.map((x) => <option key={x}>{x}</option>)}</select>
            </div>
            {scope === "pick" && (
              <div style={{ marginTop: 8 }}>
                <div className="cr-row"><input placeholder={T("ابحث بالاسم أو الرقم…", "Search…")} value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
                  <button type="button" className="btn bsm" onClick={() => setSel((m) => { const n = { ...m }; list.forEach((e) => { n[e.id] = true; }); return n; })}>{T("تحديد الظاهر", "Select shown")}</button><button type="button" className="btn bsm" onClick={() => setSel({})}>{T("مسح", "Clear")}</button></div>
                <div className="cr-emps">{list.map((e) => <label key={e.id}><input type="checkbox" data-emp={e.id} checked={!!sel[e.id]} onChange={() => setSel((m) => ({ ...m, [e.id]: !m[e.id] }))} /> {nameOf(e)} <span>#{e.emp_no || e.id}</span></label>)}</div>
              </div>
            )}
          </div>
          <div className="cr-sec">
            <St n="4" t={T("إضافات التقرير (اختيارية)", "Report extras (optional)")} sub={T("بطاقات الأرقام، الأقسام، الترتيب، الرسوم، تفصيل الغياب والتأخير…", "KPI cards, departments, rankings, charts, absence/lateness detail…")}
              right={<><button type="button" className="btn bsm" onClick={() => setOpts({ ...opts, sect: ALLK(SECT) })}>{T("الكل", "All")}</button><button type="button" className="btn bsm" onClick={() => setOpts({ ...opts, sect: [] })}>{T("مسح", "None")}</button></>} />
            <div className="cr-g"><div className="cr-gh"><i className="ti ti-layout-list" /> <b>{T("أقسام إضافية", "Extra sections")}</b></div><div className="cr-chips">{SECT.map((c) => chip("sect", c))}</div></div>
            {opts.sect.includes("kpi") && (
              <div className="cr-g" style={{ marginTop: 8 }}>
                <div className="cr-gh"><i className="ti ti-123" /> <b>{T("بطاقات الأرقام الإجمالية", "KPI cards")}</b><span className="cr-gc">{opts.kpi.length}/{KPIS.length}</span>
                  <button type="button" className="cr-gl" onClick={() => setOpts({ ...opts, kpi: opts.kpi.length < KPIS.length ? ALLK(KPIS) : [] })}>{opts.kpi.length < KPIS.length ? T("تحديد الكل", "All") : T("إلغاء", "None")}</button></div>
                <div className="cr-chips">{KPIS.map((c) => chip("kpi", c))}</div>
              </div>
            )}
            <div className="cr-row" style={{ marginTop: 10, fontSize: 12 }}>
              <label className={"cr-radio" + (opts.totals ? " on" : "")}><input type="checkbox" id="A117Tot" checked={opts.totals} onChange={(e) => setOpts({ ...opts, totals: e.target.checked })} /> {T("صف الإجمالي", "Totals row")}</label>
              <label className={"cr-radio" + (opts.byDept ? " on" : "")}><input type="checkbox" id="A117Grp" checked={opts.byDept} onChange={(e) => setOpts({ ...opts, byDept: e.target.checked })} /> {T("تجميع حسب القسم", "Group by department")}</label>
              <label className={"cr-radio" + (opts.offDays ? " on" : "")}><input type="checkbox" id="A117Off" checked={opts.offDays} onChange={(e) => setOpts({ ...opts, offDays: e.target.checked })} /> {T("إظهار أيام العطلة", "Show days off")}</label>
            </div>
            <div className="cr-row" style={{ fontSize: 12 }}>
              <label>{T("ساعات الدوام اليومية", "Daily hours")} <input type="number" id="A117Req" min="0" max="24" step="0.5" style={{ width: 64 }} value={opts.reqH} onChange={(e) => setOpts({ ...opts, reqH: e.target.value })} /></label>
              <label>{T("أسماء الترتيب", "Ranking size")} <input type="number" min="1" max="50" style={{ width: 56 }} value={opts.topN} onChange={(e) => setOpts({ ...opts, topN: e.target.value })} /></label>
              <label>{T("الخط", "Font")} <select value={opts.fs} onChange={(e) => setOpts({ ...opts, fs: Number(e.target.value) })}><option value="7.5">{T("صغير", "Small")}</option><option value="8.5">{T("متوسط", "Medium")}</option><option value="10">{T("كبير", "Large")}</option></select></label>
            </div>
            <div style={{ fontSize: 11, color: "var(--mu)" }}>{T("الساعات المطلوبة تُؤخذ من الرقم أعلاه (يبدأ بمدة الدوام في إعدادات الحضور). جدول الدوام الرسمي/رمضان غير متاح بعد: يُفتح بعد ", "Required hours come from the number above (it starts at the shift length in the attendance settings). The official / Ramadan schedule is not available yet: it opens after ") + waits("attSchedule")}</div>
          </div>
        </div>
        <div className="cr-main">
          <div className="cr-bar">
            <div><b>{T("المعاينة", "Preview")}</b><span className="cr-cnt">{res ? res.r.length : 0} {T("موظف", "employees")} × {cols.length} {T("عمود", "columns")}</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <select id="A117Lang" title="Language / اللغة" value={en ? "en" : "ar"} onChange={(ev) => setRl(ev.target.value)} style={{ fontSize: 12 }}><option value="ar">العربية</option><option value="en">English</option></select>
              <button type="button" className="btn bpl bsm" id="A117Run" disabled={busy === "run"} onClick={() => void run()}><i className="ti ti-refresh" /> {T("تحديث", "Refresh")}</button>
              <button type="button" className="btn bsm" id="A117Print" onClick={doPrint}><i className="ti ti-printer" /> {T("طباعة", "Print")}</button>
              <button type="button" className="btn bsm" id="A117Pdf" disabled={!!busy} onClick={() => void doPdf()}><i className="ti ti-file-type-pdf" /> PDF</button>
              <button type="button" className="btn bsm" id="A117Xls" onClick={() => void doXls()}><i className="ti ti-file-spreadsheet" /> Excel</button>
              <button type="button" className="btn bpl" id="A117Send" onClick={doSend}><i className="ti ti-file-export" /> {T("تصدير / إرسال (PDF · Excel · Word)", "Export / Email (PDF · Excel · Word)")}</button>
            </div>
          </div>
          <div id="A117Out">
            {busy === "run" && <div className="cr-empty">{T("جارٍ تحميل الحضور من الخادم…", "Loading attendance…")}</div>}
            {msg && <div style={{ padding: 14, color: "var(--rd)" }}>{msg}</div>}
            {res && busy !== "run" && !res.r.length && <div className="cr-empty"><i className="ti ti-table-options" /><div>{T("لا توجد نتائج مطابقة للفلتر", "No matching results")}</div></div>}
            {res && busy !== "run" && res.r.length > 0 && !fields.length && <div className="cr-empty"><i className="ti ti-table-options" /><div>{T("اختر عموداً واحداً على الأقل لتظهر المعاينة", "Pick at least one column to see the preview")}</div></div>}
            {ok && busy !== "run" && <iframe id="A117Prev" title="preview" sandbox="" srcDoc={'<!doctype html><html dir="' + (en ? "ltr" : "rtl") + '"><head><meta charset="utf-8"></head><body style="margin:8px">' + full(res!) + "</body></html>"} style={{ width: "100%", height: 700, border: 0, background: "#fff" }} />}
          </div>
        </div>
      </div>
      {xd && (
        <Modal title={T("تصدير التقرير", "Export the report") + " — " + dispD(xd.from) + " → " + dispD(xd.to)} width={420} onClose={() => setXd(null)}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
            <button type="button" className="btn bpl" disabled={!!busy} onClick={() => void doPdf(xd, seal)}><i className="ti ti-file-type-pdf" /> PDF</button>
            <button type="button" className="btn bpl" onClick={() => void doXls(xd)}><i className="ti ti-file-spreadsheet" /> Excel</button>
            <button type="button" className="btn bpl" onClick={() => doDoc(xd)}><i className="ti ti-file-word" /> Word</button>
            <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12, cursor: "pointer" }}>
              <input type="checkbox" id="XD_SEAL" checked={seal} onChange={(e) => setSeal(e.target.checked)} /> {T("ختم / توقيع (قابل للتحريك)", "Stamp / signature (movable)")}
            </label>
          </div>
          <div className="al alb" style={{ marginBottom: 6 }}><i className="ti ti-mail-off" aria-hidden /><div><strong>{T("الإرسال بالبريد الإلكتروني غير متاح بعد", "E-mailing is not available yet")}</strong><div>{T("يُفتح بعد ", "Opens after ") + waits("exportEmail")}</div></div></div>
        </Modal>
      )}
      {sealNode}
    </div>
  );
}
