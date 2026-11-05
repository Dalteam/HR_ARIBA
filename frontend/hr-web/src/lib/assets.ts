// الأصول الثابتة والعهد — the register's data (GET /assets, add, edit, delete, custody) and the design's own
// depreciation maths (pages/finance/Assets.jsx: monthsDep, accDep, inRegister, rate, yearReport), unchanged:
// straight-line monthly on (cost − salvage) from the month of purchase, stopping after the month of disposal;
// a custody item that is not capitalised is never depreciated. The server stores, the browser computes.
import { request } from "./api";
import { r2 } from "./calc/month";

export type AssetCategory = "computers" | "electronics" | "vehicles" | "furniture" | "equipment" | "software" | "other";
export type AssetStatus = "active" | "sold" | "disposed" | "lost";

export interface Asset {
  id: string;
  asset_no: string;
  name: string;
  category: AssetCategory;
  serial_no: string | null;
  model: string | null;
  location: string | null;
  condition: string | null;
  notes: string | null;
  capitalized: boolean;
  acquisition_date: string;
  cost: number;
  salvage_value: number;
  useful_life_months: number;
  status: AssetStatus;
  disposal_date: string | null;
  disposal_value: number;
  custodian_employee_id: string | null;
  custodian_name: string | null;
  custody_date: string | null;
}

export interface CustodyMove {
  id: number;
  asset_id: string;
  employee_id: string | null;
  action: "assign" | "return";
  at_date: string;
  notes: string | null;
  by_employee: string | null;
}

export interface AssetPerson {
  employee_id: string;
  name_ar: string;
  name_en: string | null;
  emp_no: string;
}

export interface AssetList {
  assets: Asset[];
  log: CustodyMove[];
  can_edit: boolean;
  /** who custody can go to (editing roles only; names only) */
  people: AssetPerson[];
}

export interface AssetInput {
  name: string;
  category: AssetCategory;
  serial_no: string;
  acquisition_date: string;
  cost: number;
  salvage_value: number;
  useful_life_months: number;
  location: string;
  condition: string;
  status: AssetStatus;
  disposal_date: string;
  disposal_value: number;
  notes: string;
  capitalized: boolean;
}

/** [Arabic, English, default life in years] — the design's CAT. */
export const CAT: Record<AssetCategory, [string, string, number]> = {
  computers: ["أجهزة وحاسبات", "Computers", 4],
  electronics: ["أجهزة إلكترونية", "Electronics", 4],
  vehicles: ["سيارات", "Vehicles", 5],
  furniture: ["أثاث", "Furniture", 10],
  equipment: ["معدات", "Equipment", 5],
  software: ["برمجيات", "Software", 3],
  other: ["أخرى", "Other", 5],
};
export const CATS = Object.keys(CAT) as AssetCategory[];

export const STS: Record<AssetStatus, [string, string]> = {
  active: ["قيد الاستخدام", "Active"],
  sold: ["مباع", "Sold"],
  disposed: ["مستبعد", "Disposed"],
  lost: ["مفقود", "Lost"],
};
export const STATUSES = Object.keys(STS) as AssetStatus[];

export const listAssets = () => request<AssetList>("/assets");
export const createAsset = (body: AssetInput) => request<Asset>("/assets", { method: "POST", body });
export const updateAsset = (id: string, body: AssetInput) => request<Asset>(`/assets/${id}`, { method: "PUT", body });
export const deleteAsset = (id: string) => request<{ id: string; deleted: boolean }>(`/assets/${id}`, { method: "DELETE" });
export const moveCustody = (id: string, body: { employee_id: string | null; date: string; notes: string | null }) =>
  request<Asset>(`/assets/${id}/custody`, { method: "POST", body });

// ---------------------------------------------------------------------- the design's maths, as written there

const num = (v: unknown) => Number(v) || 0;
/** "YYYY-MM-DD" → a local Date, or null (the design's pd). */
export const pd = (s: string | null | undefined): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const ym = (d: Date) => d.getFullYear() * 12 + d.getMonth();

