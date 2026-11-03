// The job-offer letter for a candidate — port of the updated design's pages/forms/docs.js `offerHtml` and its card in
// pages/forms/index.jsx (`TF_OFFER_CARD`): a candidate who has no employee record, the salary components the salary
// calculator produced (lib/offer-draft.ts), the position, the contract type, the proposed joining date, the annual
// leave, the medical coverage and the letter's language. It prints on our letterhead with the HR signature block from
// Settings. It is a printed document only — there is no employee to send it to, so it never goes through /letters.

import { esc, hrSign, tfWrap, type Built, type Signer } from "./forms";

export interface OfferFields {
  /** the candidate — the only required field (the design's «اسم المرشح *») */
  name: string;
  basic: number | string;
  housing: number | string;
  transport: number | string;
  project: number | string;
  other: number | string;
  /** the name HR typed for the "other" allowance */
  otherLabel: string;
  job: string;
  contractType: string;
  joinDate: string;
  leave: number | string;
  date: string;
  medical: string;
  lang: "ar" | "en";
}

export interface OfferCompany {
  nameAr: string;
  nameEn: string;
}

const num = (v: unknown) => {
  const n = parseFloat(String(v == null ? "" : v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** the design's own dmy: YYYY-MM-DD → DD/MM/YYYY (padded, unlike lib/format's) */
const dmy = (s: string) => {
  const a = String(s || "").slice(0, 10).split("-");
  return a.length === 3 && a[0] ? a[2] + "/" + a[1] + "/" + a[0] : "";
};
/** the empty cell of the printed letter */
const DOTS = "……………………………";

/**
 * The letter. Returns the design's `{ title, html }`, or the reason it cannot be made (a missing candidate name).
 * The design takes the company name from its settings and drops the leading «شركة » because the sentence says
 * «فريق شركة …»; ours comes from /settings/company with the same handling.
 */
export function buildOffer(f: OfferFields, signer: Signer, company: OfferCompany): Built | string {
  if (!f.name.trim()) return "اكتب اسم المرشح";
  const en = f.lang === "en";
  const coAr = company.nameAr.trim().replace(/^\s*شركة\s+/, "") || "حلول أريبا لخدمات الأعمال";
  const coEn = company.nameEn.trim() || "Ariba Business Solutions";
  const co = en ? coEn : coAr;
  const cur = en ? "SAR" : "ريال سعودي";
  const gross = [f.basic, f.housing, f.transport, f.project, f.other].reduce<number>((a, v) => a + num(v), 0);
  const L = en
    ? {
        title: "Job Offer",
        sub: "",
        date: "Date",
        dear: "Mr./Ms.",
        intro: "We are pleased to offer you a position with the team of " + co + ".",
        job: "Position",
        basic: "Monthly basic salary",
        hou: "Housing allowance",
        tra: "Transportation allowance",
        prj: "Project allowance",
        oth: "Other allowances",
        tot: "Total monthly salary",
        leave: "Annual leave",
        leaveV: (f.leave || "21") + " working days",
        med: "Medical coverage",
        medV: f.medical.trim() || "As per company policy",
        ct: "Contract type",
        join: "Proposed joining date",
        acc: "Acceptance",
        yes: "Yes",
        no: "No",
        nm: "Name",
        dt: "Date",
        sg: "Signature",
      }
    : {
        title: "عرض وظيفي",
        sub: "Job Offer",
        date: "التاريخ",
        dear: "الأستاذ/",
        intro: "يسعدنا أن نقدم لك العرض الوظيفي للعمل ضمن فريق شركة " + co + ".",
        job: "الوظيفة",
        basic: "الراتب الأساسي الشهري",
        hou: "بدل السكن",
        tra: "بدل المواصلات",
        prj: "بدل مشروع",
        oth: "بدلات أخرى",
        tot: "إجمالي الراتب الشهري",
        leave: "الإجازة السنوية",
        leaveV: (f.leave || "21") + " يوم عمل",
        med: "التغطية الطبية",
        medV: f.medical.trim() || "حسب سياسة الشركة",
        ct: "نوع العقد",
        join: "تاريخ الانضمام المقترح",
        acc: "القبول",
        yes: "نعم",
        no: "لا",
        nm: "الاسم",
        dt: "التاريخ",
        sg: "التوقيع",
      };
  const amt = (v: number | string) => (num(v) ? money(num(v)) + " " + cur : "—");
  const rows: [string, string][] = [
    [L.job, esc(f.job) || DOTS],
    [L.basic, amt(f.basic)],
    [L.hou, amt(f.housing)],
    [L.tra, amt(f.transport)],
  ];
  if (num(f.project)) rows.push([L.prj, amt(f.project)]);
  if (num(f.other)) rows.push([esc(f.otherLabel.trim()) || L.oth, amt(f.other)]);
  rows.push([L.tot, "<b>" + (gross ? money(gross) + " " + cur : "—") + "</b>"]);
  rows.push([L.leave, esc(L.leaveV)]);
  rows.push([L.med, esc(L.medV)]);
  rows.push([L.ct, esc(f.contractType) || DOTS]);
  rows.push([L.join, dmy(f.joinDate) || DOTS]);
  const table =
    '<table class="tf-info" style="margin-top:3mm">' +
    rows
      .map(([label, value]) => {
        const hi = label === L.tot;
        return (
          `<tr><td class="tf-lbl" style="width:38%${hi ? ";background:#dff0e6" : ""}">${label}</td>` +
          `<td class="tf-val" colspan="3"${hi ? ' style="background:#f1f8f4"' : ""}>${value}</td></tr>`
        );
      })
      .join("") +
    "</table>";
  const accept =
    '<div style="border:1px solid #cfdcd5;border-radius:6px;padding:3mm 5mm;margin-top:5mm;font-size:13px">' +
    `<b>${L.acc}:</b> &nbsp;&nbsp; ${L.yes} ( &nbsp;&nbsp; ) &nbsp;&nbsp;&nbsp;&nbsp; ${L.no} ( &nbsp;&nbsp; )</div>`;
  const candidate =
    '<div style="margin-top:5mm;display:flex;gap:10mm;justify-content:space-between;font-size:12.5px;page-break-inside:avoid">' +
    `<div style="flex:1">${L.nm}: ${DOTS}</div><div style="flex:1">${L.dt}: ${DOTS}</div><div style="flex:1">${L.sg}: ${DOTS}</div></div>`;
  // the HR signer: his own name and title, the English title when the letter is English
  const sg = en ? { ...signer, title_ar: signer.title_en || signer.title_ar } : signer;
  const body =
    `<div class="meta-row"><div></div><div>${L.date}: ${dmy(f.date)}</div></div>` +
    `<p class="tf-p" style="margin-top:3mm"><b>${L.dear} ${esc(f.name.trim())}</b></p>` +
    `<p class="tf-p">${L.intro}</p>` +
    table +
    accept +
    candidate +
    hrSign(sg);
  const wrapped = en ? '<div dir="ltr" style="text-align:left">' + body + "</div>" : body;
  return { type: "offer", title: L.title, html: tfWrap(L.title, L.sub, wrapped) };
}
