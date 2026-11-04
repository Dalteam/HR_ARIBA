// Targets and evaluations on OUR Stage 3 routes (backend/app/routers/goals.py), with the updated design's helpers
// (its lib/goals.js): period keys, labels, progress and the rating words.
import { request } from "./api";

export type PeriodType = "annual" | "quarterly" | "monthly";
export interface Target {
  id: string; employee_id: string; period_type: PeriodType; period_key: string; title: string; description: string | null; unit: string | null;
  target_value: number | null; actual_value: number | null; weight: number; status: "active" | "done";
}
export interface EvalItem { target_id?: string; title: string; target?: number | null; unit?: string; actual?: number | null; weight: number | string; score: number | string; comment?: string; manual?: boolean }
export interface Evaluation {
  id: string; employee_id: string; period_type: PeriodType; period_key: string; items: EvalItem[]; comments: string | null;
  overall: number | null; rating: string | null; status: "draft" | "pending" | "approved"; submitted_at: string | null; approved_at: string | null;
}

export const PT: Record<PeriodType, string> = { annual: "سنوي", quarterly: "ربع سنوي", monthly: "شهري" };
export const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export const curKey = (type: PeriodType, d = new Date()) =>
  type === "annual" ? String(d.getFullYear()) : type === "quarterly" ? d.getFullYear() + "-Q" + (Math.floor(d.getMonth() / 3) + 1) : d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
export const keyLabel = (type: PeriodType, key: string) =>
  type === "annual" ? "سنة " + key : type === "quarterly" ? "الربع " + key.slice(-1) + " / " + key.slice(0, 4) : MONTHS[+key.slice(5) - 1] + " " + key.slice(0, 4);
export const pct = (t: Pick<Target, "target_value" | "actual_value">) =>
  Number(t.target_value) > 0 ? Math.max(0, Math.min(100, Math.round(((Number(t.actual_value) || 0) / Number(t.target_value)) * 100))) : null;
export const ratingOf = (p: number) => (p >= 90 ? "ممتاز" : p >= 75 ? "جيد جداً" : p >= 60 ? "جيد" : p >= 50 ? "مقبول" : "ضعيف");

export const listTargets = async (employeeId: string, year: string) => (await request<{ targets: Target[] }>("/targets", { query: { employee_id: employeeId, year } })).targets;
export const saveTarget = (t: Partial<Target> & { employee_id: string; period_type: PeriodType; period_key: string; title: string }) =>
  request<{ target: Target }>("/targets", { method: "POST", body: t });
export const deleteTarget = (id: string) => request<{ ok: true }>(`/targets/${id}`, { method: "DELETE" });
export const getEvaluation = (employeeId: string, type: PeriodType, key: string) =>
  request<{ evaluation: Evaluation | null; targets: Target[]; can_approve: boolean; can_write?: boolean }>(`/evaluations/${employeeId}/${type}/${key}`);
/** Stage 15: HR writes an evaluation; `submit` from HR is final at once (owner, 4 Nov 2026). */
export const saveEvaluation = (employeeId: string, type: PeriodType, key: string, body: { items: EvalItem[]; comments: string; submit: boolean }) =>
  request<{ evaluation: Evaluation }>(`/evaluations/${employeeId}/${type}/${key}`, { method: "PUT", body });
export const approveEvaluation = (id: string) => request<{ evaluation: Evaluation }>(`/evaluations/${id}/approve`, { method: "POST" });
