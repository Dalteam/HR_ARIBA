// المرشحون — the candidates screen, the invites and the medical form (GET/POST /candidates/*).
import { request } from "./api";

export type CandidateStatus = "new" | "accepted" | "rejected";

export interface CandidateFile {
  id: string;
  type: string;
  name: string;
  mime: string;
  size: number | null;
}

export interface CandidateData {
  nameAr?: string;
  nameEn?: string;
  nationality?: string;
  dob?: string;
  gender?: string;
  mobile?: string;
  email?: string;
  idNo?: string;
  idExpiry?: string;
  passportNo?: string;
  passportExpiry?: string;
  position?: string;
  education?: string;
  experienceYears?: string;
  currentEmployer?: string;
  expectedSalary?: string;
  address?: string;
  city?: string;
  bank?: string;
  iban?: string;
  accountNo?: string;
  notes?: string;
  availability?: string;
  inviteLabel?: string;
}

export interface Candidate {
  id: string;
  /** the 24-hex reference the drawer shows */
  ref: string;
  status: CandidateStatus;
  data: CandidateData;
  source: string | null;
  email: string | null;
  submitted_at: string;
  review_note: string | null;
  reviewed_at: string | null;
  employee_id: string | null;
  files: CandidateFile[];
}

export interface CandidateList {
  candidates: Candidate[];
  counts: { new: number; accepted: number; rejected: number; all: number };
  form_key: string | null;
  invite_only: boolean;
  hours: number;
  medical_form: boolean;
}

export interface Invite {
  token: string;
  label: string | null;
  created_at: string;
  expires_at: string;
  opened_at: string | null;
  used_at: string | null;
  revoked_at: string | null;
  candidate: string | null;
  state: "open" | "used" | "expired" | "revoked";
}

export interface InviteList {
  invites: Invite[];
  invite_only: boolean;
  hours: number;
  form_key: string | null;
}

export interface ApplyMode {
  invite_only: boolean;
  hours: number;
  form_key: string | null;
}

export interface MedicalForm {
  name: string | null;
  mime: string | null;
  size: number | null;
  updated: string | null;
  notify_ids: string[];
  has_file: boolean;
}

/** The body the accept dialog sends: the new employee (POST /employees) plus the decision note. */
export interface AcceptInput {
  employee: Record<string, unknown>;
  note?: string | null;
}

export const STATUS_LABEL: Record<CandidateStatus, string> = {
  new: "بانتظار المراجعة",
  accepted: "مقبول",
  rejected: "مرفوض",
};

export const STATUS_CLASS: Record<CandidateStatus, string> = { new: "ba", accepted: "bg", rejected: "br" };

export const FILE_LABEL: Record<string, string> = {
  photo: "صورة",
  cv: "السيرة الذاتية",
  id: "الهوية/الإقامة",
  passport: "الجواز",
  experience: "شهادة خبرة",
  certificate: "شهادة تخرج",
  national_address: "العنوان الوطني",
  insurance: "شهادة التأمينات",
  other: "أخرى",
};

/** The twenty-one fields the drawer prints, in the design's order. */
export const FIELDS: [keyof CandidateData, string][] = [
  ["nameAr", "الاسم"], ["nameEn", "بالإنجليزي"], ["nationality", "الجنسية"], ["dob", "الميلاد"],
  ["mobile", "الجوال"], ["email", "البريد الإلكتروني"], ["idNo", "الهوية/الإقامة"], ["idExpiry", "انتهاؤها"],
  ["passportNo", "الجواز"], ["passportExpiry", "انتهاؤه"], ["position", "الوظيفة"], ["education", "المؤهل"],
  ["experienceYears", "سنوات الخبرة"], ["currentEmployer", "جهة العمل الحالية"], ["expectedSalary", "الراتب المتوقع"],
  ["availability", "جاهزية المباشرة"], ["city", "المدينة"], ["address", "العنوان"], ["bank", "البنك"],
  ["iban", "الآيبان"], ["notes", "ملاحظات"],
];

export const listCandidates = (status?: CandidateStatus) =>
  request<CandidateList>("/candidates", { query: { status } });

export const candidateByRef = (ref: string) =>
  request<{ candidate: Candidate }>(`/candidates/${encodeURIComponent(ref)}`);

export const candidateFile = (fileId: string) =>
  request<{ name: string; mime: string; base64: string }>(`/candidates/files/${fileId}`);

export const acceptCandidate = (id: string, input: AcceptInput) =>
  request<{ candidate_id: string; employee_id: string; moved: number; status: string }>(`/candidates/${id}/accept`, {
    method: "POST",
    body: input,
  });

export const rejectCandidate = (id: string, note: string) =>
  request<{ candidate_id: string; status: string; note: string }>(`/candidates/${id}/reject`, {
    method: "POST",
    body: { note },
  });

export const listInvites = () => request<InviteList>("/candidates/invites");

export const createInvite = (label: string, hours: number) =>
  request<{ token: string; label: string | null; expires_at: string; hours: number }>("/candidates/invites", {
    method: "POST",
    body: { label, hours },
  });

export const revokeInvite = (token: string) =>
  request<{ token: string; revoked: boolean }>(`/candidates/invites/${token}/revoke`, { method: "POST" });

export const setApplyMode = (inviteOnly: boolean, hours: number) =>
  request<ApplyMode>("/candidates/apply-mode", { method: "PUT", body: { invite_only: inviteOnly, hours } });

export const rotateApplyKey = () => request<{ form_key: string }>("/candidates/apply-key", { method: "POST" });

export const getMedicalForm = () => request<MedicalForm>("/candidates/medical-form");

export const setMedicalForm = (file: { name: string; mime: string; base64: string } | null) =>
  request<{ name?: string; mime?: string; size?: number; removed?: boolean }>("/candidates/medical-form", {
    method: "PUT",
    body: file ?? { remove: true },
  });

export const setNotifyList = (ids: string[]) =>
  request<{ ids: string[] }>("/candidates/notify-list", { method: "PUT", body: { ids } });

const applyBase = () => (typeof window === "undefined" ? "" : `${window.location.origin}/apply`);

/** The public form the candidate opens: `{base}/apply?k=<form_key>`. */
export const applyUrl = (formKey: string | null) =>
  formKey ? `${applyBase()}?k=${encodeURIComponent(formKey)}` : "";

/** The one-time link HR sends: `{base}/apply?i=<invite token>`. */
export const inviteUrl = (token: string) => `${applyBase()}?i=${encodeURIComponent(token)}`;

/** The base64 of a picked file, for the uploads the API takes as JSON. */
export function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذر قراءة الملف"));
    reader.onload = () => resolve(String(reader.result || "").replace(/^data:[^,]*,/, ""));
    reader.readAsDataURL(file);
  });
}

/** Stage 22, the design's «التسجيل التلقائي للمرشحين» (`candidate_auto`): off by default. */
export interface AutoCfg {
  on: boolean;
  employer: string;
  department: string;
  nature: "indefinite" | "fixed";
}

export interface AutoRun {
  on: boolean;
  registered: number;
  employees?: { candidate_id: string; employee_id: string; name: string }[];
  failed: { candidate_id: string; name: string; reason: string }[];
  busy?: boolean;
}

export const getAutoCfg = () => request<AutoCfg>("/candidates/auto");
export const setAutoCfg = (cfg: AutoCfg) => request<AutoCfg>("/candidates/auto", { method: "PUT", body: cfg });
export const runAuto = () => request<AutoRun>("/candidates/auto/run", { method: "POST" });
