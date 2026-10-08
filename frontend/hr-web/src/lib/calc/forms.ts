// Official forms on the company letterhead — port of the legacy builders:
// forms/058-ariba-v70-templates-tab.js (DOC_CSS, tfWrap, tfInfoTable, onboarding, custody, clearance, experience),
// forms/098-ariba-v114-forms-arabic-send-all.js (Arabic extension, termination, evaluation, contract-end + HR signature),
// payroll/103-ariba-v117-attachments-bulk-salary.js (salary certificate: Hijri/Gregorian date, ref AR-YYYYMMDD-n, IBAN account).
// The HR signature block uses the signer saved in Settings (V120): name, title, signature and stamp images.

export interface FormEmp {
  id: string;
  nameAr: string;
  nameEn: string;
  nationality: string;
  iqamaNo: string;
  nationalityEn?: string;
  departmentEn?: string;
  empNo: string;
  department: string;
  jobTitle: string;
  contractJoin: string;
  manager: string;
  iban: string;
  bank: string;
  salary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
}

export interface Signer {
  name_ar: string;
  title_ar: string;
  title_en: string;
  signature: string | null;
  stamp: string | null;
  show_signature?: boolean;
  show_stamp?: boolean;
}

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");

export const tfD = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn");
  } catch {
    return String(v);
  }
};
export const tfDEn = (v: string | null | undefined) => {
  if (!v) return "____/____/________";
  try {
    return new Date(v).toLocaleDateString("en-GB");
  } catch {
    return v;
  }
};
export const esc = (s: unknown) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function docCss() {
  const o = origin();
  const font = (w: string, file: string) => `@font-face{font-family:"ARIBA Two";src:url(${o}/fonts/${file}) format("truetype");font-weight:${w};font-style:normal}`;
  return (
    "<style>" +
    font("300 400", "ARIBA_TWO_LIGHT.ttf") +
    font("500 600", "ARIBA_TWO_MEDIUM.ttf") +
    font("700 900", "ARIBA_TWO_BOLD.ttf") +
    "@page{size:A4;margin:0}" +
    "*{box-sizing:border-box}" +
    'body{font-family:"ARIBA Two","Segoe UI",Tahoma,Arial,sans-serif;color:#14231d;margin:0;line-height:1.55;font-size:13.5px}' +
    ".doc{width:100%;max-width:210mm;margin:0 auto;min-height:297mm;position:relative;padding:0 16mm}" +
    ".lh-head{width:calc(100% + 32mm);display:block;margin:0 -16mm 8mm -16mm;max-width:none}" +
    ".lh-foot{width:100%;display:block;position:fixed;bottom:0;left:0}" +
    ".doc-body{padding-bottom:14mm}" +
    ".doc-title{text-align:center;font-size:19px;font-weight:900;color:#014D3D;margin:2mm 0 5mm}" +
    ".doc-title .en{display:block;font-size:13px;font-weight:700;color:#017a5f;margin-top:1mm}" +
    ".meta-row{display:flex;justify-content:space-between;font-size:11.5px;color:#555;margin-bottom:4mm}" +
    "table.tf-info{width:100%;border-collapse:collapse;margin-bottom:4mm;border:1px solid #d8e2de;border-radius:6px;overflow:hidden}" +
    "table.tf-info td{padding:6px 11px;border-bottom:1px solid #e5ece9;font-size:12px}" +
    "table.tf-info td.tf-lbl{background:#eef5f2;color:#014D3D;font-weight:800;width:20%;font-size:11.5px}" +
    "table.tf-info td.tf-val{width:30%;font-weight:600}" +
    "table.tf-info td b{color:#014D3D}" +
    ".tf-info-title{font-size:12px;color:#014D3D;font-weight:800;margin-bottom:2mm;padding-bottom:1.5mm;border-bottom:1.5px solid #014D3D}" +
    "table.tf-bi{width:100%;border-collapse:collapse;margin-bottom:4mm;border:1px solid #d8e2de}" +
    "table.tf-bi th{background:#014D3D;color:#fff;padding:5px 8px;font-size:11.5px}" +
    "table.tf-bi td{padding:5px 9px;border-bottom:1px solid #e5ece9;font-size:11.5px;vertical-align:top}" +
    ".tf-en{direction:ltr;text-align:left}" +
    ".tf-ar{direction:rtl;text-align:right}" +
    ".tf-p{margin:0 0 2.8mm;text-align:justify}" +
    ".tf-sign{display:flex;justify-content:space-between;margin-top:5mm;font-size:12px}" +
    ".tf-sign div{width:45%;border-top:1px solid #333;padding-top:2.5mm;text-align:center}" +
    ".tf-box{border:1px solid #d8e2de;border-radius:7px;padding:6px 11px;background:#f7faf9;margin-bottom:3.5mm}" +
    "table.tf-eval{width:100%;border-collapse:collapse;margin-bottom:3.5mm;border:1px solid #d8e2de}" +
    "table.tf-eval th{background:#014D3D;color:#fff;padding:4px 6px;font-size:10px;text-align:center}" +
    "table.tf-eval td{padding:4px 6px;border-bottom:1px solid #e5ece9;font-size:10px;text-align:center}" +
    ".tf-chk{display:inline-block;width:12px;height:12px;border:1.5px solid #014D3D;border-radius:3px;margin-inline-start:6px;vertical-align:middle}" +
    ".tf-chk.on{background:#014D3D}" +
    ".hrsig{display:flex;justify-content:space-between;align-items:flex-end;margin-top:6mm;font-size:12px}" +
    ".hrsig .blk{position:relative;width:62mm;min-height:30mm;text-align:center}" +
    ".hrsig .blk img.st{position:absolute;width:30mm;left:50%;margin-left:-4mm;top:0;opacity:.95}" +
    ".hrsig .blk img.sg{position:absolute;width:36mm;left:50%;margin-left:-30mm;top:6mm;mix-blend-mode:multiply}" +
    "</style>"
  );
}

