// سجل التعديلات — the audit log screen's data (GET /audit-log, the module filter and the purge box).
import { request } from "./api";

export interface AuditRow {
  id: number;
  at: string;
  actor_username: string | null;
  actor_name: string | null;
  actor_role: string | null;
  module: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  summary: string | null;
  /** `{changes: [{field, label, old, new}]}` when the write recorded field-level changes */
  details: { changes?: { field?: string; label?: string; old?: unknown; new?: unknown }[] } | null;
}

export interface AuditPage {
  items: AuditRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditModule {
  module: string;
  count: number;
  last_at: string;
}

export interface PurgeMonth {
  month: string;
  count: number;
}

export interface PurgeRequest {
  id: string;
  month: string;
  requester_name: string | null;
  requester_role: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_name: string | null;
  decided_at: string | null;
}

export interface PurgeInfo {
  is_finance: boolean;
  /** only the months that ended more than 30 days ago */
  months: PurgeMonth[];
  requests: PurgeRequest[];
}

export interface AuditFilters {
  module?: string;
  /** several modules at once (the section button); wins over `module` on the server */
  modules?: string[];
  actor?: string;
  q?: string;
  /** ISO date (YYYY-MM-DD) or date-time; `to` is exclusive */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** The design's `MOD`: the module chip label of each module our own writes use. */
export const MODULE_LABEL: Record<string, string> = {
  employees: "الموظفون",
  attendance: "الحضور والانصراف",
  payroll: "مسير الرواتب",
  leaves: "الإجازات",
  requests: "الطلبات",
  workflow: "الطلبات",
  documents: "المستندات والنماذج",
  settings: "الإعدادات",
  locations: "مواقع البصمة",
  security: "الصلاحيات والأمان",
  settlement: "المخالصة",
  insurance: "التأمينات",
  audit: "سجل التعديلات",
  bin: "سلة المهملات",
  auth: "حسابات الدخول",
  accounts: "حسابات الدخول",
  letters: "النماذج",
  goals: "المستهدفات",
  tasks: "المهام",
  announcements: "الإعلانات",
};

export const moduleName = (module: string) => MODULE_LABEL[module] || module;

/** `—` for empty values, «نعم/لا» for booleans, one line for objects (the design's `fv`). */
export function fieldValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (Array.isArray(value)) return value.join("، ");
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > 80 ? text.slice(0, 79) + "…" : text;
}

/** Riyadh time, as the design prints it (gregorian, latin digits). */
export function riyadhTime(value: string): string {
  try {
    return new Date(value).toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
      timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return String(value);
  }
}

export const listAudit = (filters: AuditFilters) =>
  request<AuditPage>("/audit-log", {
    query: {
      module: filters.module || undefined,
      modules: filters.modules?.length ? filters.modules : undefined,
      actor_username: filters.actor || undefined,
      q: filters.q || undefined,
      date_from: filters.from || undefined,
      date_to: filters.to || undefined,
      limit: filters.limit,
      offset: filters.offset,
    },
  });

export const auditModules = () => request<{ items: AuditModule[]; modules: string[] }>("/audit-log/modules");

export const purgeInfo = () => request<PurgeInfo>("/audit-log/purge");

export const requestPurge = (month: string) =>
  request<{ id: string; month: string; status: string; notified: number }>("/audit-log/purge", {
    method: "POST",
    body: { month },
  });

export const decidePurge = (id: string, approve: boolean) =>
  request<{ id: string; month: string; status: string; approved: boolean; note: string }>(
    `/audit-log/purge/${id}/decide`,
    { method: "POST", body: { approve } },
  );
