// The payroll's Excel file and printed sheet in the updated design's form (its pages/payroll/output.js), on OUR
// row fields (lib/calc/payroll.ts). Excel carries real formulas (salary by days, totals, net, SUMIF by currency and
// payment method); the printed sheet has a column chooser remembered in this browser. Every printed value is escaped.
import { currencyLabel, isLocalCurrency, MONTHS_AR, money, num, rowValue, sums, type PayRow } from "./payroll";
import { buildXlsx, colL } from "../xlsx";

type Cell = string | number | { f: string; v: number };
export const MONTHS_EN = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const short = (s: string) => String(s || "").split(" ").slice(0, 3).join(" ");
/** the row's rate to riyals (1 for riyal rows) */
export const fxOf = (r: PayRow) => (isLocalCurrency(r.currency) ? 1 : num(r.exchRate) > 0 ? num(r.exchRate) : num(r.net) && num(r.netSAR) ? num(r.netSAR) / num(r.net) : 1);
/** every row in one currency (a currency-net total is only meaningful then) */
export const sameCur = (rows: PayRow[]) => new Set(rows.map((r) => r.currency || "SAR")).size <= 1;
const curName = (r: PayRow) => (isLocalCurrency(r.currency) ? "ريال سعودي" : currencyLabel(r.currency));