export function tfWrap(titleAr: string, titleEn: string, bodyHtml: string) {
  const o = origin();
  return (
    docCss() +
    '<div class="doc">' +
    `<img class="lh-head" src="${o}/brand/letterhead-header.jpg">` +
    '<div class="doc-body">' +
    (titleAr ? `<div class="doc-title">${esc(titleAr)}${titleEn ? `<span class="en">${esc(titleEn)}</span>` : ""}</div>` : "") +
    bodyHtml +
    "</div>" +
    `<img class="lh-foot" src="${o}/brand/letterhead-footer.jpg">` +
    "</div>"
  );
}

export function tfInfoTable(e: FormEmp) {
  const cell = (lbl: string, val: string) => `<td class="tf-lbl">${lbl}</td><td class="tf-val">${esc(val || "—")}</td>`;
  return (
    '<div class="tf-info-title">بيانات الموظف</div>' +
    '<table class="tf-info"><tr>' +
    cell("الاسم", e.nameAr || e.nameEn) +
    cell("الجنسية", e.nationality) +
    "</tr><tr>" +
    cell("رقم الهوية/الإقامة", e.iqamaNo) +
    cell("الرقم الوظيفي", e.empNo) +
    "</tr><tr>" +
    cell("القسم/الإدارة", e.department) +
    cell("المسمى الوظيفي", e.jobTitle) +
    "</tr></table>"
  );
}

/** V120 HR signature block (Arabic: signer on the left; the date on the opposite side when requested). */
export function hrSign(s: Signer, opt: { date?: boolean; extra?: string } = {}) {
  if (s.show_signature === false) s = { ...s, signature: null };
  if (s.show_stamp === false) s = { ...s, stamp: null };
  const sig = s.signature ? `<img class="sg" src="${s.signature}">` : `<div style="font-family:cursive;font-size:16px;margin-top:10mm">${esc(s.name_ar)}</div>`;
  const stamp = s.stamp ? `<img class="st" src="${s.stamp}">` : "";
  const left = `<div class="blk"><div style="font-weight:800">${esc(s.title_ar)}</div>${stamp}${sig}<div style="position:absolute;bottom:0;left:0;right:0;font-weight:800">${esc(s.name_ar)}</div></div>`;
  const right = opt.extra ?? (opt.date ? `<div style="font-weight:700">التاريخ: ${tfD(new Date())}</div>` : "<div></div>");
  return `<div class="hrsig" dir="rtl">${right}${left}</div>`;
}

