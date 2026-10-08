// Salary basis rows (GET /salary/basis) — raw salary fields per employee for finance/HR screens.
import { request } from "./api";

export interface SalaryBasisRow {
  id: string;
  emp_no: string;
  name_ar: string;
  workplace: string | null;
  department: string | null;
  job_title: string | null;
  nationality: string | null;
  is_saudi: boolean;
  birth_date: string | null;
  category: string;
  wps_type: string;
  gosi_system: string;
  join_date: string | null;
  contract_duration_months: number | null;
  contract_end_date: string | null;
  annual_leave_days: number;
  basic_salary: string;
  housing_allowance: string;
  transport_allowance: string;
  project_allowance: string;
  other_allowances: string;
  extra_allowance: string;
  other_deductions: string;
  currency: string;
  exchange_rate: string;
  payment_method: string;
  bank_name: string | null;
  iban: string | null;
  exclude_from_payroll: boolean;
  exclude_from_eos: boolean;
  is_terminated: boolean;
  termination_date: string | null;
  termination_article: string | null;
  termination_reason: string | null;
  total_salary: string;
  gosi_employee: string;
  net_salary: string;
  years_of_service: string;
  eos_basic: string;
}

export const getSalaryBasis = () => request<SalaryBasisRow[]>("/salary/basis");

/** Legacy `fN`: 0 / empty shows "0", otherwise en-US with up to 2 decimals. */
export const fN = (n: number | string | null | undefined) =>
  n ? Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0";

/** Legacy `aEmps()`: current (not terminated) employees. */
export const current = (rows: SalaryBasisRow[]) => rows.filter((e) => !e.is_terminated);

/** Effective GOSI rates as fractions (percentage / 100), legacy payroll-engine shape. */
export interface GosiRates {
  matchEmp: number;
  matchEmp55: number;
  matchEr: number;
  matchEr55: number;
  noMatchEmp: number;
  noMatchEmp55: number;
  noMatchEr: number;
  noMatchEr55: number;
  nonSaudiEr: number;
  cap: number;
  ageThr: number;
}

export const getGosiRates = (on: string) =>
  request<{
    match_emp: number;
    match_emp_55: number;
    match_er: number;
    match_er_55: number;
    no_match_emp: number;
    no_match_emp_55: number;
    no_match_er: number;
    no_match_er_55: number;
    non_saudi_er: number;
    cap: number;
    age_thr: number;
  }>("/settings/gosi-rates", { query: { on } }).then((r) => ({
    matchEmp: r.match_emp,
    matchEmp55: r.match_emp_55,
    matchEr: r.match_er,
    matchEr55: r.match_er_55,
    noMatchEmp: r.no_match_emp,
    noMatchEmp55: r.no_match_emp_55,
    noMatchEr: r.no_match_er,
    noMatchEr55: r.no_match_er_55,
    nonSaudiEr: r.non_saudi_er,
    cap: r.cap,
    ageThr: r.age_thr,
  }));
