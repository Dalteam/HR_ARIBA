// Official end-of-service settlement (مخالصة نهاية خدمة) on the letterhead — same content and rules as the legacy
// V69 document: service period, EOS by article, leave allowance (and excess-leave deduction), last-period salary
// (1st of the last month or the join date → end date), extras, deductions (any line named «تأمين» shows as GOSI for
// the period), net + amount in words, and the employee's acknowledgement (custody clause differs for Ariba).
import { aribaTafqeet } from "./tafqeet";
import { esc, tfD, tfWrap } from "./forms";
import type { SettlementResult } from "./settlement";

export interface SettlementDocInput {
  emp: { nameAr: string; nationality: string; iqamaNo: string; empNo: string; jobTitle: string; employer: string; bank: string; iban: string };
  start: string;
  end: string;
  salary: number;
  monthDays: number;
  lawLabel: string;
  res: SettlementResult;
  extras: { label: string; amount: number }[];
  deductions: { label: string; value: number; type: "amount" | "days" }[];
  leaveTaken: number;
}

const num = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

export function settlementDocHtml(d: SettlementDocInput): string {
  const { emp: e, res } = d;
  const endD = new Date(d.end);
  let from = new Date(endD.getFullYear(), endD.getMonth(), 1);
  if (d.start && from < new Date(d.start)) from = new Date(d.start);
  const periodText = `${tfD(from)} إلى ${tfD(endD)} (${Math.round((endD.getTime() - from.getTime()) / 86400000) + 1} يوم)`;

  const sec = (t: string) => `<tr><td colspan="3" style="background:#e8f0ee;color:#014D3D;font-weight:800;padding:3px 7px;font-size:10px">${t}</td></tr>`;
  const row = (a: string, b: string, c: string, color = "#1a1a1a") => `<tr><td>${a}</td><td style="color:#666">${b}</td><td style="text-align:left;font-weight:700;color:${color}">${c}</td></tr>`;

  let rows = sec("📅 مدة الخدمة") + row(`من ${tfD(d.start)} إلى ${tfD(d.end)}`, `${res.years} سنة ${res.months} شهر ${res.days} يوم`, "");
  rows += sec(`🏆 مكافأة نهاية الخدمة (${esc(d.lawLabel)})`) + row("المستحق نظاماً", esc(res.lawNote), res.award > 0 ? num(res.award) + " ر.س" : "لا تستحق", res.award > 0 ? "#0a7a3f" : "#c0392b");
  rows += sec("🌴 بدل الإجازة") + row(`الرصيد المتبقي: ${res.leaveRemaining} يوم`, "", num(res.leaveComp) + " ر.س", "#0a7a3f");
  if (res.leaveExcess > 0) rows += row(`إجازة زائدة عن المستحق: ${res.leaveExcess} يوم`, `المستحق ${res.leaveDue} يوم — المأخوذ ${d.leaveTaken} يوم`, "-" + num(res.leaveExcessDeduction) + " ر.س", "#c0392b");
  rows += sec("💰 راتب آخر فترة عمل") + row(periodText, "", num(res.periodSalary) + " ر.س", "#0a7a3f");
  const extras = d.extras.filter((x) => x.amount);
  if (extras.length) rows += sec("➕ استحقاقات إضافية") + extras.map((x) => row(esc(x.label || "استحقاق"), "", "+" + num(x.amount) + " ر.س", "#0a7a3f")).join("");
  rows += sec("➖ الاستقطاعات");
  const deds = d.deductions.filter((x) => x.value);
  rows += deds.length
    ? deds
        .map((x) => {
          const amount = x.type === "days" ? Math.round((d.salary / (d.monthDays || 30)) * x.value * 100) / 100 : x.value;
          return /تأمين/.test(x.label)
            ? row("التأمينات الاجتماعية (GOSI)", "عن الفترة: " + periodText, "-" + num(amount) + " ر.س", "#c0392b")
            : row(esc(x.label || "استقطاع"), x.type === "days" ? `${x.value} يوم` : "استقطاع مالي", "-" + num(amount) + " ر.س", "#c0392b");
        })
        .join("")
    : row("لا توجد استقطاعات", "", "—", "#888");
  const words = aribaTafqeet(res.total);
  rows += `<tr style="background:#014D3D"><td colspan="2" style="color:#fff;font-weight:900;padding:6px 7px">💵 صافي مبلغ المخالصة المستحق</td><td style="color:#fff;font-weight:900;text-align:left;padding:6px 7px">${num(res.total)} ر.س</td></tr>`;
  rows += `<tr><td colspan="3" style="background:#f7f9f8;text-align:center;font-size:10px;padding:3px 7px;color:#014D3D">فقط: ${words}</td></tr>`;

  const isAriba = /اريبا|أريبا/.test(e.employer || "");
  const custody = isAriba
    ? "<li>أقرّ بأنني سلّمت جميع العهد والأجهزة والمستندات التابعة للشركة والتي كانت لدي أثناء فترة عملي، ولا أحتفظ بأي منها أو بنسخ عنها.</li>"
    : `<li>أقر بتسليم جميع العهد التي استلمتها من ${esc(e.employer)}، والتي استخدمتها في أعمال المشروع والتي تعهدت بالمحافظة عليها.</li>`;

  const css =
    "<style>.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;background:#f7f9f8;border:1px solid #e0e4e2;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:12.5px}.info-grid b{color:#014D3D}" +
    "table.doc-table{width:100%;border-collapse:collapse;font-size:11.5px}table.doc-table th{background:#014D3D;color:#fff;padding:5px 8px;text-align:right}table.doc-table td{padding:4px 8px;border-bottom:1px solid #e0e4e2}" +
    "h3.sec{color:#014D3D;border-bottom:1.5px solid #014D3D;padding-bottom:3px;margin:8px 0 4px;font-size:13px}.legal{font-size:11.5px;text-align:justify;line-height:1.4}.legal ul{padding-right:20px;margin:0}.legal li{margin-bottom:4px}" +
    ".sign{display:flex;justify-content:space-between;margin-top:12px;font-size:12px}.sign div{width:45%;border-top:1px solid #333;padding-top:4px;text-align:center}</style>";

  const body =
    css +
    '<div style="text-align:center;font-size:13.5px;color:#555;margin-bottom:8px">مخالصة نهاية خدمة — إقرار واستلام مستحقات</div>' +
    `<div class="info-grid"><div><b>الاسم:</b> ${esc(e.nameAr || "—")}</div><div><b>الجنسية:</b> ${esc(e.nationality || "—")}</div><div><b>رقم الهوية/الإقامة:</b> ${esc(e.iqamaNo || "—")}</div><div><b>الرقم الوظيفي:</b> ${esc(e.empNo || "—")}</div><div><b>الوظيفة:</b> ${esc(e.jobTitle || "—")}</div><div><b>جهة العمل:</b> ${esc(e.employer || "—")}</div></div>` +
    `<table class="doc-table"><tr><th>البيان</th><th>التفاصيل</th><th>المبلغ</th></tr>${rows}</table>` +
    '<h3 class="sec">📜 إقرار وتعهد</h3>' +
    `<div class="legal"><div>أنا الموقع أدناه / ${esc(e.nameAr)}، ${esc(e.nationality)} الجنسيــة – هــوية وطنيــة رقم (${esc(e.iqamaNo)})، أقر بموجب هذا بالآتي:</div><ul>` +
    `<li>أقر باستلامي كامل حقوقي ومستحقاتي القانونية بموجب عقد العمل الخاص بي وذلك عن مدة خدمتي مع شركة حلول أريبا لخدمات الأعمال، كما هو منصوص عليه في نظام العمل السعودي والتي انتهت مع الشركة بتاريخ (${tfD(d.end)})م.</li>` +
    `<li>أوافق على تحويــل مســتحقاتي المتبقية لدي شركة حلول أريبـا لخدمات الأعمال بمبلغ إجمالي قدرة (${words}) إلى حســابي الشخصـي فـي (${esc(e.bank || "—")}) رقم (${esc(e.iban || "—")}).</li>` +
    "<li>أقر بأنني بموجب هذا ابرئ، بصفة نهائية وغير قابلة للنقض والرجوع عنها، شركة حلول أريبا لخدمات الأعمال، ويشمل مالكيها ومديريها وموظفيها وعملائها من أي مستحقات أو مطالبات أو التزامات مالية او إجراءات أو حقوق أو دعاوي أو التزامات أو مسؤوليات قانونية سواء كانت حالية او مستقبلية من أي نوع كانت والتي يمكن ان تنشأ من أو تكون مرتبطة أو متعلقة بتوظيفي بأي طريقة سواء مباشرة أو غير مباشرة.</li>" +
    custody +
    "<li>اقر بان جميع المعلومات والمستندات التي نمت إلى علمي أو في حوزتي بسبب أو أثناء توظيفي وعملي هي سرية تماما وأوافق على عدم إفشاء محتوياتها لأي طرف من الغير الا إذا كان ذلك لازماً بمقتضى القوانين في المملكة العربية السعودية، كما اتعهد بعدم استخدامها لحسابي أو لصالحي الخاص أو لحساب أي جهة عمل لديها في المستقبل.</li>" +
    '</ul><div style="margin-top:6px;font-weight:700;text-align:center">وهذا تعهد ومخالصة نهائية وغير قابلة للنقض.</div></div>' +
    `<div class="sign"><div>الاسم: ${esc(e.nameAr)}</div><div>التوقيع: ________________</div></div>`;
  return tfWrap("", "", body);
}