const box = (inner: string) => `<div class="tf-box">${inner}</div>`;
const empAck = (e: FormEmp, txt: string) =>
  box(`أقر أنا ( ${esc(e.nameAr || e.nameEn)} ) ${txt}`) +
  `<div class="tf-sign"><div>الموظف: ${esc(e.nameAr)}<br>التوقيع: ________________</div><div>التاريخ: ________________</div></div>`;

export interface Built {
  type: string;
  title: string;
  html: string;
}

/* 1) مباشرة عمل (V70) */
export function buildOnboarding(e: FormEmp, f: { manager: string; join: string; first: boolean; leaveType: string }, s: Signer): Built {
  const joinISO = f.join || e.contractJoin;
  const body =
    tfInfoTable(e) +
    `<div class="tf-box"><b>تاريخ المباشرة:</b> ${tfD(joinISO)}</div>` +
    `<p class="tf-p">المكرم/ بناءً على إشعار التوظيف، نحيطكم علماً بأن الموظف الموضح بياناته أعلاه قد باشر العمل لدينا في شركة حلول أريبا لخدمات الأعمال — قسم ${esc(e.department)}.</p>` +
    `<p class="tf-p">الموظف باشر العمل في التاريخ المحدد وذلك يوم: <b>${tfD(joinISO)}</b>.</p>` +
    `<div class="tf-sign"><div>المدير المباشر: ${esc(f.manager || e.manager || "—")}<br>التوقيع: ________________</div><div>التاريخ: ${tfD(new Date())}</div></div>` +
    '<div class="tf-box" style="margin-top:8mm">' +
    `<span class="tf-chk${f.first ? " on" : ""}"></span> مباشرة عمل لأول مرة &nbsp;&nbsp;&nbsp; ` +
    `<span class="tf-chk${!f.first ? " on" : ""}"></span> مباشرة عمل بعد العودة من إجازة${f.leaveType ? ` (${esc(f.leaveType)})` : ""}` +
    "</div>" +
    hrSign(s, { extra: "<div>التاريخ: ________________</div>" }) +
    '<div class="tf-sign" style="margin-top:14mm"><div>اعتماد الرئيس التنفيذي<br>التوقيع: ________________</div><div>التاريخ: ________________</div></div>';
  return { type: "onboarding", title: "مباشرة عمل", html: tfWrap("مباشرة عمل", "Onboarding Notice", body) };
}