/** Excel with formulas: `cols` are the on-screen column titles in order, `sumcol` maps a title to its total key. */
export function payrollXlsx(rows: PayRow[], heads: string[], sumcol: Record<string, string>, y: number, m: number): { blob: Blob; name: string } {
  const L: Record<string, string> = {};
  heads.forEach((h, i) => { L[h] = colL(i); });
  const has = (...h: string[]) => h.every((x) => L[x]);
  const last = rows.length + 1, r2 = (v: unknown) => Math.round(num(v) * 100) / 100;
  const netSarH = heads.find((h) => /^الصافي \(/.test(h));
  const data: Cell[][] = [heads];
  rows.forEach((r, i) => {
    const x = i + 2;
    const row: Cell[] = heads.map((t) => (t === "معدل الصرف" ? fxOf(r) : t === "الاسم" ? r.name : t === "العملة" ? curName(r) : rowValue(r, t)));
    const set = (h: string, f: string, v: unknown) => { const ci = heads.indexOf(h); if (ci >= 0) row[ci] = { f, v: r2(v) }; };
    const c = (h: string) => L[h] + x;
    if (has("الراتب حسب الأيام", "الأساسي", "أيام العمل") && num(r.days) > 0) set("الراتب حسب الأيام", c("الأساسي") + "*" + c("أيام العمل") + "/" + num(r.days), r.salByDays);
    if (has("إجمالي المكافأة", "تكلفة السنوات", "تكلفة الشهور", "تكلفة الأيام")) set("إجمالي المكافأة", c("تكلفة السنوات") + "+" + c("تكلفة الشهور") + "+" + c("تكلفة الأيام"), r.eos);
    const dueH = ["الراتب حسب الأيام", "إضافي", "سكن", "مواصلات", "مشروع (شهري)", "أخرى (شهري)", "بدل أجازة", "مكافأة نهاية الخدمة"];
    if (has(...dueH)) set("إجمالي المستحق", dueH.map(c).join("+") + (num(r.otherAllow) ? "+" + num(r.otherAllow) : ""), r.totalDue);
    if (has("سلف / غياب", "تأمينات موظف", "أخرى")) set("إجمالي المستقطع", ["سلف / غياب", "تأمينات موظف", "أخرى"].map(c).join("+"), r.totalDeduct);
    if (has("إجمالي المستحق", "إجمالي المستقطع", "المستحق بالعملة")) set("المستحق بالعملة", c("إجمالي المستحق") + "-" + c("إجمالي المستقطع"), r.net);
    if (netSarH && has("المستحق بالعملة", "معدل الصرف")) set(netSarH, c("المستحق بالعملة") + "*" + c("معدل الصرف"), r.netSAR);
    data.push(row);
  });
  const s = sums(rows), cum = sameCur(rows);
  data.push(heads.map((t, i): Cell => {
    if (i === 0) return "الإجمالي (بعد تحويل العملات إلى الريال)";
    const k = sumcol[t];
    if (!k) return "";
    const rng = L[t] + "2:" + L[t] + last;
    if (k === "netSAR" || (k === "net" && cum)) return { f: "SUM(" + rng + ")", v: r2(s[k]) };
    if (k === "net") return "";
    return L["معدل الصرف"] ? { f: "SUMPRODUCT(" + rng + "," + L["معدل الصرف"] + "2:" + L["معدل الصرف"] + last + ")", v: r2(s[k]) } : { f: "SUM(" + rng + ")", v: r2(s[k]) };
  }));
  const q = (t: string) => '"' + String(t).replace(/"/g, '""') + '"';
  const curs: string[] = [];
  rows.forEach((r) => { const c = curName(r); if (!curs.includes(c)) curs.push(c); });
  if (has("العملة", "إجمالي المستحق", "المستحق بالعملة") && netSarH) {
    data.push([], ["تفصيل العملات"], ["العملة", "عدد الموظفين", "إجمالي المستحق (بالعملة)", "إجمالي المستقطع (بالعملة)", "الصافي (بالعملة)", "يعادل بالريال"]);
    const cr = L["العملة"] + "2:" + L["العملة"] + last, col = (h: string) => L[h] + "2:" + L[h] + last;
    curs.forEach((c) => {
      const li = rows.filter((r) => curName(r) === c), sm = (k: keyof PayRow) => li.reduce((a, r) => a + num(r[k]), 0);
      data.push([c, { f: "COUNTIF(" + cr + "," + q(c) + ")", v: li.length }, { f: "SUMIF(" + cr + "," + q(c) + "," + col("إجمالي المستحق") + ")", v: r2(sm("totalDue")) },
        L["إجمالي المستقطع"] ? { f: "SUMIF(" + cr + "," + q(c) + "," + col("إجمالي المستقطع") + ")", v: r2(sm("totalDeduct")) } : "", { f: "SUMIF(" + cr + "," + q(c) + "," + col("المستحق بالعملة") + ")", v: r2(sm("net")) }, { f: "SUMIF(" + cr + "," + q(c) + "," + col(netSarH) + ")", v: r2(sm("netSAR")) }]);
    });
    const a = data.length - curs.length + 1;
    data.push(["الإجمالي الكلي بالريال", "", "", "", "", { f: "SUM(F" + a + ":F" + (a + curs.length - 1) + ")", v: r2(s.netSAR) }]);
  }
  if (has("طريقة الدفع") && netSarH) {
    data.push([], ["حسب طريقة الدفع (ر.س)"]);
    const pr = L["طريقة الدفع"] + "2:" + L["طريقة الدفع"] + last, sr = L[netSarH] + "2:" + L[netSarH] + last, pays: string[] = [];
    rows.forEach((r) => { const p = r.payMethod || "مدد"; if (!pays.includes(p)) pays.push(p); });
    pays.forEach((p) => data.push([p, { f: "SUMIF(" + pr + "," + q(p) + "," + sr + ")", v: r2(rows.filter((r) => (r.payMethod || "مدد") === p).reduce((x, r) => x + num(r.netSAR), 0)) }]));
  }
  const blob = buildXlsx([{ name: "رواتب الموظفين", rows: data, raw: true, widths: heads.map((_, i) => (i === 2 ? 30 : i < 6 ? 14 : 15)) }]);
  return { blob, name: "payroll_" + y + "_" + String(m).padStart(2, "0") + ".xlsx" };
}

type PCol = { k: string; ar: string; en: string; def: 0 | 1; cls?: string; b?: 1; netCol?: 1; sum?: string; sumF?: (s: Record<string, number>) => number; sumL?: (l: PayRow[]) => number; cell: (r: PayRow, i: number) => string | number };
/** the printed sheet's columns; `def` = shown by default */
export const PRINT_COLS: PCol[] = [
  { k: "idx", ar: "م", en: "#", def: 1, cell: (_r, i) => i + 1 },
  { k: "empNo", ar: "الرقم الوظيفي", en: "Emp. no.", def: 0, cell: (r) => esc(r.empNo) },
  { k: "name", ar: "الاسم", en: "Employee", def: 1, cls: "n", cell: (r) => esc(short(r.name)) },
  { k: "nat", ar: "الجنسية", en: "Nationality", def: 0, cell: (r) => esc(r.nat) },
  { k: "job", ar: "الوظيفة", en: "Job", def: 0, cell: (r) => esc(r.job) },
  { k: "workDays", ar: "أيام", en: "Days", def: 1, cell: (r) => num(r.workDays) },
  { k: "insDays", ar: "أيام التأمينات", en: "Ins. days", def: 0, cell: (r) => num(r.insDays) },
  { k: "sal", ar: "الأساسي", en: "Basic", def: 1, sum: "sal", cell: (r) => money(r.sal) },
  { k: "salByDays", ar: "الراتب حسب الأيام", en: "Salary by days", def: 0, sum: "salByDays", cell: (r) => money(r.salByDays) },
  { k: "hou", ar: "سكن", en: "Housing", def: 1, sum: "houPay", cell: (r) => money(r.houPay) },
  { k: "tra", ar: "مواصلات", en: "Transport", def: 1, sum: "traPay", cell: (r) => money(r.traPay) },
  { k: "prjoth", ar: "مشروع + أخرى", en: "Project + other", def: 1, sumF: (s) => s.prjPay + s.othPay, cell: (r) => money(num(r.prjPay) + num(r.othPay) + num(r.otherAllow)) },
  { k: "ot", ar: "إضافي", en: "Overtime", def: 1, sum: "overtime", cell: (r) => money(r.overtime) },
  { k: "leave", ar: "بدل إجازة", en: "Leave pay", def: 1, sum: "leaveComp", cell: (r) => money(r.leaveComp) },
  { k: "eos", ar: "مكافأة نهاية الخدمة", en: "End-of-service", def: 1, sum: "eosAmt", cell: (r) => money(r.eosAmt) },
  { k: "due", ar: "إجمالي المستحق", en: "Total due", def: 1, sum: "totalDue", b: 1, cell: (r) => money(r.totalDue) },
  { k: "loan", ar: "سلف / غياب", en: "Advances / absence", def: 1, sum: "loanDeduct", cell: (r) => money(r.loanDeduct) },
  { k: "ins", ar: "تأمينات الموظف", en: "Employee insurance", def: 1, sumL: (l) => l.reduce((a, r) => a + (r.noInsDeduct ? 0 : num(r.insEmp)) * fxOf(r), 0), cell: (r) => money(r.insEmp && !r.noInsDeduct ? r.insEmp : 0) },
  { k: "oth", ar: "خصومات أخرى", en: "Other deductions", def: 1, sum: "otherDeduct", cell: (r) => money(r.otherDeduct) },
  { k: "ded", ar: "إجمالي المستقطع", en: "Total deductions", def: 1, sum: "totalDeduct", b: 1, cell: (r) => money(r.totalDeduct) },
  { k: "net", ar: "الصافي", en: "Net", def: 1, sum: "net", netCol: 1, b: 1, cell: (r) => money(r.net) },
  { k: "cur", ar: "العملة", en: "Currency", def: 1, cls: "cur", cell: (r) => esc(isLocalCurrency(r.currency) ? "ر.س" : currencyLabel(r.currency)) },
  { k: "fx", ar: "سعر الصرف", en: "Rate", def: 0, cell: (r) => num(fxOf(r)) },
  { k: "netSAR", ar: "الصافي (ر.س)", en: "Net (SAR)", def: 1, sum: "netSAR", b: 1, cell: (r) => money(r.netSAR) },
  { k: "pay", ar: "طريقة الدفع", en: "Payment method", def: 0, cell: (r) => esc(r.payMethod || "مدد") },
  { k: "iban", ar: "الآيبان", en: "IBAN", def: 0, cell: (r) => esc(r.iban) },
  { k: "notes", ar: "ملاحظات", en: "Notes", def: 1, cls: "nt", cell: (r) => esc(r.notes) },
];
const PC_KEY = "ariba_payroll_print_cols_v2";
export const defaultPrintCols = () => PRINT_COLS.filter((c) => c.def === 1).map((c) => c.k);
export function loadPrintCols(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PC_KEY) || "null");
    if (Array.isArray(v)) { const ok = v.filter((k) => PRINT_COLS.some((c) => c.k === k)); if (ok.length) return ok; }
  } catch { /* ignore */ }
  return defaultPrintCols();
}
export function savePrintCols(keys: string[]) { try { localStorage.setItem(PC_KEY, JSON.stringify(keys)); } catch { /* ignore */ } }

