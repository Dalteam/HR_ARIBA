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
// Links written into the notification e-mails: HR staff get `hr`, everyone else `emp`.
// Both may stay empty — the backend then uses PUBLIC_APP_URL (see NOTIFY e-mail settings).
export interface AppLinks { hr: string; emp: string; fallback: string }

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

// ---- Stage 20: the working-hours schedule and the leave rules (backend/app/services/{schedule,leave_rules}.py,
// routes GET/PUT /settings/schedule and /settings/leave-rules in routers/settings_extra.py) ----
export interface Shift { start: string; end: string; hours: number | string; grace: number | string }
/** the shift the server measured today's punches against (`kind` is which of the two rows it took) */
export interface AppliedShift extends Shift { kind: "official" | "ramadan" }
export interface ScheduleSettings {
  enabled: boolean;
  official: Shift;
  ramadan: Shift;
  /** Ramadan found by the Hijri month; the two dates below win when both are set */
  ramadan_auto: boolean;
  ramadan_from: string;
  ramadan_to: string;
  today?: { date: string; shift: AppliedShift | null };
}
export type AccrualMethod = "calendar" | "workdays" | "monthly";
export type SpecialKind = "tamheer" | "trainee" | "consultant";
export interface LeaveRules {
  /** `enabled: false` carries the whole balance: no cap and no end-of-service excess */
  carry: { enabled: boolean; days: number | string };
  accrual: { method: AccrualMethod };
  /** an unticked type keeps no leave ledger (`leave`) and gets no leave excess at the end of service (`eos`) */
  rights: Record<SpecialKind, { leave: boolean; eos: boolean }>;
}
export interface LeaveRulesPayload extends LeaveRules {
  /** how many active employees each type holds — what the switches act on */
  employees: Record<SpecialKind | "other", number>;
  methods: AccrualMethod[];
  max_carry_days: number;
  kinds: SpecialKind[];
}

export const getSchedule = () => request<ScheduleSettings>("/settings/schedule");
export const putSchedule = (b: Omit<ScheduleSettings, "today">) => request<ScheduleSettings>("/settings/schedule", { method: "PUT", body: b });
export const getLeaveRules = () => request<LeaveRulesPayload>("/settings/leave-rules");
// any of the three; what the body leaves out keeps its saved row
export const putLeaveRules = (b: Partial<LeaveRules>) => request<LeaveRulesPayload>("/settings/leave-rules", { method: "PUT", body: b });

export const getSheet = <T,>(key: string) => request<{ data: T | null }>(`/sheets/${key}`);
export const putSheet = (key: string, data: unknown) => request<unknown>(`/sheets/${key}`, { method: "PUT", body: { data } });
export const getAppLinks = () => request<AppLinks>("/settings/app-links");
export const putAppLinks = (b: { hr: string; emp: string }) => request<AppLinks>("/settings/app-links", { method: "PUT", body: b });
