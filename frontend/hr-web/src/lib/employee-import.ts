// Turning rows of an import file into our API's employee bodies, and checking each row BEFORE anything is
// written: the design's Import.jsx built a whole employee record and saved it; ours validates against what
// POST/PATCH /employees accept (backend/app/schemas.py), so a bad file cannot half-write.
//
// Two honest differences from the design, both because our API hides what the old one showed:
//  • an existing employee is recognised by employee number only (the list masks the ID and shows no e-mail);
//  • the design's «update existing» checkbox becomes a PATCH that carries only the columns the file has, so a
//    column that is empty in the file never blanks a saved value.

import type { EmployeeInput, EmployeeListItem, Lookup, Lookups } from "./api";
import { FIELDS, conv, digits, nn, type FieldKey, type Values } from "./import-xlsx";

export type Action = "new" | "update" | "skip" | "error";

export interface Plan {
  /** the file's row number (the header is row 1) */
  row: number;
  v: Values;
  action: Action;
  /** the row will not be sent */
  issues: string[];
  /** it will be sent, but something was dropped or guessed */
  warns: string[];
  existing: EmployeeListItem | null;
  /** the request body, when the row can be sent */
  body: EmployeeInput | null;
}

export interface Ctx {
  lookups: Lookups;
  /** every employee (the list is fetched page by page), to find an existing number and a manager by name */
  employees: EmployeeListItem[];
  /** the design's checkbox: update the employee that already exists instead of skipping it */
  update: boolean;
  /** the dialog's language: (arabic, english) */
  t: (ar: string, en: string) => string;
}

/** A number key that ignores "emp" and leading zeros: emp010 and 10 and EMP-010 are the same employee. */
const noKey = (v: unknown) => {
  const d = digits(v).replace(/\D/g, "");
  return d ? String(Number(d)) : nn(v);
};

const saudiAliases = /^(سعودي|سعوديه|سعودية|saudi|sa|ksa|saudi arabia|saudi arabian)$/;

/** A master-list row by its Arabic or English name; a Saudi alias resolves to the Saudi nationality. */
function findLookup(list: Lookup[], text: unknown, nationality = false): Lookup | null {
  const key = nn(text);
  if (!key) return null;
  const exact = list.find((l) => nn(l.name_ar) === key || nn(l.name_en) === key);
  if (exact) return exact;
  if (nationality && saudiAliases.test(key)) {
    const saudi = (list as (Lookup & { is_saudi?: boolean })[]).find((l) => l.is_saudi);
    if (saudi) return saudi;
  }
  if (key.length < 3) return null;
  return list.find((l) => nn(l.name_ar).includes(key) || nn(l.name_en).includes(key) || key.includes(nn(l.name_ar))) || null;
}

const findEmployeeByName = (list: EmployeeListItem[], text: unknown) => {
  const key = nn(text);
  if (!key) return null;
  return list.find((e) => nn(e.name_ar) === key || (e.name_en && nn(e.name_en) === key)) || null;
};

/** The employee a row belongs to, from its number; null when the file has no number or it is a new one. */
export function matchEmployee(employees: EmployeeListItem[], empNo: unknown): EmployeeListItem | null {
  const key = noKey(empNo);
  if (!key) return null;
  return employees.find((e) => noKey(e.emp_no) === key) || null;
}

