// Saved working sheets (backend/app/routers/sheets.py). The payroll month key is `pay_YYYY_MM`;
// `data` holds the row array (the legacy `hr7_pay_YYYY_MM` rows) and `approved` is the sheet flag.
import { request } from "./api";

export interface Sheet {
  key: string;
  data: unknown;
  approved: boolean;
  approved_at: string | null;
  updated_at: string | null;
}

export const getSheet = (key: string) => request<Sheet>(`/sheets/${key}`);

export const putSheet = (key: string, data: unknown) =>
  request<Sheet>(`/sheets/${key}`, { method: "PUT", body: { data } });

export const approveSheet = (key: string) => request<Sheet>(`/sheets/${key}/approve`, { method: "POST" });

export const unapproveSheet = (key: string) => request<Sheet>(`/sheets/${key}/unapprove`, { method: "POST" });

export const listSheets = (prefix: string) => request<Sheet[]>(`/sheets`, { query: { prefix } });
