// The routes added for the features of their employee app (ARIBA_Employee_React/src/employee): the new request types
// with attachments, delegation, the direct manager's team / requests / on-behalf, tasks and meetings, goals, document
// signing, push tokens and the company brand. Same client (src/lib/api.ts): bearer token, refresh, ApiError.
import { api } from "./api";

const post = <T>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body) });

export type Attachment = { name: string; mime: string; data: string };

/** Their ariba_submit_request: any type, its payload, one optional attachment (base64). */
export const submitRequest = (type: string, payload: Record<string, unknown>, attachment?: Attachment | null) =>
  post<{ id: string }>("/me/requests", { type, payload: { ...payload, type }, ...(attachment ? { attachment } : {}) });

// ---------------------------------------------------------------- my requests in their shape
export type PortRequest = {
  id: string;
  request_type: string;
  status: "pending" | "approved" | "rejected";
  current_stage: string;
  payload: Record<string, any>;
  reject_reason: string | null;
  employee_name?: string;
  rejection_reason?: string | null;
  created_at: string;
};

// ---------------------------------------------------------------- delegation (sql/16)
export type Delegation = { manager_id: string | null; manager_name?: string; active: boolean };
export const delegation = {
  get: () => api<Delegation>("/me/delegation"),
  set: (active: boolean) => put<{ active: boolean }>("/me/delegation", { active }),
};

// ---------------------------------------------------------------- direct manager
export type ManagerPerms = {
  is_manager: boolean;
  team_count: number;
  perms: Record<"view_team" | "view_team_data" | "view_team_salary" | "view_team_leaves" | "view_team_requests" | "submit_for_team"
    | "approve_requests" | "manage_targets" | "evaluate_team", boolean>;
};
export type TeamMember = {
  id: string; emp_no: string; name_ar: string; name_en: string | null; job_title: string | null; department: string | null;
  employer?: string | null; join_date?: string | null; nationality?: string | null; mobile?: string | null; email?: string | null;
  contract_end?: string | null; iqama_expiry?: string | null; salary_total?: number | null; leave_balance?: number | null;
  delegated?: boolean; leaves?: { id: string; type: string; from: string; to: string; days: number; status: string }[];
};
export const manager = {
  perms: () => api<ManagerPerms>("/me/manager-perms"),
  team: () => api<TeamMember[]>("/me/team"),
  requests: () => api<PortRequest[]>("/me/team/requests"),
  submitFor: (employeeId: string, type: string, payload: Record<string, unknown>) =>
    post<PortRequest>(`/me/team/${encodeURIComponent(employeeId)}/requests`, { type, payload: { ...payload, type } }),
};

// ---------------------------------------------------------------- tasks and meetings, team availability
export type Task = {
  id: string; batch_id: string; kind: "task" | "meeting"; title: string; details: string | null; due_date: string | null;
  start_at: string | null; end_at: string | null; location: string | null; status: "open" | "done" | "accepted" | "declined" | "cancelled";
  response_note: string | null; from_id: string; from_name: string | null; to_id: string; to_name: string | null; created_at: string;
};
export type Availability = {
  items: { id: string; name: string; job: string | null; dept: string | null; leaves: { from: string; to: string; days: number; type: string }[] }[];
  today: string;
  allowed: boolean;
};
export const tasks = {
  list: (box: "inbox" | "sent") => api<{ items: Task[] }>(`/tasks?box=${box}`),
  send: (b: { to: string[]; kind: "task" | "meeting"; title: string; details?: string | null; due?: string | null; start?: string | null; end?: string | null; location?: string | null }) =>
    post<{ sent: number }>("/tasks", b),
  update: (id: string, status: Task["status"], note?: string) => post<{ ok: boolean }>(`/tasks/${encodeURIComponent(id)}/update`, { status, note }),
  availability: () => api<Availability>("/team/availability"),
};

// ---------------------------------------------------------------- goals (their lib/goals.js)
export type Target = {
  id: string; employee_id: string; period_type: "annual" | "quarterly" | "monthly"; period_key: string; title: string;
  description: string | null; unit: string | null; target_value: number | null; actual_value: number | null; weight: number; status: string;
};
export type Evaluation = {
  id: string; employee_id: string; period_type: string; period_key: string; items: { title: string; score: number; weight: number }[];
  comments: string | null; overall: number | null; rating: string | null; status: "draft" | "pending" | "approved";
};
export type EvalItem = { target_id?: string; title: string; target?: number | null; unit?: string; actual?: number | null; weight: number | string;
  score: number | string; comment?: string; manual?: boolean };
