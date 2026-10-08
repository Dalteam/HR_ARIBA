// The ONLY place that calls fetch, and the home of every API type.

import { LANG_COOKIE } from "./prefs";
import { clearSession, getAccessToken, getRefreshToken, readCookie, saveSession } from "./session";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// --------------------------------------------------------------------------- types

export type Role = "employee" | "manager" | "finance" | "hr" | "ceo" | "admin";
export type EmployeeCategory = "active" | "tamheer" | "training" | "consultant" | "hourly";
export type WpsType = "wps" | "trainee" | "tamheer" | "external" | "consultant" | "no_wps" | "remote";
export type GosiSystem = "matching" | "non_matching" | "non_saudi";
export type Currency = "SAR" | "USD" | "EUR" | "EGP";
export type PaymentMethod = "mudad" | "bank_transfer" | "international_transfer" | "cash";
export type ContractNature = "fixed" | "indefinite";
export type Gender = "male" | "female";
export type Religion = "muslim" | "other";
export type MaritalStatus = "single" | "married" | "divorced" | "widowed";
export type TerminationArticle =
  | "art_84" | "art_74" | "art_74_death" | "art_74_retirement" | "art_85"
  | "art_75" | "art_77" | "art_80" | "art_53";
export type EmployeeTab = "all" | "active" | "terminated" | "tamheer" | "training" | "consultants" | "saudi" | "expat";

/** Decimal values are sent as strings to avoid floating-point errors. */
export type Decimal = string;
/** ISO date, YYYY-MM-DD. */
export type IsoDate = string;
export type Uuid = string;

export interface EmployeeBrief {
  id: Uuid;
  emp_no: string;
  name_ar: string;
  name_en: string | null;
}

