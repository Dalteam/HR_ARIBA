// صفحة التقديم — the anonymous side of the candidates screen: five calls, no session.
//
// `GET /public/apply/{form_key}`, `GET /public/apply/invite/{token}`, the two submits and the medical form.
// Everything here is `anonymous: true`, so the API client neither sends a token nor tries to refresh one.
import { request } from "./api";
import type { CandidateData } from "./candidates";

export interface ApplyFile {
  type: string;
  name: string;
  mime: string;
  base64: string;
}

export type InviteStatus = "ok" | "used" | "expired" | "revoked" | "invalid";

export interface InviteState {
  status: InviteStatus;
  label: string | null;
  expires_at: string | null;
  medical_form: boolean;
}

export interface OpenFormState {
  ok: boolean;
  invite_only: boolean;
  reason: "invite_only" | "closed" | null;
  company: { name_ar: string; name_en: string };
  medical_form: boolean;
}

export const openForm = (formKey: string) =>
  request<OpenFormState>(`/public/apply/${encodeURIComponent(formKey)}`, { anonymous: true });

export const inviteState = (token: string) =>
  request<InviteState>(`/public/apply/invite/${encodeURIComponent(token)}`, { anonymous: true });

export const submitOpen = (formKey: string, data: CandidateData, files: ApplyFile[], honeypot = "") =>
  request<{ ref: string; files: number }>(`/public/apply/${encodeURIComponent(formKey)}`, {
    method: "POST",
    anonymous: true,
    body: { data, files, website: honeypot },
  });

export const submitInvite = (token: string, data: CandidateData, files: ApplyFile[], honeypot = "") =>
  request<{ ref: string; files: number }>(`/public/apply/invite/${encodeURIComponent(token)}`, {
    method: "POST",
    anonymous: true,
    body: { data, files, website: honeypot },
  });

export const publicMedicalForm = (params: { formKey?: string; invite?: string }) =>
  request<{ ok: boolean; file: { name: string; mime: string; base64: string } | null }>(
    "/public/apply/medical-form",
    { anonymous: true, query: { form_key: params.formKey, invite: params.invite } },
  );

/** The upload types the form offers, in the order a candidate thinks of them. */
export const UPLOAD_TYPES: [string, string][] = [
  ["cv", "السيرة الذاتية"],
  ["photo", "صورة شخصية"],
  ["id", "الهوية / الإقامة"],
  ["passport", "جواز السفر"],
  ["experience", "شهادة خبرة"],
  ["certificate", "شهادة تخرج"],
  ["national_address", "العنوان الوطني"],
  ["insurance", "شهادة التأمينات"],
  ["other", "أخرى"],
];

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 6 * 1024 * 1024;
