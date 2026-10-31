// The payslip as a PDF (their Pay.jsx slipDoc → «حفظ كـ PDF»): the same A4 page, printed to a file and shared.
import { Platform } from "react-native";
import { htmlToPdfBlob } from "./pdf";
import { stripEmojiHtml } from "./clean";
import { deliverFile } from "./web-file";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { Employee, Payslip } from "./api";

const MN = ["", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const nf = (v: unknown) => num(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function slipDoc(raw: Payslip, me: Employee | null, company: { nameAr?: string; logo?: string | null }): string {
  const p = raw.data, cur = p.currency && p.currency !== "ريال سعودي" ? p.currency : "";
  const title = `قسيمة راتب — ${MN[raw.month] ?? ""} ${raw.year}`;
  const co = company.nameAr || "حلول اريبا لخدمات الأعمال";
  const insEmp = p.noInsDeduct ? 0 : num(p.insEmp);
  const rows = ([["الراتب الأساسي (حسب أيام العمل)", p.salByDays], ["بدل السكن", p.houPay], ["بدل النقل", p.traPay], ["بدل المشروع", p.prjPay],
    ["بدلات أخرى", num(p.othPay) + num(p.otherAllow)], ["الإضافي", p.overtime], ["بدل الإجازة", p.leaveComp], ["مكافأة نهاية الخدمة", p.eosAmt]] as [string, unknown][])
    .filter((r, i) => i < 3 || num(r[1]));
  const ded = ([["استقطاع التأمينات", insEmp], ["سلف / غياب", p.loanDeduct], ["استقطاعات أخرى", p.otherDeduct]] as [string, unknown][]).filter((r, i) => i === 0 || num(r[1]));
  const net = p.netSAR != null ? p.netSAR : p.net, td = "padding:8px 12px;border-bottom:1px solid #e3ece7;font-size:13px", al = "left";
  const logo = company.logo && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(company.logo) ? `<img src="${company.logo}" style="max-height:60px;max-width:180px;object-fit:contain">` : "";
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>@page{size:A4;margin:14mm}body{font-family:Tahoma,Arial,sans-serif;color:#231F20;margin:0}table{width:100%;border-collapse:collapse}.h{background:#014D3D;color:#fff;font-weight:700}</style></head><body>`
    + `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #29B35E;padding-bottom:8px;margin-bottom:14px"><div><div style="font-size:18px;font-weight:800;color:#014D3D">${esc(co)}</div><div style="font-size:13px;color:#555;margin-top:2px">${esc(title)}</div></div>${logo}</div>`
    + `<table style="margin-bottom:12px"><tr><td style="${td};width:30%;color:#587066">الموظف</td><td style="${td};font-weight:700">${esc(me?.name_ar)}</td></tr>${me?.emp_no ? `<tr><td style="${td};color:#587066">الرقم الوظيفي</td><td style="${td}">${esc(me.emp_no)}</td></tr>` : ""}</table>`
    + `<table><tr class="h"><td style="padding:8px 12px">المستحقات</td><td style="padding:8px 12px;text-align:${al}">ر.س</td></tr>${rows.map((r) => `<tr><td style="${td}">${r[0]}</td><td style="${td};text-align:${al};direction:ltr">${nf(r[1])}</td></tr>`).join("")}<tr style="background:#f1f8f4"><td style="${td};font-weight:800">إجمالي المستحق</td><td style="${td};text-align:${al};direction:ltr;font-weight:800">${nf(p.totalDue)}</td></tr></table>`
    + `<table style="margin-top:12px"><tr class="h"><td style="padding:8px 12px">الاستقطاعات</td><td style="padding:8px 12px;text-align:${al}">ر.س</td></tr>${ded.map((r) => `<tr><td style="${td}">${r[0]}</td><td style="${td};text-align:${al};direction:ltr;color:#231F20">- ${nf(r[1])}</td></tr>`).join("")}</table>`
    + `<table style="margin-top:12px"><tr style="background:#014D3D;color:#fff"><td style="padding:12px;font-size:15px;font-weight:800">صافي الراتب</td><td style="padding:12px;font-size:16px;font-weight:800;text-align:${al};direction:ltr">${nf(net)} ر.س</td></tr>${cur ? `<tr><td style="${td}">الصافي بالعملة الأصلية</td><td style="${td};text-align:${al};direction:ltr">${nf(p.net)} ${esc(cur)}</td></tr>` : ""}</table>`
    + `<div style="margin-top:18px;font-size:11px;color:#6b7c75;text-align:center">هذه القسيمة صادرة إلكترونيًا ولا تحتاج توقيعًا.</div></body></html>`;
}

export async function sharePayslip(raw: Payslip, me: Employee | null, company: { nameAr?: string; logo?: string | null }) {
  if (Platform.OS === "web") {
    // PWA: a real PDF made inside the app and handed over (share sheet on a phone, download elsewhere): no new tab, nothing to come back from.
    const blob = await htmlToPdfBlob(slipDoc(raw, me, company));
    await deliverFile(new Uint8Array(await blob.arrayBuffer()), `payslip-${raw.year}-${String(raw.month).padStart(2, "0")}.pdf`, "application/pdf");
    return;
  }
  const { uri } = await Print.printToFileAsync({ html: stripEmojiHtml(slipDoc(raw, me, company)) });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "قسيمة الراتب", UTI: "com.adobe.pdf" });
}
