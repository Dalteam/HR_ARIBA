// بطاقات العمل — the business cards screen's data (GET /bizcards, the two saves, and my own card).
import { request } from "./api";
import type { CardCfg, CardDesign } from "./bizcard";

export interface BizcardEmployee {
  id: string;
  employee_id: string;
  emp_no: string;
  name_ar: string;
  name_en: string | null;
  job_title: string | null;
  department: string | null;
  employer: string | null;
  mobile: string | null;
  email: string | null;
  has_photo: boolean;
}

export interface BizcardData {
  /** the company design, or null before HR has saved one */
  design: CardDesign | null;
  cfg: Partial<CardCfg>;
  /** `company_logo`: `{data, mime}` and `data` is already a data: URL */
  logo: { data?: string; mime?: string } | string | null;
  names: { coAr?: string; coEn?: string } | null;
  overrides: Record<string, CardDesign>;
  employees: BizcardEmployee[];
  can_edit: boolean;
}

export const getBizcards = () => request<BizcardData>("/bizcards");

export const saveCompanyDesign = (body: { design?: CardDesign; cfg?: CardCfg }) =>
  request<{ design: CardDesign | null; cfg: Partial<CardCfg> }>("/bizcards", { method: "PUT", body });

/** `design: null` puts the employee back on the company design. */
export const saveEmployeeDesign = (employeeId: string, design: CardDesign | null) =>
  request<{ employee_id: string; design: CardDesign | null; deleted?: boolean }>(
    `/bizcards/${encodeURIComponent(employeeId)}`,
    { method: "PUT", body: { design } },
  );

/** The logo as a data: URL, whichever shape the settings hold it in. */
export function logoUrl(logo: BizcardData["logo"]): string | null {
  if (!logo) return null;
  if (typeof logo === "string") return logo.startsWith("data:") ? logo : null;
  const data = logo.data;
  return typeof data === "string" && data.startsWith("data:") ? data : null;
}

export const companyNames = (names: BizcardData["names"]) => ({ ar: names?.coAr || "", en: names?.coEn || "" });
