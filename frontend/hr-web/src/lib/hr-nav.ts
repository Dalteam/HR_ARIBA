// The HR portal's side menu: the updated design's PG_NAV, entry for entry (27 pages in 7 sections; its
// floating AI assistant was never a menu entry and is out of scope, docs/DESIGN_PORT.md). Our existing pages
// keep their URLs; the design's new pages get one each. Whether a page is built yet is lib/features.ts.

import type { FeatureId } from "./features";

export type BadgeId = "emp" | "lv" | "docs";

export type NavItem = {
  id: string;
  href: string;
  icon: string;
  ar: string;
  en: string;
  /** a counter next to the label, with the design's colour class */
  badge?: { id: BadgeId; cls: "bb" | "ba" | "br" };
  /** set when the page waits for a later step (lib/features.ts) */
  feature?: FeatureId;
};
export type NavEntry = { sec: { ar: string; en: string } } | NavItem;

const sec = (ar: string, en: string): NavEntry => ({ sec: { ar, en } });

export const HR_NAV: NavEntry[] = [
  sec("عام", "General"),
  { id: "dash", href: "/dashboard", icon: "ti-layout-dashboard", ar: "لوحة التحكم", en: "Dashboard" },
  sec("الموظفون", "Employees"),
  { id: "emps", href: "/employees", icon: "ti-users", ar: "الموظفون", en: "Employees", badge: { id: "emp", cls: "bb" } },
  { id: "cand", href: "/candidates", icon: "ti-user-search", ar: "المرشحين", en: "Candidates", feature: "cand" },
  { id: "bizc", href: "/business-cards", icon: "ti-id-badge-2", ar: "بطاقات العمل", en: "Business cards", feature: "bizc" },
  { id: "ann", href: "/announcements", icon: "ti-speakerphone", ar: "الإعلانات والتهاني", en: "Announcements", feature: "ann" },
  { id: "goals", href: "/targets", icon: "ti-target", ar: "المستهدفات", en: "Targets", feature: "goals" },
  { id: "eval", href: "/evaluation", icon: "ti-star", ar: "التقييم", en: "Evaluation", feature: "eval" },
  sec("الحضور", "Attendance"),
  { id: "att", href: "/attendance", icon: "ti-map-pin", ar: "الحضور والانصراف", en: "Attendance" },
  { id: "loc", href: "/locations", icon: "ti-map-2", ar: "مواقع البصمة", en: "GPS Locations" },
  sec("الإجازات", "Leaves"),
  { id: "lv", href: "/leaves", icon: "ti-calendar-event", ar: "الإجازات والطلبات", en: "Leaves & Requests", badge: { id: "lv", cls: "ba" } },
  { id: "team", href: "/team", icon: "ti-users-group", ar: "توفر الفريق والمهام", en: "Team & tasks", feature: "team" },
  sec("المالية", "Finance"),
  { id: "pay", href: "/payroll", icon: "ti-cash", ar: "مسير الرواتب", en: "Payroll" },
  { id: "insc", href: "/insurance-calculator", icon: "ti-shield-check", ar: "حاسبة التأمينات", en: "Insurance calculator", feature: "insc" },
  { id: "salcalc", href: "/salary-calculator", icon: "ti-calculator", ar: "حاسبة الراتب", en: "Salary calculator", feature: "salcalc" },
  { id: "taxcalc", href: "/tax-calculator", icon: "ti-receipt-tax", ar: "حاسبة الضريبة", en: "Tax calculator", feature: "taxcalc" },
  { id: "wps", href: "/salary-transfer", icon: "ti-building-bank", ar: "ملف تحويل الرواتب", en: "Salary transfer file", feature: "wps" },
  { id: "prov", href: "/provisions", icon: "ti-pig-money", ar: "تقرير المخصصات", en: "Provisions report", feature: "prov" },
  { id: "assets", href: "/assets", icon: "ti-building-warehouse", ar: "الأصول والعهد", en: "Assets & custody", feature: "assets" },
  { id: "slip", href: "/payslips", icon: "ti-receipt", ar: "كشف الراتب", en: "Salary Slip" },
  { id: "eos", href: "/end-of-service", icon: "ti-award", ar: "نهاية الخدمة", en: "End of Service" },
  { id: "eoscalc", href: "/settlement", icon: "ti-receipt-2", ar: "المخالصة", en: "Settlement" },
  sec("الوثائق", "Documents"),
  { id: "docs", href: "/documents", icon: "ti-id", ar: "الوثائق", en: "Documents", badge: { id: "docs", cls: "br" } },
  sec("إدارية", "Admin"),
  { id: "rpt", href: "/reports", icon: "ti-report-analytics", ar: "التقارير", en: "Reports" },
  { id: "set", href: "/settings", icon: "ti-settings", ar: "الإعدادات", en: "Settings" },
  { id: "audit", href: "/audit-log", icon: "ti-history", ar: "سجل التعديلات", en: "Audit log", feature: "audit" },
  { id: "bin", href: "/recycle-bin", icon: "ti-trash", ar: "سلة المهملات", en: "Recycle bin", feature: "bin" },
  { id: "forms", href: "/templates", icon: "ti-files", ar: "نماذج", en: "Templates" },
];

/** The page title in the top bar: the design's PG_INFO (its titles differ from some menu labels). */
const TITLES: Record<string, { ar: string; en: string; icon: string }> = {
  emps: { ar: "الموظفون الحاليون", en: "Active Employees", icon: "ti-users" },
  eoscalc: { ar: "حاسبة المخالصة", en: "Settlement", icon: "ti-receipt-2" },
  ann: { ar: "الإعلانات والتهاني", en: "Announcements & greetings", icon: "ti-speakerphone" },
  cand: { ar: "المرشحين وطلبات التوظيف", en: "Candidates", icon: "ti-user-search" },
  forms: { ar: "النماذج", en: "Templates", icon: "ti-files" },
  form: { ar: "بيانات الموظف", en: "Employee Form", icon: "ti-user-plus" },
};

export const navItems = (): NavItem[] => HR_NAV.filter((n): n is NavItem => "id" in n);

export function pageTitle(pathname: string): { ar: string; en: string; icon: string } {
  if (pathname === "/employees/new" || /^\/employees\/[^/]+$/.test(pathname)) return TITLES.form;
  const hit = navItems().find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  if (!hit) return { ar: "لوحة التحكم", en: "Dashboard", icon: "ti-layout-dashboard" };
  return TITLES[hit.id] ?? { ar: hit.ar, en: hit.en, icon: hit.icon };
}
