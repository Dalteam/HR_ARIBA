// سلة المهملات — the recycle bin's data (GET /recycle-bin, restore, permanent delete).
import { request } from "./api";

export type BinCategory = "employee" | "workflow_request" | "hr_leave" | "other";

export interface BinItem {
  id: string;
  kind: string;
  category: BinCategory;
  ref_id: string | null;
  employee_id: string | null;
  emp_name: string | null;
  title: string | null;
  detail: string | null;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_role: string | null;
  /** the three kinds that can be put back; a document or a duplicate account is «للأرشيف فقط» */
  restorable: boolean;
}

export interface BinList {
  items: BinItem[];
  counts: Record<BinCategory, number>;
  total: number;
}

export const CATEGORIES: { key: BinCategory; ar: string; icon: string }[] = [
  { key: "employee", ar: "الموظفون المحذوفون", icon: "ti-user-x" },
  { key: "workflow_request", ar: "الطلبات المحذوفة", icon: "ti-file-x" },
  { key: "hr_leave", ar: "الإجازات المحذوفة", icon: "ti-calendar-x" },
  { key: "other", ar: "أخرى (سجلات مكررة)", icon: "ti-copy-x" },
];

export const listBin = () => request<BinList>("/recycle-bin");

export const restoreItem = (id: string) =>
  request<{ id: string; kind: string; ref_id: string | null; restored: boolean }>(`/recycle-bin/${id}/restore`, {
    method: "POST",
  });

export interface PurgeInput {
  ids?: string[];
  /** ISO date-time: everything deleted before it (with `kind`, only that kind) */
  before?: string;
  kind?: string;
}

export const purgeBin = (input: PurgeInput) =>
  request<{ purged: number }>("/recycle-bin/purge", { method: "POST", body: input });

/** The design's error mapping: the API's codes turned into the sentence the screen shows. */
export function restoreError(code: string): string {
  switch (code) {
    case "employee_exists":
      return "الموظف موجود بالفعل";
    case "employee_missing":
      return "استرجع الموظف أولًا ثم استرجع طلبه";
    case "request_exists":
      return "الطلب موجود بالفعل — لا يمكن استرجاعه مرتين";
    case "kind_not_restorable":
      return "هذا العنصر للأرشيف فقط — لا يمكن استرجاعه";
    case "bin_item_not_found":
      return "العنصر لم يبق في السلة";
    default:
      return "تعذر الاسترجاع";
  }
}