const PCSS = '<style>@page{size:A4 landscape;margin:8mm 9mm}*{box-sizing:border-box}body{margin:0;font-family:"ARIBA Two","Segoe UI",Tahoma,Arial,sans-serif;color:#10231c;font-size:8.2px;direction:rtl}'
  + ".hd{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #014D3D;padding-bottom:4px;margin-bottom:5px}.hd img{height:12mm}.hd .t{text-align:center;flex:1}.hd .t b{display:block;font-size:13px;color:#014D3D}.hd .t span{font-size:9.5px;color:#555}"
  + "table{width:100%;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#014D3D;color:#fff;padding:3px 2px;font-size:8px;font-weight:700;text-align:center;border:1px solid #014D3D}td{padding:1.5px 3px;border:1px solid #d9e3df;text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap}td.n{text-align:right;font-weight:700;white-space:normal}"
  + "tr.g td{background:#e8f3ee;font-weight:800;color:#014D3D;text-align:right}tr.s td{background:#f1f6f4;font-weight:800}tr.gt td{background:#014D3D;color:#fff;font-weight:800;font-size:9px}"
  + ".sum{display:flex;gap:5px;margin:4px 0}.sum div{flex:1;border:1px solid #d9e3df;border-radius:6px;padding:4px 6px;background:#f7faf9}.sum b{display:block;font-size:11px;color:#014D3D}.sum span{font-size:8px;color:#666}"
  + ".sg{display:flex;justify-content:space-around;margin-top:3px;page-break-inside:avoid}.sg div{text-align:center;width:26%;font-size:8.5px;font-weight:700}.sg i{display:block;border-top:1px solid #333;margin-top:9px;padding-top:1px;font-style:normal;font-weight:400;color:#555}"
  + ".ft2{font-size:7.5px;color:#666;margin:2px 0}table.fx{width:auto;margin:4px 0;min-width:60%}table.fx td,table.fx th{padding:2px 6px}.pay{margin:4px 0;padding:4px 8px;border:1px solid #014D3D;border-radius:5px;background:#f1f6f4;font-size:9.5px;font-weight:700}.pay b{color:#014D3D;font-size:10.5px}td.nt{text-align:right;white-space:normal;min-width:70px;font-size:7.5px}.cur{color:#a15c00}</style>";