type Dep = Pick<Asset, "capitalized" | "acquisition_date" | "status" | "disposal_date" | "useful_life_months" | "cost" | "salvage_value">;

export function monthsDep(a: Dep, asOf: Date): number {
  if (!a || a.capitalized === false) return 0;
  const s = pd(a.acquisition_date);
  if (!s) return 0;
  let end = ym(asOf);
  const disp = pd(a.disposal_date);
  if (a.status && a.status !== "active" && disp) end = Math.min(end, ym(disp));
  return Math.max(0, Math.min(num(a.useful_life_months), end - ym(s) + 1));
}

export function accDep(a: Dep, asOf: Date): number {
  const life = num(a.useful_life_months) || 1, base = num(a.cost) - num(a.salvage_value), m = monthsDep(a, asOf);
  return m >= life ? r2(base) : r2((base * m) / life);
}

export function inRegister(a: Dep, asOf: Date): boolean {
  const s = pd(a.acquisition_date);
  if (!s || s > asOf) return false;
  const disp = pd(a.disposal_date);
  if (a.status && a.status !== "active" && disp && disp <= asOf) return false;
  return true;
}

export function rate(a: Dep): number {
  if (a.capitalized === false) return 0;
  const base = num(a.cost) - num(a.salvage_value), life = num(a.useful_life_months) || 1;
  return num(a.cost) > 0 ? (base / num(a.cost)) * (12 / life) * 100 : 0;
}

export const REPORT_KEYS = ["opening", "additions", "disposals", "closeCost", "accOpen", "charge", "accDisp", "accClose", "nbvOpen", "nbvClose", "gl"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];
export type ReportFigures = Record<ReportKey, number>;
export interface ReportRow extends ReportFigures {
  a: Asset;
  dispInY: boolean;
}

/** The annual fixed-asset inventory for year Y (the design's yearReport). */
export function yearReport(assets: Asset[], Y: number) {
  const y0 = new Date(Y, 0, 1), yE = new Date(Y, 11, 31), yPrev = new Date(Y - 1, 11, 31), rows: ReportRow[] = [];
  assets.forEach((a) => {
    const acq = pd(a.acquisition_date);
    if (!acq || acq > yE) return;
    const disp = a.status && a.status !== "active" && a.disposal_date ? pd(a.disposal_date) : null;
    if (disp && disp < y0) return;
    const cost = num(a.cost), opening = acq < y0 ? cost : 0, additions = acq >= y0 ? cost : 0;
    const dispInY = !!(disp && disp >= y0 && disp <= yE), disposals = dispInY ? cost : 0;
    const accOpen = acq < y0 ? accDep(a, yPrev) : 0, accEnd = accDep(a, yE), charge = r2(accEnd - accOpen);
    const accDisp = dispInY ? accEnd : 0, accClose = r2(accEnd - accDisp), closeCost = r2(opening + additions - disposals);
    const gl = dispInY ? r2(num(a.disposal_value) - (cost - accEnd)) : 0;
    rows.push({ a, opening, additions, disposals, closeCost, accOpen: r2(accOpen), charge, accDisp: r2(accDisp), accClose, nbvOpen: r2(opening - accOpen), nbvClose: r2(closeCost - accClose), gl, dispInY });
  });
  const z = (): ReportFigures => Object.fromEntries(REPORT_KEYS.map((k) => [k, 0])) as ReportFigures;
  const cats: Partial<Record<AssetCategory, ReportFigures & { n: number }>> = {}, tot = z();
  rows.forEach((r) => {
    const c = r.a.category || "other";
    const bucket = (cats[c] = cats[c] || { ...z(), n: 0 });
    bucket.n++;
    REPORT_KEYS.forEach((k) => {
      bucket[k] = r2(bucket[k] + r[k]);
      tot[k] = r2(tot[k] + r[k]);
    });
  });
  return { rows, cats, tot };
}
