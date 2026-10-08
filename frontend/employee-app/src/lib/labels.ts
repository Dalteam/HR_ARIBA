// Request type names and status text of the legacy employee app (LVL + V114 forgot_punch + V21 overtime).
import type { MyRequest, RequestType } from "./api";

export const REQUEST_TYPES: { key: RequestType; ar: string; color: string }[] = [
  { key: "annual", ar: "سنوية", color: "#f59e0b" },
  { key: "sick", ar: "مرضية", color: "#ef4444" },
  { key: "emergency", ar: "اضطرارية", color: "#f97316" },
  { key: "death", ar: "وفاة", color: "#6366f1" },
  { key: "marriage", ar: "زواج", color: "#ec4899" },
  { key: "maternity", ar: "أمومة", color: "#ec4899" },
  { key: "paternity", ar: "أبوة", color: "#8b5cf6" },
  { key: "umrah", ar: "عمرة", color: "#10b981" },
  { key: "hajj", ar: "حج", color: "#8b5cf6" },
  { key: "remote", ar: "عن بعد", color: "#3b82f6" },
  { key: "permission", ar: "استئذان", color: "#06b6d4" },
  { key: "maternity_permission", ar: "استئذان أمومة", color: "#f472b6" },
  { key: "early_leave", ar: "خروج مبكر", color: "#f97316" },
  { key: "advance", ar: "سلفة", color: "#10b981" },
  { key: "mission", ar: "مهمة خارجية", color: "#8b5cf6" },
  { key: "forgot_punch", ar: "نسيان بصمة", color: "#0ea5e9" },
  { key: "overtime", ar: "عمل إضافي", color: "#014D3D" },
];

export const typeName = (k: string) => REQUEST_TYPES.find((t) => t.key === k)?.ar ?? k;

export const HOURLY: RequestType[] = ["permission", "maternity_permission", "early_leave"];

const PUNCH: Record<string, string> = { in: "دخول", out: "خروج", both: "دخول وخروج" };

export function statusText(r: MyRequest): { text: string; tone: "gr" | "rd" | "am" } {
  if (r.status === "approved") return { text: "موافق", tone: "gr" };
  if (r.status === "rejected") return { text: "مرفوض", tone: "rd" };
  if (r.stage === "manager") return { text: "بانتظار المدير المباشر", tone: "am" };
  if (r.stage === "hr") return { text: "بانتظار الموارد البشرية", tone: "am" };
  return { text: "بانتظار الرئيس التنفيذي", tone: "am" };
}

export function requestDetail(r: MyRequest): string {
  if (r.from_date) return `${r.from_date} ← ${r.to_date} | ${Number(r.days ?? 0)} يوم`;
  if (r.type === "forgot_punch")
    return `${PUNCH[r.punch_kind ?? ""] ?? ""} | ${r.on_date} ${r.time_from ?? ""}${r.time_to ? ` → ${r.time_to}` : ""}`;
  if (r.amount) return `${Number(r.amount).toLocaleString("en-US")} ر.س`;
  return `${r.on_date ?? ""}${r.time_from ? ` ${r.time_from}` : ""}${r.hours ? ` (${Number(r.hours)}س)` : ""}`;
}