/* 2) استلام عهدة تقنية (V70) */
export function buildCustody(e: FormEmp, rows: { n: string; s: string; c: string }[]): Built | string {
  const items = rows.filter((r) => r.n.trim());
  if (!items.length) return "أضف بند عهدة واحد على الأقل";
  const itemsHtml = items.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.n)}</td><td>${esc(r.s || "—")}</td><td>${esc(r.c || "—")}</td></tr>`).join("");
  const body =
    tfInfoTable(e) +
    `<table class="tf-bi"><tr><th style="width:8%">م</th><th>اسم العهدة</th><th>الموديل / الرقم التسلسلي</th><th>الحالة</th></tr>${itemsHtml}</table>` +
    '<p class="tf-p">أقر أنا الموظف الموضح بياناته أعلاه باستلامي العهدة التقنية المذكورة أعلاه من شركة حلول أريبا لخدمات الأعمال، وأتعهد بالمحافظة عليها واستخدامها في أعمال الشركة فقط، وإعادتها بحالة جيدة عند طلبها أو عند انتهاء علاقتي التعاقدية مع الشركة لأي سبب كان.</p>' +
    `<div class="tf-sign"><div>الموظف: ${esc(e.nameAr)}<br>التوقيع: ________________</div><div>التاريخ: ________________</div></div>` +
    '<div class="tf-sign" style="margin-top:10mm"><div>عن قسم تقنية المعلومات<br>التوقيع: ________________</div><div>التاريخ: ________________</div></div>';
  return { type: "custody", title: "استلام عهدة تقنية", html: tfWrap("نموذج استلام عهدة تقنية", "IT Custody Receipt", body) };
}

/* 3) تمديد فترة التجربة (V114) */
export function buildExtension(e: FormEmp, f: { join: string; end: string }, s: Signer): Built | string {
  if (!f.end) return "حدد تاريخ نهاية التمديد الجديد";
  const joinISO = f.join || e.contractJoin;
  const body =
    tfInfoTable(e) +
    box(`<div style="margin-bottom:4px"><b>تاريخ بداية العقد:</b> ${tfD(joinISO)}</div><div><b>نهاية فترة التجربة بعد التمديد:</b> ${tfD(f.end)}</div>`) +
    `<p class="tf-p" dir="rtl">المكرم/ ${esc(e.nameAr || e.nameEn)}، تحية طيبة وبعد,,</p>` +
    `<p class="tf-p" dir="rtl">إشارة إلى عقد العمل المبرم معكم بتاريخ ${tfD(joinISO)}، نرجو العلم بأنه قد تقرر تمديد فترة التجربة الخاصة بكم إلى فترة أخرى تنتهي بتاريخ <b>${tfD(f.end)}</b>.</p>` +
    '<p class="tf-p" dir="rtl">وعليه، يرجى منكم التكرم بإستلام هذا الإشعار وموافاتنا بنسخة موقعة منه.</p>' +
    '<p class="tf-p" dir="rtl">مع وافر أمنياتنا لكم بالتوفيق والنجاح,,</p>' +
    hrSign(s, { date: true }) +
    empAck(e, "بموافقتي على تمديد فترة التجربة وفقاً لما ورد أعلاه.");
  return { type: "extension", title: "إشعار تمديد فترة التجربة", html: tfWrap("إشعار تمديد فترة التجربة", "Probationary Period Extension", body) };
}

/* 4) إنهاء فترة التجربة (V114) */
export function buildTermination(e: FormEmp, f: { join: string; last: string }, s: Signer): Built | string {
  if (!f.last) return "حدد تاريخ آخر يوم عمل";
  const joinISO = f.join || e.contractJoin;
  const body =
    tfInfoTable(e) +
    box(`<div style="margin-bottom:4px"><b>تاريخ بداية العقد:</b> ${tfD(joinISO)}</div><div><b>تاريخ آخر يوم عمل:</b> ${tfD(f.last)}</div>`) +
    `<p class="tf-p" dir="rtl">المكرم/ ${esc(e.nameAr || e.nameEn)}، تحية طيبة وبعد,,</p>` +
    `<p class="tf-p" dir="rtl">إشارة إلى عقد العمل المبرم معكم بتاريخ ${tfD(joinISO)}، نرجو العلم بأنه قد تقرر إنهاء فترة التجربة الخاصة بكم على أن يكون آخر يوم عمل لكم تحت التجربة بتاريخ <b>${tfD(f.last)}</b>.</p>` +
    '<p class="tf-p" dir="rtl">وعليه، يرجى منكم التكرم بإستلام هذا الإشعار وموافاتنا بنسخة موقعة منه.</p>' +
    '<p class="tf-p" dir="rtl">مع وافر أمنياتنا لكم بالتوفيق والنجاح,,</p>' +
    hrSign(s, { date: true }) +
    empAck(e, "بإستلام إشعار إنهاء فترة التجربة.");
  return { type: "termination", title: "إشعار إنهاء فترة التجربة", html: tfWrap("إشعار إنهاء فترة التجربة", "Probationary Period Termination", body) };
}

/* 5) إخلاء طرف (V70) */
export function buildClearance(e: FormEmp, f: { join: string; last: string; reason: string; other: string }, s: Signer): Built | string {
  if (!f.last) return "حدد تاريخ آخر يوم عمل";
  const joinISO = f.join || e.contractJoin;
  const body =
    tfInfoTable(e) +
    box(`<div style="margin-bottom:4px"><b>تاريخ المباشرة:</b> ${tfD(joinISO)}</div><div><b>تاريخ آخر يوم عمل:</b> ${tfD(f.last)}</div>`) +
    '<div class="tf-box">أسباب إخلاء الطرف: ' +
    `<span class="tf-chk${f.reason === "resign" ? " on" : ""}"></span> استقالة &nbsp;&nbsp; ` +
    `<span class="tf-chk${f.reason === "end" ? " on" : ""}"></span> انتهاء العقد &nbsp;&nbsp; ` +
    `<span class="tf-chk${f.reason === "other" ? " on" : ""}"></span> أخرى${f.reason === "other" && f.other ? ": " + esc(f.other) : ""}` +
    "</div>" +
    '<p class="tf-p">نقر نحن شركة حلول أريبا لخدمات الأعمال بأن الموظف المذكور بياناته أعلاه قد أنهى أعماله في الشركة وسلّم جميع العهد التي تخصه، وليس عليه أي مستحقات أو متعلقات أو التزامات.</p>' +
    '<p class="tf-p">وعلى هذا تم إخلاء طرف الموظف.</p>' +
    hrSign(s, { date: true });
  return { type: "clearance", title: "إخلاء طرف", html: tfWrap("إخلاء الطرف", "Final Clearance", body) };
}

/* 6) شهادة خبرة (V70) */
export function buildExperience(e: FormEmp, f: { start: string; still: boolean; end: string; nature: string; no: string }, s: Signer): Built {
  const certNo = f.no || `AR-${e.empNo}-${new Date().getFullYear()}`;
  const body =
    `<div class="meta-row"><div>الصادر: ${esc(certNo)}</div><div>التاريخ: ${tfD(new Date())}</div></div>` +
    `<p class="tf-p">تشهد شركة حلول أريبا لخدمات الأعمال، بأن السيد/ة <b>${esc(e.nameAr || e.nameEn)}</b>، ${esc(e.nationality)} الجنسية، رقم الهوية (${esc(e.iqamaNo)})، عمل لدينا بوظيفة (<b>${esc(e.jobTitle)}</b>) بحسب البيانات أدناه:</p>` +
    '<table class="tf-info">' +
    '<tr><td class="tf-lbl">نوع العقد</td><td class="tf-val" colspan="3">عقد عمل</td></tr>' +
    `<tr><td class="tf-lbl">طبيعة التعاقد</td><td class="tf-val" colspan="3">${esc(f.nature || "دوام كامل")}</td></tr>` +
    `<tr><td class="tf-lbl">بداية التعاقد</td><td class="tf-val">${tfD(f.start || e.contractJoin)}</td>` +
    `<td class="tf-lbl">نهاية التعاقد</td><td class="tf-val">${f.still ? "لا يزال على رأس العمل حتى تاريخه" : tfD(f.end)}</td></tr>` +
    "</table>" +
    '<p class="tf-p">وخلال فترة عمله لدينا أنجز المهام الموكلة له، وقد كان حسن السيرة والسلوك.</p>' +
    '<p class="tf-p">شاكرين له جهوده خلال تلك الفترة مع تمنياتنا له بالتوفيق.</p>' +
    '<p class="tf-p">وقد تم إعطاؤه هذه الشهادة بناءً على طلبه وذلك دون أدنى مسؤولية على الشركة.</p>' +
    '<p class="tf-p">وتقبلوا أطيب التحايا والتقدير,,,</p>' +
    hrSign(s);
  return { type: "experience", title: "شهادة خبرة", html: tfWrap("شهادة خبرة", "", body) };
}

/* 7) تقييم فترة التجربة (V114) */
export const EVAL_CRITERIA = ["المعرفة الفنية في مجال عمله", "الإلتزام بقوانين وأنظمة الشركة", "جودة مخرجات العمل", "علاقة الموظف مع إدارته وزملائه", "القدرة على التعلم والتطور والمبادرة"];
export const EVAL_LABELS: Record<number, string> = { 0: "غير مرضٍ", 50: "أقل من التوقعات", 70: "يحقق التوقعات", 90: "يفوق التوقعات", 100: "متميز" };
export function buildEvaluation(e: FormEmp, f: { join: string; end: string; rec: string; decision: string; scores: number[] }, s: Signer): Built {
  const scores = f.scores.length ? f.scores : [70, 70, 70, 70, 70];
  const total = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const rows = EVAL_CRITERIA.map((c, i) => `<tr><td>${i + 1}</td><td style="text-align:right;padding-right:8px">${esc(c)}</td><td>${scores[i] || 0}%</td><td>${EVAL_LABELS[scores[i] || 0] || ""}</td></tr>`).join("");
  const d = f.decision;
  const body =
    tfInfoTable(e) +
    box(`<b>تاريخ بداية العقد:</b> ${tfD(f.join || e.contractJoin)} &nbsp;&nbsp;&nbsp; <b>تاريخ نهاية فترة التجربة:</b> ${tfD(f.end)}`) +
    '<p class="tf-p" dir="rtl" style="margin:2mm 0">حيث أن الموظف الموضحة بياناته أعلاه قد أوشك على إكمال فترة التجربة، نأمل تعبئة هذا النموذج وإعادته إلى الموارد البشرية قبل تاريخ انتهائها.</p>' +
    `<table class="tf-eval"><tr><th>#</th><th>معيار التقييم</th><th>الدرجة</th><th>التقييم</th></tr>${rows}<tr style="font-weight:800;background:#f0f6f4"><td colspan="2">المجموع</td><td colspan="2">${total}%</td></tr></table>` +
    box(`<b>توصيات واعتماد المدير المباشر:</b> ${esc(f.rec)}<div style="min-height:4mm"></div>`) +
    box(
      `<b>القرار النهائي:</b> &nbsp; <span class="tf-chk${d === "appoint" ? " on" : ""}"></span> تثبيت الموظف &nbsp;&nbsp; <span class="tf-chk${d === "terminate" ? " on" : ""}"></span> إنهاء خدمته &nbsp;&nbsp; <span class="tf-chk${d === "extend" ? " on" : ""}"></span> تمديد فترة التجربة`,
    ) +
    hrSign(s, { extra: '<div style="text-align:center;font-weight:700;font-size:11.5px">المدير المباشر<br>التوقيع: ________________</div>' });
  return { type: "evaluation", title: "تقييم فترة التجربة", html: tfWrap("نموذج تقييم فترة التجربة", "Probationary Period Evaluation", body) };
}

