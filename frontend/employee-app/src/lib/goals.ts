// The pure helpers of their lib/goals.js (period keys, progress, rating) — same formulas as the HR site's
// src/lib/calc/goals.ts, typed for the app.
export type PeriodType = "annual" | "quarterly" | "monthly";
export const PT: Record<PeriodType, string> = { annual: "سنوي", quarterly: "ربع سنوي", monthly: "شهري" };
export const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export const curKey = (type: PeriodType, d = new Date()) =>
  type === "annual" ? String(d.getFullYear()) : type === "quarterly" ? `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}` : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const keyLabel = (type: string, key: string) =>
  type === "annual" ? "سنة " + key : type === "quarterly" ? "الربع " + key.slice(-1) + " / " + key.slice(0, 4) : MONTHS[+key.slice(5) - 1] + " " + key.slice(0, 4);
export const pct = (t: { target_value: number | null; actual_value: number | null }) =>
  Number(t.target_value) > 0 ? Math.max(0, Math.min(100, Math.round(((Number(t.actual_value) || 0) / Number(t.target_value)) * 100))) : null;
export const ratingOf = (p: number) => (p >= 90 ? "ممتاز" : p >= 75 ? "جيد جداً" : p >= 60 ? "جيد" : p >= 50 ? "مقبول" : "ضعيف");
/** Their EvalForm calc: Σ score·weight / Σ weight, one decimal. */
export const overallOf = (items: { score: number | string; weight: number | string }[]) => {
  const tw = items.reduce((a, i) => a + (Number(i.weight) || 1), 0);
  return tw ? Math.round((items.reduce((a, i) => a + (Number(i.score) || 0) * (Number(i.weight) || 1), 0) / tw) * 10) / 10 : null;
};
/** Previous / next period key (their PeriodPick arrows). */
export function shiftKey(type: PeriodType, key: string, step: number): string {
  const y = +key.slice(0, 4);
  if (type === "annual") return String(y + step);
  if (type === "quarterly") { const q = +key.slice(-1) - 1 + step; return `${y + Math.floor(q / 4)}-Q${((q % 4) + 4) % 4 + 1}`; }
  const m = +key.slice(5) - 1 + step;
  return `${y + Math.floor(m / 12)}-${String(((m % 12) + 12) % 12 + 1).padStart(2, "0")}`;
}