/** The full printed sheet (every value escaped); `cols` = the chosen column keys. */
export function payrollPrintHtml(rows: PayRow[], { y, m, companyTitle, cols }: { y: number; m: number; companyTitle?: string; cols: string[] }) {
  const mn = MONTHS_AR[m] + " " + y, order: string[] = [], by: Record<string, PayRow[]> = {};
  rows.forEach((r) => { const k = r.employer || "—"; if (!by[k]) { by[k] = []; order.push(k); } by[k].push(r); });
  const sel = new Set(cols.length ? cols : defaultPrintCols());
  const C = PRINT_COLS.filter((c) => sel.has(c.k));
  const sumCell = (c: PCol, list: PayRow[], s: Record<string, number>) => (c.sumL ? money(c.sumL(list)) : c.sumF ? money(c.sumF(s)) : c.sum ? (c.netCol && !sameCur(list) ? "—" : money(s[c.sum])) : "");
  const firstSum = Math.max(1, C.findIndex((c) => c.sum || c.sumF || c.sumL));
  const hasSum = C.some((c) => c.sum || c.sumF || c.sumL);
  const tr = (r: PayRow, i: number) => "<tr>" + C.map((c) => {
    const v = String(c.cell(r, i)), t = c.k === "name" && fxOf(r) !== 1 ? v + ' <span class="cur">(' + esc(currencyLabel(r.currency)) + ")</span>" : v;
    return "<td" + (c.cls ? ' class="' + c.cls + '"' : "") + ">" + (c.b ? "<b>" + t + "</b>" : t) + "</td>";
  }).join("") + "</tr>";
  const srow = (label: string, list: PayRow[], cls: string) => {
    const s = sums(list);
    return '<tr class="' + cls + '"><td colspan="' + (hasSum ? firstSum : C.length) + '" style="text-align:right">' + esc(label) + " (" + list.length + ")</td>" + C.slice(hasSum ? firstSum : C.length).map((c) => "<td>" + sumCell(c, list, s) + "</td>").join("") + "</tr>";
  };
  let body = "", n = 0;
  order.forEach((k) => { body += '<tr class="g"><td colspan="' + C.length + '">' + esc(k) + "</td></tr>"; by[k].forEach((r) => { body += tr(r, n++); }); body += srow("إجمالي " + k, by[k], "s"); });
  body += srow("الإجمالي العام (ر.س)", rows, "gt");
  const s = sums(rows), byCur: Record<string, { n: number; due: number; ded: number; net: number; sar: number; fx: Set<number> }> = {}, byPay: Record<string, number> = {};
  rows.forEach((r) => {
    const c = curName(r), o = byCur[c] || (byCur[c] = { n: 0, due: 0, ded: 0, net: 0, sar: 0, fx: new Set() });
    o.n++; o.due += num(r.totalDue); o.ded += num(r.totalDeduct); o.net += num(r.net); o.sar += num(r.netSAR); o.fx.add(fxOf(r));
    const p = r.payMethod || "مدد"; byPay[p] = (byPay[p] || 0) + num(r.netSAR);
  });
  const foreign = Object.keys(byCur).filter((c) => c !== "ريال سعودي");
  const box = (v: string, l: string) => "<div><b>" + esc(v) + "</b><span>" + esc(l) + "</span></div>";
  const curTxt = Object.keys(byCur).map((c) => money(byCur[c].net) + " " + (c === "ريال سعودي" ? "ر.س" : c)).join(" + ");
  const payTxt = Object.keys(byPay).map((k) => esc(k) + " <b>" + money(byPay[k]) + "</b>").join(" &nbsp;·&nbsp; ");
  let fxBlock = "";
  if (foreign.length) {
    const rowsFx = Object.keys(byCur).map((c) => { const o = byCur[c], sar = c === "ريال سعودي", fx = [...o.fx]; return '<tr><td class="n">' + esc(sar ? "ر.س (ريال سعودي)" : c) + "</td><td>" + o.n + "</td><td>" + (sar ? "1" : fx.length === 1 ? fx[0] : "متعدد") + "</td><td>" + money(o.due) + "</td><td>" + money(o.ded) + "</td><td><b>" + money(o.net) + "</b></td><td><b>" + money(o.sar) + "</b></td></tr>"; }).join("");
    fxBlock = '<table class="fx"><thead><tr>' + ["العملة", "عدد الموظفين", "سعر الصرف (ر.س)", "إجمالي المستحق", "الاستقطاعات", "الصافي بالعملة", "يعادل بالريال"].map((h) => "<th>" + h + "</th>").join("") + "</tr></thead><tbody>" + rowsFx
      + '<tr class="gt"><td colspan="6" style="text-align:right">الإجمالي الكلي للصافي بعد تحويل العملات إلى الريال</td><td>' + money(s.netSAR) + "</td></tr></tbody></table>";
  }
  return PCSS + '<div class="hd"><div class="t"><b>' + esc(companyTitle || "كشف رواتب ومكافآت الموظفين") + "</b><span>عن شهر " + esc(mn) + " — عدد الموظفين " + rows.length + "</span></div></div>"
    + "<table><thead><tr>" + C.map((c) => "<th>" + esc(c.ar) + "</th>").join("") + "</tr></thead><tbody>" + body + "</tbody></table>"
    + '<div class="sum">' + box(money(s.totalDue), "إجمالي المستحقات (ر.س)") + box(money(s.totalDeduct), "إجمالي الاستقطاعات (ر.س)") + box(curTxt, "الصافي بالعملات") + box(money(s.netSAR), "الصافي (ر.س)") + box(money(s.insEr), "تأمينات الشركة") + "</div>"
    + '<div class="ft2">إجمالي الاستقطاعات = سلف/غياب + تأمينات الموظف + خصومات أخرى</div>'
    + fxBlock
    + '<div class="pay">حسب طريقة الدفع (ر.س): ' + payTxt + "</div>"
    + '<div class="sg"><div>مدير الموارد البشرية<i></i></div><div>المدير المالي<i></i></div><div>الرئيس التنفيذي<i></i></div></div>';
}

