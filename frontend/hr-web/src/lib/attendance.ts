// Attendance (الحضور والانصراف) — manual records through the backend attendance router.
import { request } from "./api";

export type AttendanceStatus = "present" | "late" | "absent" | "leave" | "remote";

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  workplace: string | null;
  work_date: string;
  time_in: string | null;
  time_out: string | null;
  location_id: string | null;
  location_name: string | null;
  status: AttendanceStatus;
  late_minutes: number;
  early_minutes: number;
  source: "app" | "manual";
  notes: string | null;
}

export interface AttendanceSummary {
  employee_id: string;
  employee_name: string;
  present: number;
  late: number;
  absent: number;
  leave: number;
  remote: number;
}

export interface AttendanceInput {
  employee_id: string;
  work_date: string;
  time_in?: string | null;
  time_out?: string | null;
  location_id?: string | null;
  status?: AttendanceStatus;
  notes?: string | null;
}

export const listAttendance = (date: string) => request<AttendanceRecord[]>("/attendance", { query: { date } });

export const listAttendanceSummary = (month: string) => request<AttendanceSummary[]>("/attendance/summary", { query: { month } });

export const upsertAttendance = (body: AttendanceInput) => request<AttendanceRecord>("/attendance", { method: "POST", body });

export const updateAttendance = (id: string, body: Partial<AttendanceInput>) =>
  request<AttendanceRecord>(`/attendance/${id}`, { method: "PATCH", body });

export const deleteAttendance = (id: string) => request<void>(`/attendance/${id}`, { method: "DELETE" });

export const listAttendanceRange = (date_from: string, date_to: string) =>
  request<AttendanceRecord[]>("/attendance/range", { query: { date_from, date_to } });
