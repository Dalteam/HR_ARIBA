/* eslint-disable @typescript-eslint/no-explicit-any */
// Payroll table port of frontend/legacy/hr-portal/js/payroll/107-ariba-v119-payroll.js
// (the parts that wrap buildPayrollRows / recalcRow / renderPayroll) plus the mapping from the
// backend salary-basis rows. The arithmetic itself lives in lib/calc/payx.ts (verbatim).

import type { GosiRates, SalaryBasisRow } from "../salary";
import { PAYX } from "./payx";

export interface MonthCtx {
  y: number;
  m: number; // 1..12
  days: number;
  start: Date;
  end: Date;
}

export interface PayRow {
  id: string;
  idx: number;
  empNo: string;
  name: string;
  nat: string;
  employer: string;
  job: string;
  isSaudi: boolean;
  wpsType: string;
  insSystem: string;
  currency: string;
  exchRate: number;
  sal: number;
  hou: number;
  tra: number;
  prj: number;
  oth: number;
  tot: number;
  days: number;
  workDays: number;
  insDays: number;
  salByDays: number;
  houPay: number;
  traPay: number;
  prjPay: number;
  othPay: number;
  allIn: number;
  overtime: number;
  leaveComp: number;
  otherAllow: number;
  totalDue: number;
  loanDeduct: number;
  insEmp: number;
  insBase: number;
  otherDeduct: number;
  totalDeduct: number;
  net: number;
  netSAR: number;
  insEr: number;
  insStatus: string;
  eos: number;
  yearsOfService: number;
  eosLaw: string;
  eosLawAmt: number;
  payMethod: string;
  iban: string;
  notes: string;
  edited: boolean;
  addedTerminated?: boolean;
  manualEdits: Record<string, boolean>;
  join: string;
  dob: string;
  contractMonths: number | null;
  leaveDays: number;
  reason: string;
  lastDay: string;
  usedManual: number | null;
  otHours: number;
  otAmount: number;
  leaveManual: number;
  allInManual: number | null;
  noInsDeduct: boolean;
  contractEnd: string;
  K: number | null;
  N: number | null;
  O: number;
  P: number | null;
  svcY: number;
  svcM: number;
  svcD: number;
  costY: number;
  costM: number;
  costD: number;
  eosAmt: number;
  usedAuto: number;
}

