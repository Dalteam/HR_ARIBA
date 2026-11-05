// The Arabic / English names of the request and document types the employee area shows, in one place so a
// type reads the same on every tab (the design's Leaves.jsx `lvName`, plus the V114 forgot-punch and the V21
// overtime types and the letter templates of canonical.py `template:<type>`).

export const REQ_LABEL: Record<string, [string, string]> = {
  annual: ["سنوية", "Annual"],
  sick: ["مرضية", "Sick"],
  emergency: ["اضطرارية", "Emergency"],
  death: ["وفاة", "Bereavement"],
  marriage: ["زواج", "Marriage"],
  paternity: ["أبوة", "Paternity"],
  maternity: ["أمومة", "Maternity"],
  umrah: ["عمرة", "Umrah"],
  hajj: ["حج", "Hajj"],
  remote: ["عن بعد", "Remote"],
  mission: ["مهمة خارجية", "Mission"],
  permission: ["استئذان", "Permission"],
  maternity_permission: ["استئذان أمومة", "Maternity permission"],
  early_leave: ["انصراف مبكر", "Early leave"],
  advance: ["سلفة", "Salary advance"],
  forgot_punch: ["نسيان بصمة", "Forgot punch"],
  overtime: ["عمل إضافي", "Overtime"],
  unpaid: ["بدون راتب", "Unpaid leave"],
  salary_advance: ["راتب مقدم", "Salary advance"],
  iban_change: ["تغيير الآيبان", "IBAN change"],
  profile_edit: ["تعديل بيانات", "Profile edit"],
  document: ["مستند", "Document"],
};

/** A letter HR sent for a signature: `template:onboarding` reads «مباشرة عمل». */
export const TEMPLATE_LABEL: Record<string, [string, string]> = {
  onboarding: ["مباشرة عمل", "Start of employment"],
  custody: ["استلام عهدة تقنية", "IT equipment custody"],
  extension: ["تمديد فترة التجربة", "Probation extension"],
  termination: ["إشعار إنهاء فترة التجربة", "Probation termination notice"],
  clearance: ["مخالصة نهائية", "Final clearance"],
  experience: ["شهادة خبرة", "Experience certificate"],
  evaluation: ["تقييم أداء", "Performance evaluation"],
  contract_end: ["إشعار انتهاء العقد", "Contract-end notice"],
  salary_cert: ["شهادة راتب", "Salary certificate"],
};

const pick = (m: Record<string, [string, string]>, key: string, lang: "ar" | "en") => m[key]?.[lang === "en" ? 1 : 0];

export const reqLabel = (type: string, lang: "ar" | "en") => pick(REQ_LABEL, type, lang) ?? type;

/** The type part of `template:<type>`, named, or the whole string when it is not a known template. */
export const letterLabel = (type: string, lang: "ar" | "en") => {
  const key = String(type || "").replace(/^template:/, "");
  return pick(TEMPLATE_LABEL, key, lang) ?? key;
};