/* 8) إشعار انتهاء عقد العمل (V114) */
export const CE_LAWS: Record<string, { art: string; ar: string }> = {
  m84: { art: "84", ar: "إنهاء من الشركة" },
  m74: { art: "74", ar: "اتفاق الطرفين" },
  m85: { art: "85", ar: "استقالة" },
  m75: { art: "75", ar: "استقالة قسرية" },
  m77: { art: "77", ar: "فصل تعسفي" },
  m80: { art: "80", ar: "فصل تأديبي" },
  m74r: { art: "74(4)", ar: "تقاعد" },
};
export function buildContractEnd(e: FormEmp, f: { join: string; last: string; law: string; other: string; ref: string; notes: string }, s: Signer): Built | string {
  if (!f.last) return "حدد تاريخ آخر يوم عمل";
  if (!f.law) return "اختر السند النظامي";
  if (f.law === "other" && !f.other.trim()) return "اكتب المادة/السند النظامي";
  const joinISO = f.join || e.contractJoin;
  const basis = f.law === "other" ? f.other.trim() : `المادة (${CE_LAWS[f.law].art}) من نظام العمل — ${CE_LAWS[f.law].ar}`;
  let ref = "";
  if (f.ref) {
    if (f.law === "m85" || f.law === "m75") ref = "، وذلك بناءً على استقالتكم المقدمة بتاريخ " + tfD(f.ref);
    else if (f.law === "m74") ref = "، وذلك بناءً على الاتفاق بين الطرفين بتاريخ " + tfD(f.ref);
  }
  const body =
    tfInfoTable(e) +
    box(`<div style="margin-bottom:4px"><b>تاريخ بداية العقد:</b> ${tfD(joinISO)}</div><div style="margin-bottom:4px"><b>تاريخ آخر يوم عمل:</b> ${tfD(f.last)}</div><div><b>السند النظامي:</b> ${esc(basis)}</div>`) +
    `<p class="tf-p" dir="rtl">المكرم/ ${esc(e.nameAr || e.nameEn)}، تحية طيبة وبعد,,</p>` +
    `<p class="tf-p" dir="rtl">إشارة إلى عقد العمل المبرم معكم بتاريخ ${tfD(joinISO)}، نرجو العلم بأنه سيتم إنهاء عقد العمل الخاص بكم على أن يكون آخر يوم عمل لكم بتاريخ <b>${tfD(f.last)}</b>${ref}، وذلك استناداً إلى <b>${esc(basis)}</b>.</p>` +
    (f.notes.trim() ? `<p class="tf-p" dir="rtl"><b>ملاحظات:</b> ${esc(f.notes.trim())}</p>` : "") +
    '<p class="tf-p" dir="rtl">وسيتم تسوية مستحقاتكم النظامية وفق أحكام نظام العمل. وعليه، يرجى منكم التكرم بإستلام هذا الإشعار وموافاتنا بنسخة موقعة منه.</p>' +
    '<p class="tf-p" dir="rtl">مع وافر أمنياتنا لكم بالتوفيق والنجاح,,</p>' +
    hrSign(s, { date: true }) +
    empAck(e, "بإستلام إشعار انتهاء عقد العمل.");
  return { type: "contract_end", title: "إشعار انتهاء عقد العمل", html: tfWrap("إشعار انتهاء عقد العمل", "Employment Contract Termination Notice", body) };
}

