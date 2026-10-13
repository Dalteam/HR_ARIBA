// Settings page (#pg-set) API — backend/app/routers/settings.py + sheets for logo / HR signer.
import { request } from "./api";

export interface Company { company_name_ar: string; company_name_en: string; labour_law_country: string }
export interface AttendanceSettings {
  work_start: string;
  tolerance_minutes: number;
  remote_days_per_year: number;
  flexible_enabled: boolean;
  shift_hours: number | string;
  window_start: string;
  window_end: string;
}
export const GOSI_KEYS = ["matchEmp", "matchEmp55", "matchEr", "matchEr55", "noMatchEmp", "noMatchEmp55", "noMatchEr", "noMatchEr55", "nonSaudiEr"] as const;
export type GosiPeriod = { date: string } & Record<(typeof GOSI_KEYS)[number], number | string>;
export interface GosiSettings { wageCap: number | string; ageThreshold: number; effectiveRules: GosiPeriod[] }
export interface Account { user_id: string; employee_id: string | null; name_ar: string; username: string; role: string; is_active: boolean; must_change_password: boolean }

export const getCompany = () => request<Company>("/settings/company");
export const putCompany = (b: Company) => request<Company>("/settings/company", { method: "PUT", body: b });
export const getAttendanceSettings = () => request<AttendanceSettings>("/settings/attendance");
export const putAttendanceSettings = (b: AttendanceSettings) => request<AttendanceSettings>("/settings/attendance", { method: "PUT", body: b });
export const getGosi = () => request<GosiSettings>("/settings/gosi");
export const putGosi = (b: GosiSettings) => request<GosiSettings>("/settings/gosi", { method: "PUT", body: b });
export const addListItem = (kind: "workplaces" | "departments", name_ar: string) =>
  request<{ id: string; name_ar: string }>(`/settings/lists/${kind}`, { method: "POST", body: { name_ar } });
export const removeListItem = (kind: "workplaces" | "departments", id: string) => request<void>(`/settings/lists/${kind}/${id}`, { method: "DELETE" });
export const listAccounts = () => request<Account[]>("/settings/accounts");
export const setRole = (userId: string, role: string) => request<unknown>(`/auth/users/${userId}`, { method: "PATCH", body: { role } });
export const setPayrollExclusion = (employee_id: string, exclude: boolean) =>
  request<void>("/settings/payroll-exclusion", { method: "POST", body: { employee_id, exclude } });

export const getSheet = <T,>(key: string) => request<{ data: T | null }>(`/sheets/${key}`);
export const putSheet = (key: string, data: unknown) => request<unknown>(`/sheets/${key}`, { method: "PUT", body: { data } });
