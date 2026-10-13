// Amount in words (التفقيط) — same rules and results as the legacy aribaTafqeet (V68):
// riyals + halalas, groups of millions/thousands with singular/dual/plural, "لا غير" when there are no halalas.

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TENS = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const TEENS = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const out: string[] = [];
  if (h) out.push(HUNDREDS[h]);
  if (r >= 10 && r < 20) out.push(TEENS[r - 10]);
  else {
    const parts = [ONES[r % 10], TENS[Math.floor(r / 10)]].filter(Boolean);
    if (parts.length) out.push(parts.join(" و"));
  }
  return out.join(" و");
}

const GROUPS = [
  { div: 1_000_000, single: "مليون", dual: "مليونان", plural: "ملايين" },
  { div: 1_000, single: "ألف", dual: "ألفان", plural: "آلاف" },
  { div: 1, single: "", dual: "", plural: "" },
];

function integerWords(n: number): string {
  n = Math.floor(n);
  if (n === 0) return "صفر";
  const parts: string[] = [];
  for (const g of GROUPS) {
    const v = Math.floor(n / g.div) % 1000;
    if (!v) continue;
    let txt = threeDigits(v);
    if (g.single) {
      if (v === 1) txt = g.single;
      else if (v === 2) txt = g.dual;
      else txt = `${txt} ${v <= 10 ? g.plural : g.single}`;
    }
    parts.push(txt);
  }
  return parts.join(" و");
}

export function aribaTafqeet(amount: number): string {
  let riyals = Math.floor(Number(amount) || 0);
  let halalas = Math.round(((Number(amount) || 0) - riyals) * 100);
  if (halalas === 100) {
    riyals += 1;
    halalas = 0;
  }
  return `${integerWords(riyals)} ريال سعودي` + (halalas > 0 ? ` و${integerWords(halalas)} هللة` : " لا غير");
}
