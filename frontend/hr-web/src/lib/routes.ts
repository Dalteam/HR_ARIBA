// Which roles may open which pages. This MIRRORS the backend's permissions for navigation and
// redirects only; the backend enforces the real rules on every request.

import type { Role } from "./api";

// The updated design's payroll-module pages (calculators, transfer file, provisions) sit with payroll.
export const FINANCE_ROUTES = [
  "/payroll",
  "/payslips",
  "/end-of-service",
  "/settlement",
  "/insurance-calculator",
  "/salary-calculator",
  "/tax-calculator",
  "/salary-transfer",
  "/provisions",
] as const;
export const HR_ROUTES = [
  "/dashboard",
  "/employees",
  "/attendance",
  "/locations",
  "/leaves",
  "/documents",
  "/templates",
  "/reports",
  "/settings",
  // the updated design's other new pages (docs/DESIGN_PORT.md)
  "/candidates",
  "/business-cards",
  "/announcements",
  "/targets",
  "/evaluation",
  "/team",
  "/assets",
  "/audit-log",
  "/recycle-bin",
] as const;

const HR_READERS: Role[] = ["hr", "ceo", "admin"];
const FINANCE_READERS: Role[] = ["finance", "hr", "admin"];

export const HR_LOGIN = "/login";
export const EMP_LOGIN = "/me/login";
// The public application form: the link itself is the key (candidates), so it opens with no session.
export const PUBLIC_APPLY = "/apply";

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

export function isPublicApply(path: string): boolean {
  return under(path, PUBLIC_APPLY);
}

export function isEmployeeApp(path: string): boolean {
  return under(path, "/me");
}

export function canAccess(path: string, role: Role): boolean {
  if (isEmployeeApp(path)) return true;
  if (FINANCE_ROUTES.some((p) => under(path, p))) return FINANCE_READERS.includes(role);
  if (HR_ROUTES.some((p) => under(path, p))) return HR_READERS.includes(role);
  return true;
}

/** Where a role lands after signing in: employees and managers use the employee app. */
export function homeFor(role: Role): string {
  if (role === "employee" || role === "manager") return "/me";
  if (role === "finance") return "/payroll";
  return "/dashboard";
}
