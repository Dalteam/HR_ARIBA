import { request } from "./api";

export interface DocRow {
  id: string;
  emp_no: string;
  name_ar: string;
  workplace: string | null;
  nationality: string | null;
  national_id: string | null;
  national_id_expiry: string | null;
  national_id_days: number | null;
  passport_no: string | null;
  passport_expiry: string | null;
  passport_days: number | null;
  insurance_company: string | null;
  insurance_class: string | null;
  insurance_card_no: string | null;
  insurance_expiry: string | null;
  insurance_days: number | null;
  contract_type: string;
  join_date: string | null;
  contract_end_date: string | null;
  contract_days: number | null;
}

export const listDocRegistry = () => request<DocRow[]>("/registry/documents");
