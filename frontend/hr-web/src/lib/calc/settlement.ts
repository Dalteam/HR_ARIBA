// Settlement calculator — a line-for-line port of `sRun` in
// frontend/legacy/hr-portal/js/calculations/07-settlement-calculator.js (docs section 4.8).
// Keep the arithmetic and rounding exactly as the original.

export type SettlementReason = "m84" | "m74" | "m85" | "m75" | "m77" | "m80" | "m53" | "m74r" | "m74d";

export const REASONS: { value: SettlementReason; label: string }[] = [
  { value: "m84", label: "م.84 إنهاء الشركة" },
  { value: "m74", label: "م.74 اتفاق" },
  { value: "m85", label: "م.85 استقالة" },
  { value: "m75", label: "م.75 قسرية" },
  { value: "m77", label: "م.77 تعسفي" },
  { value: "m80", label: "م.80 تأديبي" },
  { value: "m53", label: "م.53 تجربة" },
  { value: "m74r", label: "م.74(4) تقاعد" },
  { value: "m74d", label: "م.74(3) وفاة" },
];

export const LAW_NAME: Record<SettlementReason, string> = {
  m84: "م.84",
  m74: "م.74",
  m85: "م.85",
  m75: "م.75",
  m77: "م.77",
  m80: "م.80",
  m53: "م.53",
  m74r: "م.74(4)",
  m74d: "م.74(3)",
};

export interface SettlementInput {
  start: string; // yyyy-mm-dd
  end: string;
  salary: number;
  reason: SettlementReason;
  leavePerYear: number; // sLeaveD (default 21)
  leaveTaken: number;
  monthDays: number; // sWD (0 = not entered)
  attendanceDays: number; // sAD
  extras: number[];
  deductions: { value: number; type: "amount" | "days" }[];
}

export interface SettlementResult {
  years: number;
  months: number;
  days: number;
  totalYears: number;
  e84: number;
  award: number;
  lawNote: string;
  leaveDue: number;
  leaveRemaining: number;
  leaveComp: number;
  periodSalary: number;
  leaveExcess: number;
  leaveExcessDeduction: number;
  extrasTotal: number;
  deductionsTotal: number;
  total: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function runSettlement(i: SettlementInput): SettlementResult | null {
  const sal = i.salary || 0;
  if (!i.start || !i.end || !sal) return null;
  const ld = Math.trunc(i.leavePerYear) || 21;
  const lt = Math.trunc(i.leaveTaken) || 0;
  const wd = Math.trunc(i.monthDays) || 0;
  const ad = Math.trunc(i.attendanceDays) || 0;
  const r = i.reason;

  const d1 = new Date(i.start);
  const d2 = new Date(i.end);
  let fy = d2.getFullYear() - d1.getFullYear();
  if (d2.getMonth() < d1.getMonth() || (d2.getMonth() === d1.getMonth() && d2.getDate() < d1.getDate())) fy--;
  const ay = new Date(d1.getFullYear() + fy, d1.getMonth(), d1.getDate());
  let fm = 0;
  let tmp = new Date(ay);
  while (new Date(tmp.getFullYear(), tmp.getMonth() + 1, tmp.getDate()) <= d2) {
    tmp = new Date(tmp.getFullYear(), tmp.getMonth() + 1, tmp.getDate());
    fm++;
  }
  const fd = Math.round((d2.getTime() - tmp.getTime()) / 86400000) + 1;
  const ty = fy + fm / 12 + fd / 360;

  const y1 = Math.min(ty, 5);
  const y2 = Math.max(0, ty - 5);
  const e84 = r2((sal / 2) * y1 + sal * y2);
  let ef = 0;
  let ln = "";
  if (r === "m84" || r === "m74" || r === "m74r" || r === "m74d") {
    ef = e84;
    ln = "نصف شهر × 5 سنوات أولى + شهر × ما بعدها.";
  } else if (r === "m85" || r === "m75") {
    if (ty < 2) {
      ef = 0;
      ln = "أقل من سنتين — لا تستحق.";
    } else if (ty < 5) {
      ef = r2(e84 / 3);
      ln = "ثلث م.84.";
    } else if (ty < 10) {
      ef = r2((e84 * 2) / 3);
      ln = "ثلثان م.84.";
    } else {
      ef = e84;
      ln = "م.84 كاملة.";
    }
  } else if (r === "m77") {
    const c77 = Math.max(Math.round(sal * 2), Math.round((sal / 30) * 15 * ty));
    ef = e84 + c77;
    ln = "تعويض + م.84.";
  } else if (r === "m80" || r === "m53") {
    ef = 0;
    ln = "لا مكافأة.";
  }

  const ldue = r2(ty * ld);
  const lrem = Math.max(0, r2(ldue - lt));
  const lcomp = r2((sal / 30) * lrem);
  const lmsf = wd > 0 && ad > 0 ? r2((sal / wd) * ad) : sal;
  const lexc = Math.max(0, r2(lt - ldue));
  const lded = r2((sal / 30) * lexc);
  const extT = i.extras.reduce((s, v) => s + (v || 0), 0);
  const dedT = i.deductions.reduce((s, d) => {
    if (!d.value) return s;
    return s + (d.type === "days" ? r2((sal / (wd || 30)) * d.value) : d.value);
  }, 0);
  const gt = Math.max(0, r2(ef + lcomp + lmsf + extT - dedT - lded));

  return {
    years: fy,
    months: fm,
    days: fd,
    totalYears: ty,
    e84,
    award: ef,
    lawNote: ln,
    leaveDue: ldue,
    leaveRemaining: lrem,
    leaveComp: lcomp,
    periodSalary: lmsf,
    leaveExcess: lexc,
    leaveExcessDeduction: lded,
    extrasTotal: extT,
    deductionsTotal: dedT,
    total: gt,
  };
}

export const sNum = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

export function sDt(d: string) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn");
  } catch {
    return d;
  }
}
