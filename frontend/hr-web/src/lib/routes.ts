// Which roles may open which pages. This MIRRORS the backend's permissions for navigation and
// redirects only; the backend enforces the real rules on every request.

import type { Role } from "./api";

export const FINANCE_ROUTES = ["/payroll", "/payslips", "/end-of-service", "/settlement"] as const;
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
] as const;

const HR_READERS: Role[] = ["hr", "ceo", "admin"];
const FINANCE_READERS: Role[] = ["finance", "hr", "admin"];

export const HR_LOGIN = "/login";
export const EMP_LOGIN = "/me/login";

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
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
