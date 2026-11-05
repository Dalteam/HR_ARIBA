// Shared by the design's finance pages (insurance calculator, provisions report): a payroll month and the leave taken
// up to a date, both for OUR payroll engine (lib/calc/payroll.ts), so these pages compute exactly as the payroll does.
import { request } from "../api";
import { USED_CACHE, usedQueries, type MonthCtx, type PayRow } from "./payroll";

export const MN_AR = ["", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export const MN_EN = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthCtx(y: number, m: number): MonthCtx {
  const days = new Date(y, m, 0).getDate();
  return { y, m, days, start: new Date(y, m - 1, 1), end: new Date(y, m - 1, days) };
}

/** Fills the engine's cache of leave days used up to each ending row's last day (OUR /leave/used-through). */
export async function fillUsed(rows: PayRow[], m: MonthCtx): Promise<void> {
  const q = usedQueries(rows, m);
  if (!q.length) return;
  const res = await request<Record<string, number>>("/leave/used-through", { method: "POST", body: q });
  Object.entries(res).forEach(([k, v]) => USED_CACHE.set(k, v));
  q.forEach((x) => { if (!USED_CACHE.has(`${x.employee_id}|${x.end}`)) USED_CACHE.set(`${x.employee_id}|${x.end}`, 0); });
}

export const p2 = (n: number) => String(n).padStart(2, "0");
export const money = (n: unknown) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
/** a CSV with a BOM so Excel opens the Arabic text correctly; formula-looking cells are prefixed */
export function saveCsv(name: string, head: (string | number)[], rows: (string | number)[][]) {
  const cell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const blob = new Blob(["﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
