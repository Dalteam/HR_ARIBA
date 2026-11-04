// The /me employee web area's own routes: the same /me/* endpoints the employee app uses
// (backend/app/routers/me.py, me_requests.py). Same client as the rest of hr-web (lib/api.ts):
// bearer token, refresh, ApiError. Types mirror the API's answers one to one.
import { fetchBlob, request, type Decimal, type IsoDate, type Uuid } from "./api";

// ---------------------------------------------------------------- attendance (me.py)

export type MyAttendanceStatus = "present" | "late" | "absent" | "leave" | "remote";

export interface MySession {
  id: Uuid;
  work_date: IsoDate;
  time_in: string | null;
  time_out: string | null;
  status: MyAttendanceStatus;
  late_minutes: number;
  early_minutes: number;
  location_name: string | null;
  notes: string | null;
}

export interface WorkLocation {
  id: Uuid;
  name: string;
  name_en: string | null;
  type: "hq" | "project" | "remote";
  radius_m: number;
  latitude: number;
  longitude: number;
}

export interface MyAttendance {
  today: MySession[];
  history: MySession[];
  locations: WorkLocation[];
  flexible_enabled: boolean;
  shift_hours: number | null;
  window_start: string | null;
  window_end: string | null;
  work_start: string | null;
  tolerance_minutes: number | null;
  expected_checkout: string | null;
  remote_limit: number;
  remote_used: number;
}

export const myAttendance = () => request<MyAttendance>("/me/attendance");

export const myAttendanceRange = (from: IsoDate, to: IsoDate) =>
  request<MySession[]>("/me/attendance/range", { query: { date_from: from, date_to: to } });

export const punch = (action: "in" | "out", lat: number, lng: number) =>
  request<MySession>("/me/attendance/punch", { method: "POST", body: { action, lat, lng } });

// ---------------------------------------------------------------- my requests (me_requests.py)

/** Every type the employee app sends; the leave types (and mission) carry a period. */
export type MyRequestType =
  | "annual" | "sick" | "emergency" | "death" | "marriage" | "maternity" | "paternity" | "umrah" | "hajj"
  | "remote" | "mission" | "permission" | "maternity_permission" | "early_leave" | "advance" | "forgot_punch"
  | "overtime" | "unpaid" | "salary_advance" | "iban_change" | "profile_edit" | "document";

/** The types the API records with a from/to period (routers/leave.py LEAVE_TYPES + mission). */
export const LEAVE_TYPES = ["annual", "sick", "emergency", "death", "marriage", "paternity", "maternity", "umrah", "hajj", "remote", "mission"] as const;

export interface MyRequest {
  id: Uuid;
  employee_id: Uuid;
  employee_name: string;
  type: MyRequestType;
  status: "pending" | "approved" | "rejected";
  stage: "manager" | "hr" | "ceo" | "completed";
  from_date: IsoDate | null;
  to_date: IsoDate | null;
  /** Counted by the server: workdays for annual leave, calendar days for the rest. */
  days: Decimal | null;
  on_date: IsoDate | null;
  time_from: string | null;
  time_to: string | null;
  hours: Decimal | null;
  amount: Decimal | null;
  punch_kind: "in" | "out" | "both" | null;
  /** the stored request body as the API returns it (Stage 14 reads `from`, `to` and `cancelled`) */
  payload?: { from?: string; to?: string; cancelled?: { reason?: string } } & Record<string, unknown>;
  /** an approved leave that already has a «طلب إلغاء إجازة» waiting (the API refuses a second one) */
  cancel_pending?: boolean;
  notes: string | null;
  rejection_reason: string | null;
  /** the document filed with the request (me.py `_attachment_doc_type`), when there is one */
  attachment_id?: Uuid | null;
  created_at: string;
}

export interface NewMyRequest {
  type: MyRequestType;
  from_date?: IsoDate;
  to_date?: IsoDate;
  /** forgot punch / overtime: the day and the hours */
  on_date?: IsoDate;
  time_from?: string;
  time_to?: string;
  hours?: number;
  amount?: number;
  punch_kind?: "in" | "out" | "both";
  notes?: string;
}

export const myRequests = () => request<MyRequest[]>("/me/requests");

export const submitMyRequest = (body: NewMyRequest) => request<MyRequest>("/me/requests", { method: "POST", body });

export const deleteMyRequest = (id: Uuid) => request<void>(`/me/requests/${id}`, { method: "DELETE" });