/* 9) خطاب تعريف بالراتب (V117, Arabic) */
const p2 = (n: number) => (n < 10 ? "0" : "") + n;
export function todayInfo() {
  const now = new Date();
  const g: Record<string, string> = {};
  const h: Record<string, string> = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).forEach((p) => (g[p.type] = p.value));
  new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "numeric", year: "numeric" }).formatToParts(now).forEach((p) => (h[p.type] = p.value));
  return { gd: g.day, gm: g.month, gy: g.year, hd: p2(+h.day), hm: p2(+h.month), hy: (h.year || "").replace(/\D/g, ""), ymd: g.year + g.month + g.day };
}
const seqKey = () => "ariba_sc_seq_" + todayInfo().ymd;
export function nextRef() {
  let n = 0;
  try {
    n = parseInt(localStorage.getItem(seqKey()) || "0") || 0;
  } catch {
    n = 0;
  }
  return "AR-" + todayInfo().ymd + "-" + (n + 1);
}
export function consumeRef() {
  try {
    localStorage.setItem(seqKey(), String((parseInt(localStorage.getItem(seqKey()) || "0") || 0) + 1));
  } catch {
    /* storage unavailable */
  }
}
export const acctFromIban = (iban: string) => {
  const s = String(iban || "").replace(/\s+/g, "");
  return /^SA\d{22}$/i.test(s) ? s.slice(6) : "";
};

