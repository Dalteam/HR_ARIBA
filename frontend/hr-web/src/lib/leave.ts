// Leaves page API (holidays, requests + approvals, balances) — backend/app/routers/leave.py.
import { request } from "./api";

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type Stage = "manager" | "hr" | "ceo" | "completed";

export interface HrRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  type: string;
  status: RequestStatus;
  stage: Stage;
  from_date: string | null;
  to_date: string | null;
  days: string | null;
  on_date: string | null;
  time_from: string | null;
  hours: string | null;
  amount: string | null;
  punch_kind: string | null;
  notes: string | null;
  rejection_reason: string | null;
  attachment_id: string | null;
  created_at: string;
}

export interface Holiday {
  id: string;
  name_ar: string;
  name_en: string | null;
  start_date: string;
  days: number;
  is_recurring: boolean;
}

export interface BalanceRow {
  employee_id: string;
  name_ar: string;
  carry: number;
  current: number;
  year_end: number;
  accrued_since_join: number;
  used_since_join: number;
  remaining_since_join: number;
  eos: number;
  annual: number;
  override_used: Record<string, number>;
}

export interface LedgerYear {
  year: number;
  opening: number;
  entitlement: number;
  used: number;
  adjustment: number;
  close: number;
  carry: number;
  eos: number;
  current: number | null;
}

export interface BalanceDetail {
  summary: BalanceRow;
  accumulated_eos: number;
  years: LedgerYear[];
}

export const listRequests = (q: { status?: string; type?: string; employee_id?: string; pending_now?: boolean } = {}) =>
  request<HrRequest[]>("/requests", { query: q as Record<string, string | boolean | undefined> });
export const createRequest = (body: Record<string, unknown>) => request<HrRequest>("/requests", { method: "POST", body });
export const approveRequest = (id: string, reason?: string) => request<HrRequest>(`/requests/${id}/approve`, { method: "POST", body: { reason } });
export const overrideRequest = (id: string, reason: string) => request<HrRequest>(`/requests/${id}/override`, { method: "POST", body: { reason } });
export const finalApproveRequest = (id: string, reason?: string) => request<HrRequest>(`/requests/${id}/final-approve`, { method: "POST", body: { reason } });
export const rejectRequest = (id: string, reason: string) => request<HrRequest>(`/requests/${id}/reject`, { method: "POST", body: { reason } });
export const deleteRequest = (id: string) => request<void>(`/requests/${id}`, { method: "DELETE" });

export const listHolidays = () => request<Holiday[]>("/holidays");
export const addHoliday = (body: { name_ar: string; start_date: string; days: number; is_recurring: boolean }) =>
  request<Holiday>("/holidays", { method: "POST", body });
export const deleteHoliday = (id: string) => request<void>(`/holidays/${id}`, { method: "DELETE" });

export const listBalances = () => request<BalanceRow[]>("/leave/balances");
export const balanceDetail = (employeeId: string) => request<BalanceDetail>(`/leave/employees/${employeeId}`);
export const saveBalance = (employeeId: string, body: { date: string; note: string; years: Record<string, number | null>[] }) =>
  request<BalanceDetail>(`/leave/employees/${employeeId}`, { method: "PUT", body });

/** Legacy LVL (js/main/04-charts-navigation.js): label, icon and colour per leave type. */
export const LVL: Record<string, { ar: string; icon: string; color: string }> = {
  annual: { ar: "سنوية", icon: "ti-sun", color: "#E4E4BC" },
  sick: { ar: "مرضية", icon: "ti-stethoscope", color: "#6B7280" },
  emergency: { ar: "اضطرارية", icon: "ti-urgent", color: "#E4E4BC" },
  death: { ar: "وفاة", icon: "ti-candle", color: "#6366f1" },
  marriage: { ar: "زواج", icon: "ti-heart", color: "#E4E4BC" },
  paternity: { ar: "أبوة", icon: "ti-baby-carriage", color: "#014D3D" },
  maternity: { ar: "أمومة", icon: "ti-baby", color: "#E4E4BC" },
  umrah: { ar: "عمرة", icon: "ti-moon", color: "#29B35E" },
  hajj: { ar: "حج", icon: "ti-star", color: "#014D3D" },
  remote: { ar: "عن بعد", icon: "ti-home-laptop", color: "#29B35E" },
};

export const OTHER_TYPES: Record<string, string> = {
  permission: "استئذان",
  maternity_permission: "استئذان أمومة",
  early_leave: "انصراف مبكر",
  advance: "سلفة",
  mission: "مهمة",
  forgot_punch: "نسيان بصمة",
  overtime: "عمل إضافي",
};

export const typeLabel = (t: string) => LVL[t]?.ar ?? OTHER_TYPES[t] ?? t;

/** Legacy countLeaveWorkdays for the live preview (Sun–Thu, minus expanded holidays). */
export function countWorkdays(from: string, to: string, hols: Holiday[]): number {
  const s = new Date(from + "T00:00:00");
  const e = new Date(to + "T00:00:00");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return 0;
  const set = new Set<string>();
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  for (let y = s.getFullYear(); y <= e.getFullYear(); y++) {
    for (const h of hols) {
      const base = new Date(h.start_date + "T00:00:00");
      let start: Date;
      if (h.is_recurring) start = new Date(y, base.getMonth(), base.getDate());
      else if (base.getFullYear() !== y) continue;
      else start = base;
      for (let i = 0; i < Math.max(1, h.days || 1); i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        set.add(key(d));
      }
    }
  }
  let n = 0;
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 5 && wd !== 6 && !set.has(key(d))) n++;
  }
  return n;
}