export const MONTHS_AR = [
  "",
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export const CURRENCY_LABEL: Record<string, string> = {
  SAR: "ريال سعودي",
  USD: "دولار",
  EUR: "يورو",
  EGP: "جنيه مصري",
};

const PAYMETHOD_AR: Record<string, string> = {
  mudad: "مدد",
  bank_transfer: "تحويل",
  international_transfer: "تحويل دولي",
  cash: "نقد",
};

export const isLocalCurrency = (c: string) => c === "SAR";
export const currencyLabel = (c: string) => CURRENCY_LABEL[c] ?? (c || "");

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const money = (n: unknown): string =>
  num(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isBlank = (v: unknown): boolean => v === null || v === undefined || v === "";
export const p2 = (n: number) => (n < 10 ? "0" : "") + n;
export const isoDate = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const dmy = (s: string) => {
  const a = String(s || "").slice(0, 10).split("-");
  return a.length === 3 && a[0] ? `${a[2]}/${a[1]}/${a[0]}` : "";
};

/* V130 exemption — mirrors backend/app/services/gosi.py `exempt_kind`. */
export function exemptKind(e: SalaryBasisRow | undefined): string {
  if (!e) return "";
  const w = e.wps_type;
  if (w === "consultant" || w === "tamheer" || w === "trainee") return w;
  if (w !== "wps") return w;
  if (e.category === "consultant") return "consultant";
  if (e.category === "tamheer") return "tamheer";
  if (e.category === "training") return "trainee";
  const job = e.job_title || "";
  const dep = e.department || "";
  const emp = e.workplace || "";
  if (/تمهير/.test(emp) || /تمهير/.test(job) || /تمهير/.test(dep)) return "tamheer";
  if (/استشاري|مستشار|استشاريه|استشارية/.test(job)) return "consultant";
  if (/متدرب|تدريب|trainee|intern/i.test(job) || dep.trim() === "تدريب" || /تدريب/.test(emp)) return "trainee";
  return "";
}

export function insDefault(e: SalaryBasisRow | undefined): string {
  if (!e) return "لا يطابق";
  if (exemptKind(e)) return "غير خاضع";
  if (e.category === "consultant" || /استشاري/.test(e.job_title || "")) return "لا يطبق";
  if (!e.is_saudi) return "غير سعودي";
  if (e.wps_type !== "wps") return "لا يطبق";
  return e.gosi_system === "matching" ? "يطابق" : "لا يطابق";
}

export function reasonFromEmp(e: SalaryBasisRow): string {
  const r = PAYX.findReason(e.termination_reason ?? "");
  if (r) return r.k;
  switch (e.termination_article) {
    case "art_80":
      return "art80";
    case "art_85":
      return "resign";
    case "art_74":
      return "agree";
    case "art_77":
    case "art_84":
      return "arb77";
    case "art_74_retirement":
    case "art_74_death":
      return "retire";
    case "art_75":
      return "art81";
    default:
      return "";
  }
}

export function defaultInsDays(r: PayRow, _e: SalaryBasisRow | undefined, m: MonthCtx): number {
  const days = m.days;
  let st = 1;
  let en = days;
  const jn = r.join ? new Date(`${r.join}T00:00:00`) : null;
  const ld = r.lastDay && PAYX.findReason(r.reason) ? new Date(`${r.lastDay}T00:00:00`) : null;
  if (jn && jn > m.end) return 0;
  if (jn && jn >= m.start) st = jn.getDate();
  if (ld) {
    if (ld < m.start) return 0;
    if (ld <= m.end) en = ld.getDate();
  }
  return Math.max(0, Math.min(days, en - st + 1));
}

function ageOn(birth: string | null, on: string): number {
  if (!birth) return 30; // prototype default when the birth date is missing
  const [by, bm, bd] = birth.slice(0, 10).split("-").map(Number);
  const [oy, om, od] = on.slice(0, 10).split("-").map(Number);
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age--;
  return age;
}

/** GOSI for a full month (31/31), mirroring the legacy `calcIns(e, 31, 31)` for the payslip fallback. */
export function calcEmployeeGosi(
  e: SalaryBasisRow,
  rates: GosiRates,
  on: string,
): { base: number; employee: number; employer: number } {
  if (exemptKind(e)) return { base: 0, employee: 0, employer: 0 };
  const cap = rates.cap;
  const basic = num(e.basic_salary);
  const housing = num(e.housing_allowance);
  const base = Math.min((cap / 31) * 31, basic + housing);
  const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
  if (e.gosi_system === "non_saudi") {
    return { base: r2(base), employee: 0, employer: r2(base * rates.nonSaudiEr) };
  }
  const senior = ageOn(e.birth_date, on) >= rates.ageThr;
  const matching = e.gosi_system === "matching";
  const empRate = matching
    ? senior
      ? rates.matchEmp55
      : rates.matchEmp
    : senior
      ? rates.noMatchEmp55
      : rates.noMatchEmp;
  const erRate = matching
    ? senior
      ? rates.matchEr55
      : rates.matchEr
    : senior
      ? rates.noMatchEr55
      : rates.noMatchEr;
  return { base: r2(base), employee: r2(base * empRate), employer: r2(base * erRate) };
}

export function baseRow(e: SalaryBasisRow, days: number): PayRow {
  const sal = num(e.basic_salary);
  const hou = num(e.housing_allowance);
  const tra = num(e.transport_allowance);
  const prj = num(e.project_allowance);
  const oth = num(e.other_allowances);
  return {
    id: String(e.id),
    idx: 0,
    empNo: e.emp_no,
    name: e.name_ar,
    nat: e.nationality ?? "",
    employer: e.workplace ?? "",
    job: e.job_title ?? "",
    isSaudi: e.is_saudi,
    wpsType: e.wps_type,
    insSystem: e.gosi_system === "matching" ? "new" : "old",
    currency: e.currency,
    exchRate: num(e.exchange_rate) || 1,
    sal,
    hou,
    tra,
    prj,
    oth,
    tot: Math.round((sal + hou + tra + prj + oth) * 100) / 100,
    days,
    workDays: days,
    insDays: days,
    salByDays: 0,
    houPay: 0,
    traPay: 0,
    prjPay: 0,
    othPay: 0,
    allIn: 0,
    overtime: 0,
    leaveComp: 0,
    otherAllow: 0,
    totalDue: 0,
    loanDeduct: 0,
    insEmp: 0,
    insBase: 0,
    otherDeduct: 0,
    totalDeduct: 0,
    net: 0,
    netSAR: 0,
    insEr: 0,
    insStatus: "",
    eos: 0,
    yearsOfService: 0,
    eosLaw: "",
    eosLawAmt: 0,
    payMethod: PAYMETHOD_AR[e.payment_method] ?? "مدد",
    iban: e.iban ?? "",
    notes: "",
    edited: false,
    manualEdits: {},
    join: "",
    dob: "",
    contractMonths: null,
    leaveDays: e.annual_leave_days || 21,
    reason: "",
    lastDay: "",
    usedManual: null,
    otHours: 0,
    otAmount: num(e.extra_allowance),
    leaveManual: 0,
    allInManual: null,
    noInsDeduct: false,
    contractEnd: "",
    K: null,
    N: null,
    O: 0,
    P: null,
    svcY: 0,
    svcM: 0,
    svcD: 0,
    costY: 0,
    costM: 0,
    costD: 0,
    eosAmt: 0,
    usedAuto: 0,
  };
}

/** Legacy `addPayRow`: a blank, fully editable row. */
export function blankRow(days: number): PayRow {
  const r = baseRow(
    {
      id: "",
      emp_no: "",
      name_ar: "موظف جديد",
      workplace: "",
      department: "",
      job_title: "",
      nationality: "",
      is_saudi: false,
      birth_date: null,
      category: "active",
      wps_type: "wps",
      gosi_system: "matching",
      join_date: null,
      contract_duration_months: null,
      contract_end_date: null,
      annual_leave_days: 21,
      basic_salary: "0",
      housing_allowance: "0",
      transport_allowance: "0",
      project_allowance: "0",
      other_allowances: "0",
      extra_allowance: "0",
      other_deductions: "0",
      currency: "SAR",
      exchange_rate: "1",
      payment_method: "mudad",
      bank_name: null,
      iban: null,
      exclude_from_payroll: false,
      exclude_from_eos: false,
      is_terminated: false,
      termination_date: null,
      termination_article: null,
      termination_reason: null,
    } as SalaryBasisRow,
    days,
  );
  r.id = `new_${Date.now()}`;
  r.edited = true;
  r.insStatus = "لا يطبق";
  return r;
}

const MANUAL = [
  "insDays",
  "workDays",
  "days",
  "otHours",
  "otAmount",
  "leaveManual",
  "otherAllow",
  "loanDeduct",
  "otherDeduct",
  "payMethod",
  "notes",
  "reason",
  "lastDay",
  "usedManual",
  "allInManual",
  "noInsDeduct",
  "insStatus",
  "prj",
  "oth",
  "exchRate",
  "leaveDays",
  "manualEdits",
  "edited",
];

export function enrich(r: PayRow, e: SalaryBasisRow, prev?: PayRow): PayRow {
  r.join = (e.join_date ?? "").slice(0, 10);
  r.dob = (e.birth_date ?? "").slice(0, 10);
  r.contractMonths = e.contract_duration_months ?? null;
  r.leaveDays = e.annual_leave_days || 21;
  r.nat = r.nat || e.nationality || "";
  r.isSaudi = e.is_saudi;
  const isT = e.is_terminated;
  r.reason = isT ? reasonFromEmp(e) : "";
  r.lastDay = isT ? (e.termination_date ?? "").slice(0, 10) : "";
  r.usedManual = null;
  r.otHours = 0;
  r.otAmount = num(e.extra_allowance);
  r.leaveManual = 0;
  r.allInManual = null;
  r.noInsDeduct = false;
  r.insStatus = insDefault(e);
  const FOLLOW_EMP = new Set(["prj", "oth", "exchRate", "insStatus", "leaveDays", "otAmount", "workDays"]);
  if (prev) {
    for (const k of MANUAL) {
      const pv = (prev as any)[k];
      if (pv === undefined) continue;
      if (FOLLOW_EMP.has(k) && !(prev.manualEdits?.[k])) continue;
      (r as any)[k] = pv;
    }
  }
  return r;
}

/** Legacy `empDefault`: the employee-data value a manual field returns to on ↺. */
export function empDefault(field: string, e: SalaryBasisRow | undefined): number | string | undefined {
  if (!e) return undefined;
  if (field === "insStatus") return insDefault(e);
  if (field === "otAmount") return num(e.extra_allowance);
  if (field === "prj") return num(e.project_allowance);
  if (field === "oth") return num(e.other_allowances);
  if (field === "exchRate") return num(e.exchange_rate) || 1;
  if (field === "leaveDays") return e.annual_leave_days || 21;
  return undefined;
}

export const NUMF: Record<string, boolean> = {
  insDays: true,
  days: true,
  workDays: true,
  otHours: true,
  otAmount: true,
  prj: true,
  oth: true,
  loanDeduct: true,
  otherDeduct: true,
  exchRate: true,
  leaveDays: true,
  otherAllow: true,
  leaveManual: true,
};

export function autoWork(r: PayRow, m: MonthCtx): void {
  if (r.lastDay && PAYX.findReason(r.reason) && !(r.manualEdits?.workDays)) {
    const d = new Date(`${r.lastDay}T00:00:00`);
    if (d >= m.start && d <= m.end) r.workDays = d.getDate();
    else if (d < m.start) r.workDays = 0;
  }
}

/** "<employee id>|<yyyy-mm-dd>" → days used (legacy `usedThrough`). */
export const USED_CACHE = new Map<string, number>();

function reasonKey(r: PayRow): string {
  return (PAYX.findReason(r.reason) || {}).k || "";
}

/** Legacy endForUsed: last day, else EDATE(join, contract months), else the month end. */
export function usedEnd(r: PayRow, m: MonthCtx): string {
  if (r.lastDay) return String(r.lastDay).slice(0, 10);
  const jn = r.join ? new Date(r.join + "T00:00:00") : null;
  const d = jn && r.contractMonths != null && (r.contractMonths as unknown) !== "" ? PAYX.edate(jn, Number(r.contractMonths)) : m.end;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const usedKey = (r: PayRow, m: MonthCtx) => `${r.id}|${usedEnd(r, m)}`;

/** Rows whose «ما تم استحقاقه» still needs the backend figure. */
export function usedQueries(rows: PayRow[], m: MonthCtx): { employee_id: string; end: string }[] {
  return rows
    .filter((r) => r.id && reasonKey(r) && !USED_CACHE.has(usedKey(r, m)))
    .map((r) => ({ employee_id: String(r.id), end: usedEnd(r, m) }));
}

export function recalc(r: PayRow, e: SalaryBasisRow | undefined, m: MonthCtx, rates: GosiRates): PayRow {
  const days = m.days;
  r.days = days;
  const manualW = !!(r.manualEdits?.workDays);
  if (!manualW || r.workDays === undefined || r.workDays === null || (r.workDays as any) === "")
    r.workDays = defaultInsDays(r, e, m);
  const U = Math.max(0, Math.min(days, num(r.workDays)));
  r.workDays = U;
  const sal = num(r.sal);
  const hou = num(r.hou);
  const tra = num(r.tra);
  const manualIns = !!(r.manualEdits?.insDays);
  if (!manualIns || r.insDays === undefined || r.insDays === null || (r.insDays as any) === "")
    r.insDays = defaultInsDays(r, e, m);
  r.insDays = Math.max(0, Math.min(days, num(r.insDays)));
  // Legacy usedThrough: annual leave taken up to the last day (or the contract end / month end), from the backend
  // leave engine (filled into USED_CACHE by the payroll page before recalculating).
  const usedAuto = reasonKey(r) ? USED_CACHE.get(usedKey(r, m)) ?? 0 : 0;
  r.usedAuto = usedAuto;
  const exempt = !!exemptKind(e);
  const manInsStatus = !!(r.manualEdits?.insStatus);
  const noIns = exempt && !(manInsStatus && !/لا يطبق|غير خاضع/.test(String(r.insStatus ?? "")));
  const o = PAYX.compute({
    basic: sal,
    houRate: sal > 0 ? hou / sal : 0,
    traRate: sal > 0 ? tra / sal : 0,
    prj: r.prj,
    oth: r.oth,
    allIn: isBlank(r.allInManual) ? null : r.allInManual,
    days,
    work: U,
    insDays: r.insDays,
    otHours: r.otHours,
    otAmount: r.otAmount,
    advances: r.loanDeduct,
    otherDed: r.otherDeduct,
    fx: r.exchRate,
    insStatus: r.insStatus,
    saudi: !!(r.isSaudi || PAYX.isSaudiNat(r.nat)),
    trainee: PAYX.isTrainee(r.employer),
    nat: r.nat,
    employer: r.employer,
    dob: r.dob || e?.birth_date || "",
    join: r.join,
    lastDay: r.lastDay || null,
    contractMonths: r.contractMonths,
    reason: r.reason,
    leaveDays: r.leaveDays || 21,
    used: isBlank(r.usedManual) ? null : r.usedManual,
    usedAuto,
    noIns,
    leaveManual: r.leaveManual,
    noInsDeduct: r.noInsDeduct,
    asOf: m.end,
    rates,
  }) as Record<string, any>;
  r.salByDays = o.V;
  r.houPay = o.Y;
  r.traPay = o.Z;
  r.prjPay = o.AA;
  r.othPay = o.AB;
  r.allIn = o.T;
  r.overtime = o.X;
  r.contractEnd = o.I;
  r.K = o.K;
  r.N = o.N;
  r.O = o.O;
  r.P = o.P;
  r.leaveComp = o.AC;
  r.svcY = o.AD;
  r.svcM = o.AE;
  r.svcD = o.AF;
  r.costY = o.AG;
  r.costM = o.AH;
  r.costD = o.AI;
  r.eos = o.AJ;
  r.eosAmt = o.AK;
  r.eosLawAmt = 0;
  const extra = num(r.otherAllow);
  r.totalDue = o.AM + extra;
  r.insEmp = o.AO;
  r.insEr = o.AR;
  r.insBase = o.AQ;
  r.totalDeduct = o.AU;
  r.net = o.AV + extra;
  r.netSAR = (o.AV + extra) * (num(r.exchRate) || 1);
  const R = PAYX.findReason(r.reason);
  r.eosLaw = R ? R.ar : "";
  return r;
}

const numKey = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 999999;
};

export function terminatedInMonth(e: SalaryBasisRow, m: MonthCtx): boolean {
  const d = (e.termination_date ?? "").slice(0, 10);
  return !!d && d >= isoDate(m.start) && d <= isoDate(m.end);
}

export function buildRows(all: SalaryBasisRow[], m: MonthCtx, saved: PayRow[]): PayRow[] {
  const current = all.filter(
    (e) => !e.is_terminated && !e.exclude_from_payroll && e.category !== "hourly" && !/البوصيري/.test(e.name_ar),
  );
  const prevMap = new Map(saved.map((r) => [String(r.id), r]));
  const empMap = new Map(all.map((e) => [String(e.id), e]));
  const rows: PayRow[] = current.map((e) => baseRow(e, m.days));
  const have = new Set(rows.map((r) => String(r.id)));
  for (const e of all) {
    if (!e.is_terminated) continue;
    const id = String(e.id);
    if (have.has(id)) continue;
    if (terminatedInMonth(e, m) || prevMap.get(id)?.addedTerminated) {
      const b = baseRow(e, m.days);
      b.addedTerminated = true;
      rows.push(b);
      have.add(id);
    }
  }
  rows.sort((a, b) => numKey(a.empNo) - numKey(b.empNo));
  rows.forEach((r, i) => (r.idx = i + 1));
  return rows.map((r) => enrich(r, empMap.get(String(r.id))!, prevMap.get(String(r.id))));
}

export const SUMK: Record<string, number> = {
  sal: 1,
  salByDays: 1,
  overtime: 1,
  houPay: 1,
  traPay: 1,
  prjPay: 1,
  othPay: 1,
  leaveComp: 1,
  eosAmt: 1,
  totalDue: 1,
  loanDeduct: 1,
  insEmp: 1,
  otherDeduct: 1,
  insBase: 1,
  insEr: 1,
  totalDeduct: 1,
  net: 1,
  netSAR: 1,
};

export function sums(rows: PayRow[]): Record<string, number> {
  const s: Record<string, number> = {};
  for (const k of Object.keys(SUMK)) s[k] = 0;
  for (const r of rows) for (const k of Object.keys(SUMK)) s[k] += num((r as any)[k]);
  return s;
}

const SUMCOL: Record<string, string> = {
  "الأساسي": "sal",
  "الراتب حسب الأيام": "salByDays",
  "إضافي": "overtime",
  "سكن": "houPay",
  "مواصلات": "traPay",
  "مشروع (شهري)": "prjPay",
  "أخرى (شهري)": "othPay",
  "بدل أجازة": "leaveComp",
  "مكافأة نهاية الخدمة": "eosAmt",
  "إجمالي المستحق": "totalDue",
  "سلف / غياب": "loanDeduct",
  "تأمينات موظف": "insEmp",
  "أخرى": "otherDeduct",
  "الأجر الخاضع للتأمينات": "insBase",
  "تأمينات شركة": "insEr",
  "إجمالي المستقطع": "totalDeduct",
  "المستحق بالعملة": "net",
  "الصافي (ريال سعودي)": "netSAR",
};

export const EXCEL_COLS: { g?: string; t: string }[] = [
  { g: "بيانات الموظف", t: "م" },
  { t: "الرقم" },
  { t: "الاسم" },
  { t: "الجنسية" },
  { t: "نطاق العمل" },
  { t: "الوظيفة" },
  { g: "التعاقد والإجازة", t: "بداية العقد" },
  { t: "نهاية العقد / آخر يوم" },
  { t: "مدة التعاقد (شهر)" },
  { t: "سنوات الخدمة" },
  { t: "سبب الإنهاء" },
  { t: "المستحق سنويًا (يوم)" },
  { t: "رصيد المستحق خلال فترة التعاقد" },
  { t: "ما تم استحقاقه (يوم)" },
  { t: "الرصيد المستحق (يوم)" },
  { g: "الراتب", t: "الأساسي" },
  { t: "العملة" },
  { t: "معدل الصرف" },
  { t: "الراتب شامل البدلات" },
  { t: "أيام العمل" },
  { t: "أيام التأمينات" },
  { t: "الراتب حسب الأيام" },
  { g: "البدلات", t: "ساعات الإضافي" },
  { t: "إضافي" },
  { t: "سكن" },
  { t: "مواصلات" },
  { t: "مشروع (شهري)" },
  { t: "أخرى (شهري)" },
  { t: "بدل أجازة" },
  { g: "مكافأة نهاية الخدمة", t: "خدمة (سنة)" },
  { t: "خدمة (شهر)" },
  { t: "خدمة (يوم)" },
  { t: "تكلفة السنوات" },
  { t: "تكلفة الشهور" },
  { t: "تكلفة الأيام" },
  { t: "إجمالي المكافأة" },
  { t: "مكافأة نهاية الخدمة" },
  { g: "الإجمالي", t: "إجمالي المستحق" },
  { g: "الاستقطاعات", t: "سلف / غياب" },
  { t: "تأمينات موظف" },
  { t: "أخرى" },
  { t: "الأجر الخاضع للتأمينات" },
  { t: "تأمينات شركة" },
  { t: "حالة التأمينات" },
  { t: "إجمالي المستقطع" },
  { g: "الصافي", t: "المستحق بالعملة" },
  { t: "الصافي (ريال سعودي)" },
  { t: "طريقة الدفع" },
  { t: "ملاحظات" },
];

export function rowValue(r: PayRow, title: string): string | number {
  const v: Record<string, any> = {
    "م": r.idx,
    "الرقم": r.empNo,
    "الاسم": r.name.split(" ").slice(0, 3).join(" "),
    "الجنسية": r.nat,
    "نطاق العمل": r.employer,
    "الوظيفة": r.job,
    "بداية العقد": dmy(r.join),
    "نهاية العقد / آخر يوم": dmy(r.lastDay || r.contractEnd),
    "مدة التعاقد (شهر)": r.contractMonths ?? "",
    "سنوات الخدمة": r.K == null || Number.isNaN(r.K) ? "" : Math.round(r.K * 100) / 100,
    "سبب الإنهاء": r.eosLaw,
    "المستحق سنويًا (يوم)": r.leaveDays,
    "رصيد المستحق خلال فترة التعاقد": r.N,
    "ما تم استحقاقه (يوم)": PAYX.findReason(r.reason) || r.usedManual != null ? num(r.usedManual != null ? r.usedManual : r.usedAuto) : "",
    "الرصيد المستحق (يوم)": r.P,
    "الأساسي": r.sal,
    "العملة": currencyLabel(r.currency),
    "معدل الصرف": r.exchRate,
    "الراتب شامل البدلات": r.allIn,
    "أيام العمل": r.workDays,
    "أيام التأمينات": r.insDays,
    "الراتب حسب الأيام": r.salByDays,
    "ساعات الإضافي": r.otHours || 0,
    "إضافي": r.overtime,
    "سكن": r.houPay,
    "مواصلات": r.traPay,
    "مشروع (شهري)": r.prjPay,
    "أخرى (شهري)": r.othPay,
    "بدل أجازة": r.leaveComp,
    "خدمة (سنة)": r.svcY,
    "خدمة (شهر)": r.svcM,
    "خدمة (يوم)": r.svcD,
    "تكلفة السنوات": r.costY,
    "تكلفة الشهور": r.costM,
    "تكلفة الأيام": r.costD,
    "إجمالي المكافأة": r.eos,
    "مكافأة نهاية الخدمة": r.eosAmt,
    "إجمالي المستحق": r.totalDue,
    "سلف / غياب": r.loanDeduct,
    "تأمينات موظف": r.noInsDeduct ? 0 : r.insEmp,
    "أخرى": r.otherDeduct,
    "الأجر الخاضع للتأمينات": r.insBase,
    "تأمينات شركة": r.insEr,
    "حالة التأمينات": r.insStatus,
    "إجمالي المستقطع": r.totalDeduct,
    "المستحق بالعملة": r.net,
    "الصافي (ريال سعودي)": r.netSAR,
    "طريقة الدفع": r.payMethod,
    "ملاحظات": r.notes,
  };
  const val = v[title];
  if (typeof val === "number" && Number.isFinite(val)) return Math.round(val * 100) / 100;
  return val == null || (typeof val === "number" && !Number.isFinite(val)) ? "" : val;
}

export { SUMCOL };
