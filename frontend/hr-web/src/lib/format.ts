// Number and date formats as the prototypes showed them.

const n2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fixed2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "16,000 ر.س" / "-1,612.5 ر.س" (prototype `toLocaleString` + " ر.س"). */
export function sar(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${n2.format(Number(value))} ر.س`;
}

/** "14,387.50 SAR" — the net column in the employees table. */
export function sarFixed(value: string | number | null | undefined, code = "SAR"): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${fixed2.format(Number(value))} ${code}`;
}

/** "12,000.00 ر.س" — employee app salary rows. */
export function sar2(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${fixed2.format(Number(value))} ر.س`;
}

export function num(value: string | number, digits = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(value));
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m, d];
}

/** "1/3/1995" — HR details window (prototype `toLocaleDateString`). */
export function dmy(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = parts(iso);
  return `${d}/${m}/${y}`;
}

/** "01/03/1995" — employee app. */
export function ddmmyyyy(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = parts(iso);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** "الأحد، 4 أكتوبر 2026" — top-bar date, Gregorian with Latin digits, in Riyadh time. */
export function longToday(lang: "ar" | "en"): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-ca-gregory-nu-latn" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Riyadh",
  }).format(new Date());
}

/** Today's date in Riyadh as YYYY-MM-DD. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
}

/** Two-letter avatar initials as the prototype drew them ("سارة أحمد" -> "سأ"). */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("");
}