export const goals = {
  mine: () => api<{ targets: Target[]; evaluations: Evaluation[] }>("/me/goals"),
  targets: (employeeId: string, year: string) => api<{ targets: Target[] }>(`/targets?employee_id=${encodeURIComponent(employeeId)}&year=${year}`),
  saveTarget: (t: Partial<Target> & { employee_id: string; period_type: string; period_key: string; title: string }) => post<{ target: Target }>("/targets", { target: t }),
  deleteTarget: (id: string) => api<{ ok: boolean }>(`/targets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  evaluation: (employeeId: string, type: string, key: string) =>
    api<{ evaluation: (Evaluation & { items: EvalItem[] }) | null; targets: Target[]; can_approve: boolean }>(`/evaluations/${encodeURIComponent(employeeId)}/${type}/${key}`),
  saveEvaluation: (employeeId: string, type: string, key: string, items: EvalItem[], comments: string, submit: boolean) =>
    put<{ evaluation: Evaluation }>(`/evaluations/${encodeURIComponent(employeeId)}/${type}/${key}`, { items, comments, submit }),
  approve: (id: string) => post<{ ok: boolean }>(`/evaluations/${encodeURIComponent(id)}/approve`, {}),
};

// ---------------------------------------------------------------- documents and signing
export type DocContent = { id: string; file_name: string; mime_type: string; base64: string };
export type SignState = { request_id: string; stage: "manager" | "hr" | "rejected"; needs_manager: boolean; reject_reason: string | null;
  emp_signed_at: string | null; mgr_signed_at: string | null };
export type ManagerPending = { request_id: string; document_id: string; employee_id: string; employee_name: string; emp_signed_at: string; template_type: string };
export const docs = {
  content: (id: string) => api<DocContent>(`/documents/${encodeURIComponent(id)}/content`),
  states: () => api<SignState[]>("/me/sign/states"),
  employeeSign: (requestId: string, b: { document_id: string | null; template_type: string; signed_base64: string }) =>
    post<{ next: "manager" | "hr" | "done"; document_id: string }>(`/me/letters/${encodeURIComponent(requestId)}/sign`, b),
  managerPending: () => api<ManagerPending[]>("/me/sign/pending"),
  managerSign: (requestId: string, b: { action: "approved" | "rejected"; signed_base64?: string; reason?: string }) =>
    post<{ ok: boolean; next: "hr" | "done" | "rejected" }>(`/me/sign/${encodeURIComponent(requestId)}`, b),
};

// ---------------------------------------------------------------- push, brand
export const push = {
  register: (token: string, platform: string) => post<{ ok: boolean }>("/me/push-token", { token, platform }),
  unregister: (token?: string) => api<{ ok: boolean }>("/me/push-token", { method: "DELETE", body: JSON.stringify(token ? { token } : {}) }),
};
export type Brand = { brand: { p?: string; s?: string; a?: string; hero?: string; heroImage?: string; reset?: boolean; punch?: string }; names: { coAr?: string; coEn?: string }; logo: string | null; appLogo?: string | null };
export const brandInfo = () => api<Brand>("/public/brand");

/** Calendar days (their calendarDays). */
export function calendarDays(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z"), b = Date.parse(to + "T00:00:00Z");
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 86400000) + 1 : 0;
}

/** Their workdays() for annual leave: Sunday to Thursday, official holidays out — the rule of the API
 *  (`services/leave.py` is_workday + request_days). The composer shows «سيتبقى» with it so it cannot promise a balance
 *  the server then refuses; the server stays the judge of what is stored. */
export function workdays(from: string, to: string, holidays: { date: string; days?: number; recurring?: boolean }[] = []): number {
  const a = Date.parse(from + "T00:00:00Z"), b = Date.parse(to + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  const off = holidayDates(holidays, new Date(a).getUTCFullYear(), new Date(b).getUTCFullYear());
  let n = 0;
  for (let t = a; t <= b; t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() !== 5 && d.getUTCDay() !== 6 && !off.has(d.toISOString().slice(0, 10))) n++;   // Friday, Saturday = weekend
  }
  return n;
}

/** Every date the announced holidays cover between two years, a recurring row projected the way the engine does it
 *  (a 29 February holiday falls on 1 March in a year without one) and each row's extra days counted. */
function holidayDates(holidays: { date: string; days?: number; recurring?: boolean }[], y1: number, y2: number): Set<string> {
  const out = new Set<string>();
  const add = (iso: string, days: number) => {
    const t = Date.parse(iso + "T00:00:00Z");
    if (!Number.isFinite(t)) return;
    for (let i = 0; i < days; i++) out.add(new Date(t + i * 86400000).toISOString().slice(0, 10));
  };
  for (const h of holidays) {
    const base = (h.date || "").slice(0, 10);
    const [, m, d] = base.split("-").map(Number);
    const days = Math.max(1, Number(h.days) || 1);
    add(base, days);
    if (h.recurring && m && d) {
      for (let y = y1; y <= y2; y++) {
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const iso = d <= last ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : `${y}-03-01`;   // the engine rolls 29 Feb to 1 Mar
        add(iso, days);
      }
    }
  }
  return out;
}