// Stage 14: the employee's own leave actions, each behind its switch in HR's leave policy
export interface MyLeavePolicy {
  emp_cancel_pending: boolean;
  emp_edit_pending: boolean;
  emp_request_cancel_approved: boolean;
  allow_advance_balance: boolean;
}
export const myLeavePolicy = () => request<MyLeavePolicy>("/me/leave-policy");
export const cancelMyLeave = (id: Uuid, reason?: string) => request<{ cancelled: boolean }>(`/me/requests/${id}/cancel`, { method: "POST", body: { reason } });
export const editMyLeave = (id: Uuid, from: IsoDate, to: IsoDate) =>
  request<{ days: number }>(`/me/requests/${id}/dates`, { method: "PATCH", body: { from, to } });
export const requestLeaveCancel = (id: Uuid, reason?: string) =>
  request<{ id: string }>(`/me/requests/${id}/cancel-request`, { method: "POST", body: { reason } });
/** The types with a leave row (the API's LEAVE_FORM_TYPES): only these can be cancelled or have their dates changed. */
export const LEAVE_ROW_TYPES = new Set<string>([...LEAVE_TYPES, "unpaid"]);

// ---------------------------------------------------------------- leave balance (me_requests.py)

/** `GET /me/leave`: what the API publishes to the app (the full ledger stays an HR figure). */
export interface MyLeave {
  current: number;
  carry: number;
  year_end: number;
  annual: number;
  upcoming_holidays: { name: string; date: IsoDate; days: number }[];
}

export const myLeave = () => request<MyLeave>("/me/leave");

// ---------------------------------------------------------------- payslips (me_requests.py)

export interface Payslip {
  year: number;
  month: number;
  /** The payslip payload HR approved: plain figures, or the V119 slip with its own keys. */
  data: Partial<Record<
    "salByDays" | "houPay" | "traPay" | "prjPay" | "othPay" | "otherAllow" | "overtime" | "leaveComp" | "eosAmt"
    | "totalDue" | "insEmp" | "loanDeduct" | "otherDeduct" | "net" | "netSAR", number | string | null
  >> & { noInsDeduct?: boolean | null; currency?: string | null };
}

export const myPayslips = () => request<Payslip[]>("/me/payslips");

// ---------------------------------------------------------------- my team and the approvals queue (canonical.py)

/** A direct report: `team_scope.team_members` always returns these four fields; the extra contract,
 *  leave and salary fields appear only with the matching permission, so they are not read here. */
export interface TeamMember {
  id: Uuid;
  emp_no: string;
  name_ar: string;
  job_title: string | null;
}

export const myTeam = () => request<TeamMember[]>("/me/team");

/** The requests waiting for THIS account's decision at their current stage (manager / HR / CEO). */
export const myApprovals = () => request<MyRequest[]>("/me/approvals");

export const decideApproval = (id: Uuid, action: "approve" | "reject", reason?: string) =>
  request<MyRequest>(`/me/approvals/${id}`, { method: "POST", body: { action, reason } });

// ---------------------------------------------------------------- letters sent for my signature (canonical.py)

export interface MyLetter {
  id: Uuid;
  /** `template:onboarding` and the like */
  type: string;
  title: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  responded_at: string | null;
}

/** Where one of my letters stands: `stage` is the furthest stage it reached (`manager`, `hr`, `done` …). */
export interface MySignState {
  request_id: Uuid;
  stage: string;
  needs_manager: boolean | null;
  reject_reason: string | null;
  emp_signed_at: string | null;
  mgr_signed_at: string | null;
}

export const myLetters = () => request<MyLetter[]>("/me/letters");
export const mySignStates = () => request<MySignState[]>("/me/sign/states");

/** The letter's HTML as stored — the route answers `text/html`, so it is read as text. */
export const letterHtml = async (id: Uuid) => (await fetchBlob(`/letters/${id}/html`)).text();

/** Approve without a signature, or object with a reason (three characters at least). */
export const respondMyLetter = (id: Uuid, action: "approved" | "rejected", reason?: string) =>
  request<MyLetter>(`/me/letters/${id}/respond`, { method: "POST", body: { action, reason } });

/** Sign: the letter HTML with the signature drawn into it, base64 — the server cleans it and files the copy. */
export const signMyLetter = (id: Uuid, signedBase64: string) =>
  request<{ next: string; document_id: string }>(`/me/letters/${id}/sign`, { method: "POST", body: { signed_base64: signedBase64 } });