export interface SalaryCertData {
  to: string;
  nameAr: string;
  empNo: string;
  join: string;
  natAr: string;
  jobAr: string;
  id: string;
  placeAr: string;
  basic: number;
  housing: number;
  transport: number;
  other: number;
  bankOn: boolean;
  iban: string;
  bank: string;
  acct: string;
  ref: string;
  seal: boolean;
}

export function salaryCertMissing(d: SalaryCertData): string[] {
  const m: string[] = [];
  const chk = (ok: unknown, l: string) => !ok && m.push(l);
  chk(d.to, "الجهة الموجه إليها الخطاب");
  chk(d.nameAr, "اسم الموظف");
  chk(d.empNo, "الرقم الوظيفي");
  chk(d.join, "تاريخ التعيين");
  chk(d.natAr, "الجنسية");
  chk(d.jobAr, "المسمى الوظيفي");
  chk(d.id, "رقم الهوية / الإقامة");
  chk(d.placeAr, "مكان الإصدار");
  chk(d.basic + d.housing + d.transport + d.other > 0, "الراتب (الأساسي على الأقل)");
  if (d.bankOn) chk(d.iban, "IBAN");
  return m;
}

export function buildSalaryCert(d: SalaryCertData, s: Signer): Built {
  const t = todayInfo();
  const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 });
  const X1 = (v: unknown) => esc(v == null || v === "" ? "—" : v);
  const amt = (n: number) => money(n) + " ر.س";
  const total = d.basic + d.housing + d.transport + d.other;
  const dmy = (iso: string) => {
    const a = String(iso || "").slice(0, 10).split("-");
    return a.length === 3 && a[0] ? `${a[2]}/${a[1]}/${a[0]}` : "";
  };
  const P = (h: string, ex = "justify") => `<p class="tf-p" dir="rtl" style="text-align:${ex};margin:0 0 3mm">${h}</p>`;
  const css =
    "<style>.sc-ref{font-size:12.5px;line-height:1.9;margin:0 0 4mm}.sc-t{width:100%;border-collapse:collapse;border:2px solid #111;margin:3.5mm 0;table-layout:fixed}.sc-t td{border:1px solid #222;padding:5px 6px;font-size:12px;text-align:center;vertical-align:middle;height:9mm;word-break:break-word}.sc-l{background:#014D3D;color:#fff;font-weight:800}.sc-s{background:#29B35E;color:#fff;font-weight:800}.sc-v{font-weight:700;color:#111}</style>";
  const lab = (x: string, cls = "sc-l", extra = "") => `<td class="${cls}"${extra}>${x}</td>`;
  const vv = (x: unknown, extra = "") => `<td class="sc-v"${extra}>${X1(x)}</td>`;
  const table =
    '<table class="sc-t" dir="rtl"><colgroup><col style="width:19.1%"><col style="width:25%"><col style="width:22.1%"><col style="width:15%"><col style="width:18.8%"></colgroup>' +
    `<tr>${lab("الاســـــم")}${vv(d.nameAr, ' colspan="4"')}</tr>` +
    `<tr>${lab("الرقم الوظيفــي")}${vv(d.empNo)}${lab("تاريخ التعييـــن")}${vv(dmy(d.join), ' colspan="2"')}</tr>` +
    `<tr>${lab("الجنسيــــــة")}${vv(d.natAr)}${lab("المسمى الوظيفي")}${vv(d.jobAr, ' colspan="2"')}</tr>` +
    `<tr>${lab("الهويـــــــــة", "sc-l", ' rowspan="2"')}${vv(d.id, ' rowspan="2"')}${lab("الراتب", "sc-l", ' rowspan="5"')}${lab("الأساسي", "sc-s")}${vv(amt(d.basic))}</tr>` +
    `<tr>${lab("السكن", "sc-s")}${vv(amt(d.housing))}</tr>` +
    `<tr>${lab("مكـــان الإصـــدار", "sc-l", ' rowspan="3"')}${vv(d.placeAr, ' rowspan="3"')}${lab("المواصلات", "sc-s")}${vv(amt(d.transport))}</tr>` +
    `<tr>${lab("بدلات أخرى", "sc-s")}${vv(amt(d.other))}</tr>` +
    `<tr>${lab("الإجمالي", "sc-s")}<td class="sc-v" style="font-weight:900">${esc(amt(total))}</td></tr></table>`;
  const bank =
    d.bankOn && (d.iban || d.bank || d.acct)
      ? `<div class="tf-box" dir="rtl" style="text-align:right">${d.bank ? `<div><b>اسم البنك:</b> ${esc(d.bank)}</div>` : ""}${d.acct ? `<div><b>رقم الحساب:</b> <span dir="ltr">${esc(d.acct)}</span></div>` : ""}${d.iban ? `<div><b>IBAN:</b> <span dir="ltr">${esc(d.iban)}</span></div>` : ""}</div>`
      : "";
  const ref = `<div class="sc-ref" dir="rtl" style="text-align:right"><div><b>التاريــخ :</b> ${t.hd} / ${t.hm} / ${t.hy}هـ</div><div><b>الموافق:</b> ${t.gd} / ${t.gm} / ${t.gy}م</div><div><b>الصـــادر:</b> <span dir="ltr">${esc(d.ref)}</span></div></div>`;
  const sig = hrSign(d.seal ? s : { ...s, stamp: null, signature: null });
  const body =
    css +
    ref +
    P(`<b>السادة/ ${esc(d.to)} &nbsp;المحترمين</b>`, "start") +
    P("السلام عليكم ورحمة الله وبركاته...", "start") +
    P("نفيدكم نحن شركة حلول أريبا لخدمات الأعمال بأن الموظف الآتي بياناته يعمل لدينا حتى تاريخه:") +
    table +
    bank +
    P("وقد أعطي هذا التعريف بناءً على طلبه دون أدنى مسؤولية على الشركة.") +
    P("وتفضلوا بقبول فائق الشكر والتقدير...", "center") +
    sig;
  return { type: "salary_cert", title: "تعريف بالراتب", html: tfWrap("", "", body) };
}

/** Print a full document (V69 printHtml: no extra wrapper styles; waits for the fonts). */
export function printDoc(title: string, html: string) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("⚠️ المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع وحاول تاني");
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  const go = () => {
    try {
      w.print();
    } catch {
      /* closed */
    }
  };
  try {
    Promise.race([w.document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]).then(() => setTimeout(go, 150));
  } catch {
    setTimeout(go, 900);
  }
}
