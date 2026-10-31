// Request type names (colours: ARIBA brand palette) and status text of the legacy employee app (LVL + V114 forgot_punch + V21 overtime).
import type { MyRequest, RequestType } from "./api";

export const REQUEST_TYPES: { key: RequestType; ar: string; color: string }[] = [
  { key: "annual", ar: "سنوية", color: "#29B35E" },
  { key: "sick", ar: "مرضية", color: "#B54A4A" },
  { key: "emergency", ar: "اضطرارية", color: "#231F20" },
  { key: "death", ar: "وفاة", color: "#414042" },
  { key: "marriage", ar: "زواج", color: "#231F20" },
  { key: "maternity", ar: "أمومة", color: "#231F20" },
  { key: "paternity", ar: "أبوة", color: "#231F20" },
  { key: "umrah", ar: "عمرة", color: "#1F8D49" },
  { key: "hajj", ar: "حج", color: "#1F8D49" },
  { key: "remote", ar: "عن بعد", color: "#014D3D" },
  { key: "permission", ar: "استئذان", color: "#231F20" },
  { key: "maternity_permission", ar: "استئذان أمومة", color: "#231F20" },
  { key: "early_leave", ar: "خروج مبكر", color: "#231F20" },
  { key: "advance", ar: "سلفة", color: "#1F8D49" },
  { key: "mission", ar: "مهمة خارجية", color: "#014D3D" },
  { key: "forgot_punch", ar: "نسيان بصمة", color: "#414042" },
  { key: "overtime", ar: "عمل إضافي", color: "#014D3D" },
  { key: "unpaid", ar: "إجازة بدون راتب", color: "#231F20" },
  { key: "salary_advance", ar: "طلب راتب مقدم", color: "#1F8D49" },
  { key: "iban_change", ar: "تغيير الآيبان", color: "#014D3D" },
  { key: "profile_edit", ar: "تعديل بيانات", color: "#231F20" },
  { key: "document", ar: "رفع مستند", color: "#414042" },
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
  const p = r.payload ?? {};
  if (r.type === "iban_change") return `IBAN: ${p.iban ?? ""} — ${p.bank ?? ""}`;
  if (r.type === "profile_edit") return Object.entries(p.changes ?? {}).map(([k, v]) => `${k}: ${v}`).join(" | ");
  if (r.type === "document") return String(p.doc_label ?? "");
  if (r.from_date) return `${r.from_date} ← ${r.to_date} | ${Number(r.days ?? 0)} يوم`;
  if (r.type === "forgot_punch")
    return `${PUNCH[r.punch_kind ?? ""] ?? ""} | ${r.on_date} ${r.time_from ?? ""}${r.time_to ? ` → ${r.time_to}` : ""}`;
  if (r.amount) return `${Number(r.amount).toLocaleString("en-US")} ر.س`;
  return `${r.on_date ?? ""}${r.time_from ? ` ${r.time_from}` : ""}${r.hours ? ` (${Number(r.hours)}س)` : ""}`;
}

// Document type keys (ariba_documents.document_type) -> Arabic label; docLabel() never shows the raw English key.
export const DOCL: Record<string, string> = {
  identity: "الهوية / الإقامة", id: "الهوية / الإقامة", passport: "جواز السفر", degree: "شهادة التخرج", graduation: "شهادة التخرج",
  certificate: "شهادة", experience: "شهادة خبرة", cv: "السيرة الذاتية", national_address: "العنوان الوطني", contract: "العقد",
  social_insurance: "شهادة التأمينات", insurance: "التأمين", profile_edit: "مرفق تعديل بيانات", iban_certificate: "شهادة الآيبان",
  iban_letter: "خطاب تغيير الآيبان", employee_upload: "مستند مرفوع من الموظف", letter: "نموذج", signed_document: "مستند موقّع",
  photo: "صورة شخصية", other: "مستند آخر",
};
export const docLabel = (t?: string | null): string => (t && DOCL[t]) || "مستند";
