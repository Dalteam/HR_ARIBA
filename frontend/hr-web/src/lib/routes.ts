// Which roles may open which pages. This MIRRORS the backend's permissions for navigation and
// redirects only; the backend enforces the real rules on every request.
//
// Stage 11: a page belongs to a module of the permission matrix (PAGE_MODULES). The proxy cannot read the
// matrix, so it only separates the roles with an HR side from the employee app; the portal then checks the
// page's module against GET /me/permissions (hr-shell). Without loaded permissions the old role rules apply.

import type { Role } from "./api";
import { allows, type Level, type Levels, type Module } from "./permissions";

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
  "/audit-log",
  "/recycle-bin",
] as const;

const HR_READERS: Role[] = ["hr", "ceo", "admin", "admin_manager", "chairman"];
const FINANCE_READERS: Role[] = ["finance", "hr", "admin", "chairman"];
// Assets & custody: `assets` is edit for hr / admin / finance and view for the CEO (BUSINESS_RULES § Fixed assets).
export const ASSETS_ROUTE = "/assets";
const ASSETS_READERS: Role[] = ["hr", "ceo", "admin", "finance", "admin_manager", "chairman"];
/** The roles with an HR side at all; `employee` and `manager` use the employee app. */
export const HR_SIDE: Role[] = ["hr", "ceo", "admin", "finance", "admin_manager", "chairman"];

type Need = { modules: Module | Module[]; need?: Level };
/** Each page's module(s) in the matrix — the same mapping the API uses (BUSINESS_RULES § Roles and permissions). */
export const PAGE_MODULES: Record<string, Need> = {
  "/dashboard": { modules: "staff" },
  "/employees": { modules: "employees" },
  "/candidates": { modules: ["employees", "employees_admin"] },
  "/business-cards": { modules: "employees" },
  // the API keeps announcements, targets, evaluations and tasks with HR (P6): the people who edit employees
  "/announcements": { modules: "employees", need: "edit" },
  "/attendance": { modules: "attendance" },
  "/locations": { modules: "locations" },
  "/leaves": { modules: ["leaves", "requests"] },
  "/documents": { modules: ["documents", "attachments"] },
  "/templates": { modules: "forms" },
  "/reports": { modules: "reports" },
  "/settings": { modules: ["settings", "permissions"] },
  "/assets": { modules: "assets" },
  "/audit-log": { modules: "audit" },
  "/recycle-bin": { modules: "employees_admin", need: "edit" },
  "/payroll": { modules: "payroll" },
  "/payslips": { modules: "payroll" },
  "/end-of-service": { modules: "settlement" },
  "/settlement": { modules: "settlement" },
  "/insurance-calculator": { modules: "payroll" },
  "/salary-calculator": { modules: "payroll" },
  "/tax-calculator": { modules: "payroll" },
  "/salary-transfer": { modules: "payroll" },
  "/provisions": { modules: "payroll" },
};
/** Pages that stay on roles (P6: goals, evaluations, team & tasks keep their Stage 3–4 rules). */
const ROLE_PAGES = ["/targets", "/evaluation", "/team"];

export const HR_LOGIN = "/login";
// The employee's own pages moved to the Expo app (frontend/employee-app). `/me` is now a single card on the HR
// side that says where the app is, so there is one sign-in screen for everybody (`docs/ACCEPTANCE_CHECKS.md`
// §5.5; the retired pages are kept as text-only under `src/legacy/employee-web`).
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

function pageOf(path: string): string | undefined {
  return [...FINANCE_ROUTES, ...HR_ROUTES, ASSETS_ROUTE].find((p) => under(path, p));
}

/**
 * `perms` undefined (the proxy): only "has an HR side". `perms` null (not loaded): the old role rules.
 * `perms` given: the page's module in the matrix.
 */
export function canAccess(path: string, role: Role, perms?: Levels | null): boolean {
  if (isEmployeeApp(path)) return true;
  const page = pageOf(path);
  if (!page) return true;
  if (!HR_SIDE.includes(role)) return false;
  if (perms === undefined) return true;
  if (ROLE_PAGES.includes(page)) return HR_READERS.includes(role);
  if (perms && PAGE_MODULES[page]) return allows(perms, PAGE_MODULES[page].modules, PAGE_MODULES[page].need ?? "view");
  if (page === ASSETS_ROUTE) return ASSETS_READERS.includes(role);
  if ((FINANCE_ROUTES as readonly string[]).includes(page)) return FINANCE_READERS.includes(role);
  return HR_READERS.includes(role);
}

/** Where a role lands after signing in: employees and managers use the employee app. */
export function homeFor(role: Role): string {
  if (role === "employee" || role === "manager") return "/me";
  if (role === "finance") return "/payroll";
  return "/dashboard";
}