const MOBILE = /^\+?[0-9 ]{7,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;
const EMP_NO = /^[A-Za-z]{0,5}\d{1,10}$/;

/** "10" or "EMP-010" -> "emp010", our house format; anything else is left for the row check to reject. */
const normalEmpNo = (v: unknown) => {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const d = digits(raw).replace(/\D/g, "");
  if (!d) return raw.toLowerCase();
  if (/^[A-Za-z]{0,5}[\s-]*\d+$/.test(raw)) return "emp" + (d.length < 3 ? d.padStart(3, "0") : d);
  return raw.toLowerCase();
};

/** Our category (the employees list's tabs) follows the employee type, as the design's empkind.js did. */
const categoryOf = (wps: unknown) => (wps === "tamheer" ? "tamheer" : wps === "trainee" ? "training" : wps === "consultant" ? "consultant" : "active");

/** Design column -> our API field, for the plain text ones. */
const TEXT: [FieldKey, keyof EmployeeInput][] = [
  ["iqamaNo", "national_id"],
  ["iqamaExpiry", "national_id_expiry"],
  ["dob", "birth_date"],
  ["jobTitle", "job_title"],
  ["mobile", "mobile"],
  ["email", "email"],
  ["contractJoin", "join_date"],
  ["passportNo", "passport_no"],
  ["passportExpiry", "passport_expiry"],
  ["sponsor", "sponsor"],
  ["bank", "bank_name"],
  ["iban", "iban"],
];

/** Design column -> our API field, for the money ones (sent as strings, as the API expects). */
const MONEY: [FieldKey, keyof EmployeeInput][] = [
  ["salary", "basic_salary"],
  ["housingAllowance", "housing_allowance"],
  ["transportAllowance", "transport_allowance"],
  ["projectAllowance", "project_allowance"],
  ["otherAllowance", "other_allowances"],
  ["extraAllowance", "extra_allowance"],
  ["otherDeductions", "other_deductions"],
];

const money = (n: number) => String(Math.round(Math.max(0, n) * 100) / 100);

export interface Built {
  body: EmployeeInput;
  /** something was dropped or guessed, but the row can still be sent */
  warns: string[];
  /** names in the file that our master lists do not have */
  missing: { employer?: string; nationality?: string; department?: string; manager?: string };
}

/** The request body for one row: the resolved master-list ids plus every column that is understood. */
export function build(v: Values, ctx: Ctx, forUpdate: boolean): Built {
  const { t } = ctx;
  const body: EmployeeInput = {};
  const warns: string[] = [];

  const nameAr = String(v.nameAr ?? "").trim() || String(v.nameEn ?? "").trim();
  const nameEn = String(v.nameEn ?? "").trim();
  if (nameAr.length >= 2) body.name_ar = nameAr;
  else if (nameAr) warns.push(t(`الاسم «${nameAr}» أقصر من حرفين — اتساب`, `Name "${nameAr}" is shorter than two letters — left out`));
  if (nameEn) body.name_en = nameEn;

  if (!forUpdate) {
    const no = normalEmpNo(v.empNo);
    if (no && EMP_NO.test(no)) body.emp_no = no;
  }

  const missing: Built["missing"] = {};
  const wp = findLookup(ctx.lookups.workplaces, v.employer);
  if (wp) body.workplace_id = wp.id;
  else if (v.employer) missing.employer = String(v.employer).trim();

  const nat = findLookup(ctx.lookups.nationalities, v.nationality, true) as (Lookup & { is_saudi?: boolean }) | null;
  if (nat) body.nationality_id = nat.id;
  else if (v.nationality) missing.nationality = String(v.nationality).trim();

  const dep = findLookup(ctx.lookups.departments, v.dept);
  if (dep) body.department_id = dep.id;
  else if (v.dept) missing.department = String(v.dept).trim();

  const mgr = findEmployeeByName(ctx.employees, v.manager);
  if (mgr) body.manager_id = mgr.id;
  else if (v.manager) missing.manager = String(v.manager).trim();

  for (const [from, to] of TEXT) {
    const raw = v[from];
    if (raw === undefined || raw === "") continue;
    if (to === "mobile" && !MOBILE.test(String(raw))) {
      warns.push(t(`الجوال «${raw}» غير صالح — اتساب`, `Mobile "${raw}" is not valid — left out`));
      continue;
    }
    if (to === "email" && !EMAIL.test(String(raw))) {
      warns.push(t(`البريد «${raw}» غير صالح — اتساب`, `E-mail "${raw}" is not valid — left out`));
      continue;
    }
    if (to === "iban" && !IBAN.test(String(raw))) {
      warns.push(t(`الآيبان «${raw}» غير صالح — اتساب`, `IBAN "${raw}" is not valid — left out`));
      continue;
    }
    body[to] = String(raw) as never;
  }

  for (const [from, to] of MONEY) {
    const raw = v[from];
    if (raw === undefined || raw === "") continue;
    body[to] = money(Number(raw)) as never;
  }

  const months = Number(v.contractDuration ?? 0);
  if (months > 0) body.contract_duration_months = months;
  const leave = Number(v.leaveDaysContract ?? -1);
  if (leave >= 0) body.annual_leave_days = leave;

  const nature = String(v.contractNature ?? (months > 0 ? "fixed" : "")) as "fixed" | "indefinite" | "";
  if (nature) body.contract_nature = nature;

  const gosi = String(v.insSystem ?? "");
  if (gosi === "matching" || gosi === "non_matching" || gosi === "non_saudi") {
    if (nat?.is_saudi && gosi === "non_saudi") {
      warns.push(t("الجنسية سعودية ونظام التأمينات مكتوب «غير سعودي» — اتحوّل إلى «يطابق»", "A Saudi employee cannot be on the non-Saudi GOSI system — set to matching"));
      body.gosi_system = "matching";
    } else body.gosi_system = gosi;
  }

  const wps = String(v.wpsType ?? "");
  if (wps) {
    body.wps_type = wps as never;
    // the list's tab comes from the employee type on a new record; an existing one keeps the category HR chose
    if (!forUpdate) body.category = categoryOf(wps) as never;
  }

  const pay = String(v.payMethod ?? "");
  if (pay) body.payment_method = pay as never;

  const currency = String(v.currency ?? "");
  if (currency) body.currency = currency as never;

  const rate = Number(v.exchRate ?? 0);
  if (rate > 0) body.exchange_rate = String(rate);
  if (currency && currency !== "SAR" && !(rate > 0)) warns.push(t("العملة أجنبية وسعر الصرف ناقص — خُد 1", "Foreign currency without an exchange rate — taken as 1"));

  const religion = String(v.religion ?? "");
  if (religion) body.religion = religion as never;

  return { body, warns, missing };
}

/**
 * Every data row of the chosen sheet, checked: what it will do (new / update / skip / rejected), why, and the
 * body to send. Nothing here calls the API; the dialog shows this list and only then sends.
 */
export function planRows(body: string[][], map: (FieldKey | "")[], ctx: Ctx): Plan[] {
  const { t } = ctx;
  const seenNo = new Map<string, number>();
  const seenId = new Map<string, number>();
  const plans: Plan[] = [];

  body.forEach((rawRow, index) => {
    const v: Values = {};
    const issues: string[] = [];
    const warns: string[] = [];

    map.forEach((k, ci) => {
      if (!k) return;
      const raw = rawRow[ci];
      if (raw == null || String(raw).trim() === "") return;
      const val = conv(k, raw);
      if (val === "") {
        const field = FIELDS.find((f) => f.k === k);
        warns.push(t(`قيمة غير مفهومة في «${field?.ar ?? k}» (${String(raw).slice(0, 20)})`, `Unrecognised value in "${field?.ar ?? k}" (${String(raw).slice(0, 20)})`));
        return;
      }
      v[k] = val;
    });

    // outside what the API accepts for these numbers: drop the cell and say so
    const months = Number(v.contractDuration ?? 0);
    if (months > 120) {
      warns.push(t("مدة العقد أكبر من 120 شهر — اتشالت", "Contract duration over 120 months — left out"));
      delete v.contractDuration;
    }
    const leave = Number(v.leaveDaysContract ?? -1);
    if (leave > 60) {
      warns.push(t("الإجازة السنوية أكبر من 60 يوم — اتشالت", "Annual leave over 60 days — left out"));
      delete v.leaveDaysContract;
    }

    const keyNo = v.empNo ? noKey(v.empNo) : "";
    const keyId = v.iqamaNo ? String(v.iqamaNo) : "";
    const existing = keyNo ? matchEmployee(ctx.employees, v.empNo) : null;
    const willUpdate = !!existing && ctx.update;

    if (!willUpdate) {
      // what POST /employees insists on
      if (String(v.nameAr ?? v.nameEn ?? "").trim().length < 2) issues.push(t("الاسم ناقص", "The name is missing"));
      if (!v.employer) issues.push(t("جهة العمل مطلوبة", "The employer is required"));
      if (!v.contractJoin) issues.push(t("تاريخ المباشرة مطلوب", "The joining date is required"));
    }
    if (v.empNo && !EMP_NO.test(normalEmpNo(v.empNo))) issues.push(t(`الرقم الوظيفي «${v.empNo}» غير مقبول (مثال emp047)`, `Employee number "${v.empNo}" is not accepted (like emp047)`));
    if (v.iqamaNo && !/^\d{10}$/.test(String(v.iqamaNo))) issues.push(t("رقم الهوية لازم 10 أرقام", "The ID must be 10 digits"));
    if (v.contractNature === "fixed" && !(months >= 1)) issues.push(t("العقد محدد المدة ومحتاج عدد الشهور", "A fixed-term contract needs its months"));

    if ((keyNo && seenNo.has(keyNo)) || (keyId && seenId.has(keyId))) issues.push(t("مكرر جوه الملف (نفس الرقم الوظيفي أو الهوية)", "Duplicate inside the file (same number or ID)"));
    if (keyNo) seenNo.set(keyNo, index);
    if (keyId) seenId.set(keyId, index);

    const built = build(v, ctx, willUpdate);
    warns.push(...built.warns);
    if (built.missing.employer) issues.push(t(`جهة العمل «${built.missing.employer}» مش في قوائمنا`, `Employer "${built.missing.employer}" is not in our lists`));
    if (built.missing.nationality) warns.push(t(`الجنسية «${built.missing.nationality}» مش في قوائمنا — اتسابت فاضية`, `Nationality "${built.missing.nationality}" is not in our lists — left empty`));
    if (built.missing.department) warns.push(t(`القسم «${built.missing.department}» مش في قوائمنا — اتساب فاضي`, `Department "${built.missing.department}" is not in our lists — left empty`));
    if (built.missing.manager) warns.push(t(`المدير «${built.missing.manager}» مش موجود — اتساب فاضي`, `Manager "${built.missing.manager}" was not found — left empty`));

    if (!willUpdate && v.salary === undefined) warns.push(t("الراتب الأساسي ناقص — هيبدأ بصفر", "Basic salary missing — will start at zero"));
    else if (!willUpdate && Number(v.salary) <= 0) warns.push(t("الراتب الأساسي صفر", "Basic salary is zero"));
    if (!v.nationality && !willUpdate) warns.push(t("الجنسية ناقصة", "Nationality missing"));

    let action: Action = issues.length ? "error" : existing ? (ctx.update ? "update" : "skip") : "new";
    let send: EmployeeInput | null = action === "new" || action === "update" ? (built.body as EmployeeInput) : null;
    if (action === "update" && Object.keys(built.body).length === 0) {
      action = "skip";
      send = null;
      warns.push(t("مفيش عمود يتحدّث", "No column to update"));
    }

    plans.push({ row: index + 2, v, action, issues, warns, existing, body: send });
  });

  return plans;
}