export interface User {
  id: Uuid;
  username: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  employee: EmployeeBrief | null;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

export interface TemporaryPassword {
  user: User;
  temporary_password: string;
}

export interface Lookup {
  id: Uuid;
  code: string;
  name_ar: string;
  name_en: string;
}

export interface Nationality extends Lookup {
  is_saudi: boolean;
}

export interface Lookups {
  workplaces: Lookup[];
  departments: Lookup[];
  nationalities: Nationality[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface EmployeeListItem {
  id: Uuid;
  emp_no: string;
  name_ar: string;
  name_en: string | null;
  job_title: string | null;
  category: EmployeeCategory;
  nationality: Lookup | null;
  is_saudi: boolean;
  workplace: Lookup | null;
  department: Lookup | null;
  national_id_masked: string | null;
  join_date: IsoDate | null;
  contract_end_date: IsoDate | null;
  termination_date: IsoDate | null;
  is_terminated: boolean;
  national_id_expiry: IsoDate | null;
  years_of_service: Decimal;
  national_id_days_left: number | null;
  contract_days_left: number | null;
  /** null unless the caller may see salaries */
  total_salary: Decimal | null;
  net_salary: Decimal | null;
  currency: Currency | null;
  has_photo: boolean;
}

export interface EmployeeCounts {
  all: number;
  active: number;
  terminated: number;
  tamheer: number;
  training: number;
  consultants: number;
  saudi: number;
  expat: number;
  saudization_pct: Decimal;
}

export interface Salary {
  basic_salary: Decimal;
  housing_allowance: Decimal;
  transport_allowance: Decimal;
  project_allowance: Decimal;
  other_allowances: Decimal;
  extra_allowance: Decimal;
  other_deductions: Decimal;
  total_salary: Decimal;
  gosi_employee: Decimal;
  gosi_employer: Decimal;
  net_salary: Decimal;
  net_salary_sar: Decimal;
  eos_award: Decimal | null;
  currency: Currency;
  exchange_rate: Decimal;
  gosi_system: GosiSystem;
  payment_method: PaymentMethod;
  bank_name: string | null;
  iban: string | null;
}

export interface Employee {
  id: Uuid;
  emp_no: string;
  name_ar: string;
  name_en: string | null;
  birth_date: IsoDate | null;
  gender: Gender | null;
  religion: Religion | null;
  marital_status: MaritalStatus | null;
  mobile: string | null;
  email: string | null;
  national_address: string | null;
  nationality: Nationality | null;
  is_saudi: boolean;
  workplace: Lookup | null;
  department: Lookup | null;
  job_title: string | null;
  manager: EmployeeBrief | null;
  sponsor: string | null;
  category: EmployeeCategory;
  wps_type: WpsType;
  national_id: string | null;
  national_id_expiry: IsoDate | null;
  passport_no: string | null;
  passport_expiry: IsoDate | null;
  insurance_company: string | null;
  insurance_class: string | null;
  insurance_card_no: string | null;
  insurance_expiry: IsoDate | null;
  contract_nature: ContractNature;
  contract_duration_months: number | null;
  join_date: IsoDate | null;
  contract_end_date: IsoDate | null;
  annual_leave_days: number;
  exclude_from_payroll: boolean;
  exclude_from_eos: boolean;
  termination_date: IsoDate | null;
  termination_article: TerminationArticle | null;
  termination_reason: string | null;
  is_terminated: boolean;
  notes: string | null;
  salary: Salary | null;
  years_of_service: Decimal;
  has_photo: boolean;
  ids_masked: boolean;
  expiry_days: { national_id: number | null; passport: number | null; insurance: number | null; contract: number | null };
  has_account: boolean;
  created_at: string;
  updated_at: string;
}

/** Body for create/update. Empty strings are sent as null. */
export interface EmployeeInput {
  emp_no?: string;
  name_ar?: string;
  name_en?: string | null;
  birth_date?: IsoDate | null;
  gender?: Gender | null;
  religion?: Religion | null;
  marital_status?: MaritalStatus | null;
  mobile?: string | null;
  email?: string | null;
  national_address?: string | null;
  nationality_id?: Uuid | null;
  workplace_id?: Uuid;
  department_id?: Uuid | null;
  job_title?: string | null;
  manager_id?: Uuid | null;
  sponsor?: string | null;
  category?: EmployeeCategory;
  wps_type?: WpsType;
  bank_name?: string | null;
  iban?: string | null;
  national_id?: string | null;
  national_id_expiry?: IsoDate | null;
  passport_no?: string | null;
  passport_expiry?: IsoDate | null;
  insurance_company?: string | null;
  insurance_class?: string | null;
  insurance_card_no?: string | null;
  insurance_expiry?: IsoDate | null;
  contract_nature?: ContractNature;
  contract_duration_months?: number | null;
  join_date?: IsoDate;
  annual_leave_days?: number;
  basic_salary?: Decimal;
  housing_allowance?: Decimal;
  transport_allowance?: Decimal;
  project_allowance?: Decimal;
  other_allowances?: Decimal;
  extra_allowance?: Decimal;
  other_deductions?: Decimal;
  currency?: Currency;
  exchange_rate?: Decimal;
  gosi_system?: GosiSystem;
  payment_method?: PaymentMethod;
  exclude_from_payroll?: boolean;
  exclude_from_eos?: boolean;
  notes?: string | null;
}

export interface SalaryPreviewInput {
  basic_salary: Decimal;
  housing_allowance: Decimal;
  transport_allowance: Decimal;
  project_allowance: Decimal;
  other_allowances: Decimal;
  extra_allowance: Decimal;
  other_deductions: Decimal;
  currency: Currency;
  exchange_rate: Decimal;
  gosi_system: GosiSystem;
  nationality_id: Uuid | null;
  wps_type: WpsType;
  category: EmployeeCategory;
  birth_date: IsoDate | null;
}

export interface SalaryPreview {
  total_salary: Decimal;
  gosi_employee: Decimal;
  gosi_employer: Decimal;
  net_salary: Decimal;
  net_salary_sar: Decimal;
  gosi_system: GosiSystem;
}

export interface CountItem {
  name_ar: string;
  name_en: string;
  count: number;
}

export interface Dashboard {
  current: number;
  saudi: number;
  expat: number;
  saudization_pct: Decimal;
  payroll_total: Decimal | null;
  male: number;
  female: number;
  gender_unspecified: number;
  terminated: number;
  tamheer: number;
  pending_requests: number;
  departments: CountItem[];
  nationalities: CountItem[];
  workplaces: (CountItem & { salary_total: Decimal | null })[];
  alerts: {
    employee: EmployeeBrief;
    kind: "iqama" | "passport" | "insurance" | "contract";
    expires_on: IsoDate;
    days_left: number;
    level: "expired" | "urgent" | "soon";
  }[];
  payroll_summary: { year: number; month: number } | null;
}

export type DocumentType =
  | "iqama" | "passport" | "insurance" | "contract" | "graduation_certificate" | "experience_certificate"
  | "gosi_certificate" | "cv" | "national_address" | "photo" | "letter" | "other";

export interface DocumentFile {
  id: Uuid;
  employee_id: Uuid | null;
  dependent_id: Uuid | null;
  type: DocumentType;
  title: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export type DependentRelation = "wife" | "husband" | "son" | "daughter" | "father" | "mother";

export interface DependentInput {
  relation?: DependentRelation;
  name_ar?: string;
  name_en?: string | null;
  birth_date?: IsoDate | null;
  national_id?: string | null;
  national_id_expiry?: IsoDate | null;
  passport_no?: string | null;
  passport_expiry?: IsoDate | null;
  insurance_company?: string | null;
  insurance_card_no?: string | null;
  insurance_expiry?: IsoDate | null;
  mobile?: string | null;
}

export interface Dependent extends Required<DependentInput> {
  id: Uuid;
  employee_id: Uuid;
  documents: DocumentFile[];
}

export interface TerminateInput {
  termination_date: IsoDate;
  article: TerminationArticle;
  reason?: string | null;
}

// --------------------------------------------------------------------------- errors

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown = null,
    public requestId: string | null = null,
  ) {
    super(message);
  }

  /** Field-level errors from a 422 response, keyed by field name. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as FieldError[]) if (d?.field) out[d.field] = d.message;
    }
    return out;
  }
}

// --------------------------------------------------------------------------- request

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
  /** Skip the bearer token (login/refresh). */
  anonymous?: boolean;
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const s = await request<Session>("/auth/refresh", {
        method: "POST",
        body: { refresh_token: refreshToken },
        anonymous: true,
      });
      saveSession(s.access_token, s.refresh_token, s.expires_in, s.user.must_change_password);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(API_URL + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const { error } = await res.json();
    return new ApiError(res.status, error.code, error.message, error.details, error.request_id);
  } catch {
    return new ApiError(res.status, "error", res.statusText || "Request failed");
  }
}

/** multipart/form-data upload (documents, photo). */
export async function upload<T>(path: string, form: FormData, method: "POST" | "PUT" = "POST", retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(buildUrl(path), { method, headers, body: form, cache: "no-store" });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the server");
  }
  if (res.status === 401 && !retried && (await refreshSession())) return upload<T>(path, form, method, true);
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Fetch a protected file (photo, document) as a Blob, with the bearer token. */
export async function fetchBlob(path: string, retried = false): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(buildUrl(path), { headers, cache: "no-store" });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the server");
  }
  if (res.status === 401 && !retried && (await refreshSession())) return fetchBlob(path, true);
  if (!res.ok) throw await parseError(res);
  return res.blob();
}

export async function request<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": readCookie(LANG_COOKIE) ?? "ar",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (!opts.anonymous) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the server");
  }

  if (res.status === 401 && !opts.anonymous && !retried) {
    if (await refreshSession()) return request<T>(path, opts, true);
    clearSession();
    if (typeof window !== "undefined" && !/\/login$/.test(location.pathname)) {
      // Full reload on purpose: the session is gone, so drop all in-memory app state too.
      const login = location.pathname.startsWith("/me") ? "/me/login" : "/login";
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      location.assign(`${login}?next=${encodeURIComponent(location.pathname)}`);
    }
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
