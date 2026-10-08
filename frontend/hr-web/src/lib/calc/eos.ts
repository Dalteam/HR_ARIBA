// End-of-service page by article — port of `rEOS` / `calcByLaw` in
// frontend/legacy/hr-portal/js/calculations/04-eos-page-by-law.js (docs section 4.5.2).

export type EosLaw = "m84" | "m74" | "m85" | "m75" | "m77" | "m80" | "m74r" | "m74d";

export const EOS_LAWS: { value: EosLaw; label: string }[] = [
  { value: "m84", label: "م.84 — إنهاء من الشركة" },
  { value: "m74", label: "م.74 — اتفاق الطرفين" },
  { value: "m85", label: "م.85 — استقالة" },
  { value: "m75", label: "م.75 — استقالة قسرية" },
  { value: "m77", label: "م.77 — فصل تعسفي" },
  { value: "m80", label: "م.80 — فصل تأديبي" },
  { value: "m74r", label: "م.74(4) — تقاعد" },
  { value: "m74d", label: "م.74(3) — وفاة/عجز" },
];

export const EOS_LAW_NAMES: Record<EosLaw, string> = {
  m84: "م.84 إنهاء الشركة",
  m74: "م.74 اتفاق",
  m85: "م.85 استقالة",
  m75: "م.75 قسرية",
  m77: "م.77 تعسفي",
  m80: "م.80 تأديبي",
  m74r: "م.74(4) تقاعد",
  m74d: "م.74(3) وفاة",
};

const r2 = (x: number) => Math.round(x * 100) / 100;

export function eosYears(join: string | null, end: Date, fallback = 0): number {
  if (!join) return fallback;
  return Math.max(0, Math.round(((end.getTime() - new Date(join).getTime()) / (365.25 * 24 * 3600 * 1000)) * 100) / 100);
}

export function calcByLaw(sal: number, hou: number, yrs: number, sel: EosLaw): number {
  const base = sal + hou;
  const y1 = Math.min(yrs, 5);
  const y2 = Math.max(0, yrs - 5);
  const eos84 = r2((base / 2) * y1 + base * y2);
  if (sel === "m84" || sel === "m74" || sel === "m74r" || sel === "m74d") return eos84;
  if (sel === "m85" || sel === "m75") {
    if (yrs < 2) return 0;
    if (yrs < 5) return r2(eos84 / 3);
    if (yrs < 10) return r2((eos84 * 2) / 3);
    return eos84;
  }
  if (sel === "m77") {
    const c77 = Math.max(Math.round(base * 2), Math.round((base / 30) * 15 * yrs));
    return r2(eos84 + c77);
  }
  return 0;
}

/** "N سنة N شهر N يوم" exactly as the page builds it. */
export function durationText(join: string, endD: Date): string {
  const d1 = new Date(join);
  let fy = endD.getFullYear() - d1.getFullYear();
  if (endD.getMonth() < d1.getMonth() || (endD.getMonth() === d1.getMonth() && endD.getDate() < d1.getDate())) fy--;
  let tmp = new Date(d1.getFullYear() + fy, d1.getMonth(), d1.getDate());
  let fm = 0;
  while (new Date(tmp.getFullYear(), tmp.getMonth() + 1, tmp.getDate()) <= endD) {
    tmp = new Date(tmp.getFullYear(), tmp.getMonth() + 1, tmp.getDate());
    fm++;
  }
  const fd = Math.round((endD.getTime() - tmp.getTime()) / 86400000) + 1;
  return `${fy} سنة ${fm} شهر ${fd} يوم`;
}
