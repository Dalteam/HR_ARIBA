// الصلاحيات والأشخاص — the roles × modules matrix (GET/PUT /permissions), the accounts' roles
// (/permissions/accounts) and my own levels (/me/permissions), with the design's labels (PermsCard.jsx ML / RL / LV).
// The API checks every call itself; this only decides what the portal shows (BUSINESS_RULES P5).
import { request, type Role } from "./api";

export type Level = "none" | "view" | "edit";
export type Module =
  | "staff" | "employees" | "employees_admin" | "attachments" | "attendance" | "locations" | "leaves" | "requests"
  | "payroll" | "payroll_prepare" | "payroll_approve" | "settlement" | "documents" | "forms" | "reports" | "settings"
  | "permissions" | "audit" | "assets";
export type Levels = Record<Module, Level>;

export const MODULE_LABEL: Record<Module, [string, string]> = {
  staff: ["الدخول الأساسي", "Basic access"],
  employees: ["بيانات الموظفين (إضافة وتعديل)", "Employee data (add / edit)"],
  employees_admin: ["حذف وإنهاء وإيقاف الموظفين وكلمات المرور", "Delete / terminate / deactivate employees & passwords"],
  attachments: ["مرفقات الموظفين", "Employee attachments"],
  attendance: ["الحضور والانصراف", "Attendance"],
  locations: ["مواقع البصمة", "Punch locations"],
  leaves: ["الإجازات", "Leaves"],
  requests: ["الطلبات والموافقات", "Requests & approvals"],
  payroll: ["المسير والجزء المالي", "Payroll & finance"],
  payroll_prepare: ["تجهيز المسير للمالية", "Prepare payroll for finance"],
  payroll_approve: ["اعتماد المسير وفتحه", "Approve / reopen payroll"],
  settlement: ["المخالصة", "Settlement"],
  documents: ["الوثائق", "Documents"],
  forms: ["النماذج", "Forms"],
  reports: ["التقارير", "Reports"],
  settings: ["الإعدادات", "Settings"],
  permissions: ["الصلاحيات", "Permissions"],
  audit: ["سجل التعديلات", "Audit log"],
  assets: ["الأصول والعهد", "Assets & custody"],
};

export const ROLE_LABEL: Record<string, [string, string]> = {
  hr: ["الموارد البشرية", "HR"],
  admin_manager: ["المدير الإداري", "Administrative manager"],
  finance: ["المالية", "Finance"],
  ceo: ["الرئيس التنفيذي", "CEO"],
  chairman: ["رئيس مجلس الإدارة / المدير العام", "Chairman / General manager"],
  admin: ["Admin (الافتراضي)", "Admin (default)"],
  manager: ["مدير (مدير مباشر)", "Manager (line manager)"],
  employee: ["موظف (تطبيق الموظف فقط)", "Employee (employee app only)"],
};

export const LEVEL_LABEL: Record<Level, [string, string]> = { none: ["لا", "None"], view: ["اطلاع", "View"], edit: ["كامل", "Full"] };

export interface Matrix {
  roles: Role[];
  full_roles: Role[];
  modules: Module[];
  levels: Level[];
  capped: Partial<Record<Module, Level>>;
  matrix: Record<string, Levels>;
  can_edit: boolean;
}

export interface PermAccount {
  user_id: string;
  employee_id: string | null;
  username: string;
  role: Role;
  name_ar: string | null;
  name_en: string | null;
}

export interface MyPermissions {
  role: Role;
  full: boolean;
  perms: Levels;
}

export const getMatrix = () => request<Matrix>("/permissions");
export const setLevel = (role: string, module: Module, level: Level) =>
  request<{ role: string; module: Module; level: Level }>("/permissions", { method: "PUT", body: { role, module, level } });
export const listPermAccounts = () =>
  request<{ accounts: PermAccount[]; roles: Role[]; can_edit: boolean; can_grant_admin: boolean }>("/permissions/accounts");
export const setAccountRole = (employeeId: string, role: string) =>
  request<{ employee_id: string; role: string; accounts_updated: number }>(`/permissions/accounts/${encodeURIComponent(employeeId)}`, {
    method: "PUT",
    body: { role },
  });
export const myPermissions = () => request<MyPermissions>("/me/permissions");

const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2 };

/** Does `levels` reach `need` on ANY of `modules`? (the design's ariba_can, 'a|b') */
export function allows(levels: Levels | null, modules: Module | Module[], need: Level = "view"): boolean {
  if (!levels) return false;
  return (Array.isArray(modules) ? modules : [modules]).some((m) => RANK[levels[m] ?? "none"] >= RANK[need]);
}
