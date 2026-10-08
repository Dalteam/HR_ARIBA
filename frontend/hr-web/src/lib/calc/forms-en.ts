// English (LTR) versions of the forms — same content rules as legacy forms/105-ariba-v117-forms-english.js.
// Sent together with the Arabic copy as `<arabic><!--ARIBA_EN--><english>`; printed when the English language is chosen.
import { esc, tfDEn, tfWrap, todayInfo, type Built, type FormEmp, type SalaryCertData, type Signer } from "./forms";

const DE = (v: string | Date | null | undefined) => (v ? tfDEn(v instanceof Date ? v.toISOString() : v) : "—");
const nm = (e: FormEmp) => e.nameEn || e.nameAr;
const nat = (e: FormEmp) => e.nationalityEn || e.nationality;
const dep = (e: FormEmp) => e.departmentEn || e.department;

function info(e: FormEmp) {
  const c = (l: string, v: string) => `<td class="tf-lbl">${l}</td><td class="tf-val">${esc(v || "—")}</td>`;
  return `<div class="tf-info-title">Employee details</div><table class="tf-info"><tr>${c("Name", nm(e))}${c("Nationality", nat(e))}</tr><tr>${c("ID / Iqama no.", e.iqamaNo)}${c("Employee no.", e.empNo)}</tr><tr>${c("Department", dep(e))}${c("Job title", e.jobTitle)}</tr></table>`;
}
const p = (t: string) => `<p class="tf-p" dir="ltr" style="text-align:left;margin:1.5mm 0">${t}</p>`;
const bx = (t: string) => `<div class="tf-box" dir="ltr" style="text-align:left">${t}</div>`;
const sgn = (l: string, r: string, mt = 5) => `<div class="tf-sign" dir="ltr" style="margin-top:${mt}mm"><div>${l}</div><div>${r}</div></div>`;
function hrs(s: Signer, opt: { date?: boolean; extra?: string } = {}) {
  if (s.show_signature === false) s = { ...s, signature: null };
  if (s.show_stamp === false) s = { ...s, stamp: null };
  const sig = s.signature ? `<img class="sg" src="${s.signature}">` : `<div style="font-family:cursive;font-size:16px;margin-top:10mm">${esc(s.name_ar)}</div>`;
  const stamp = s.stamp ? `<img class="st" src="${s.stamp}">` : "";
  const blk = `<div class="blk"><div style="font-weight:800">${esc(s.title_en || "HR Manager")}</div>${stamp}${sig}<div style="position:absolute;bottom:0;left:0;right:0;font-weight:800">${esc(s.name_ar)}</div></div>`;
  const other = opt.extra ?? (opt.date ? `<div style="font-weight:700">Date: ${DE(new Date())}</div>` : "<div></div>");
  return `<div class="hrsig" dir="ltr">${blk}${other}</div>`;
}
const ack = (e: FormEmp, txt: string) => bx(`I, ${esc(nm(e))}, ${txt}`) + sgn(`Employee: ${esc(nm(e))}<br>Signature: ________________`, "Date: ________________", 2);
const wrap = (title: string, body: string) => tfWrap(title, "", `<div dir="ltr" style="text-align:left">${body}</div>`);

export interface FormFields {
  f1: { manager: string; join: string; first: boolean; leaveType: string };
  custody: { n: string; s: string; c: string }[];
  f3: { join: string; end: string };
  f4: { join: string; last: string };
  f5: { join: string; last: string; reason: string; other: string };
  f6: { start: string; still: boolean; end: string; nature: string; no: string };
  f7: { join: string; end: string; rec: string; decision: string; scores: number[] };
  ce: { join: string; last: string; law: string; other: string; ref: string; notes: string };
}

const LW: Record<string, [string, string]> = {
  m84: ["84", "Termination by the Company"], m74: ["74", "Mutual agreement"], m85: ["85", "Resignation"], m75: ["75", "Constructive resignation"],
  m77: ["77", "Termination without valid reason"], m80: ["80", "Disciplinary dismissal"], m74r: ["74(4)", "Retirement"],
};

export function buildEnglish(type: string, e: FormEmp, f: FormFields, s: Signer): Built | null {
  const J = (j: string) => j || e.contractJoin;
  switch (type) {
    case "onboarding":
      return { type, title: "Onboarding Notice", html: wrap("Onboarding Notice",
        info(e) + bx(`<b>Joining date:</b> ${DE(J(f.f1.join))}`) +
        p(`Dear Sir/Madam, further to the employment notice, we inform you that the employee named above has commenced work at Ariba Business Solutions Company — ${esc(dep(e))} department.`) +
        p(`The employee commenced work on: <b>${DE(J(f.f1.join))}</b>.`) +
        sgn(`Direct manager: ${esc(f.f1.manager || e.manager || "—")}<br>Signature: ________________`, `Date: ${DE(new Date())}`) +
        bx(`<span class="tf-chk${f.f1.first ? " on" : ""}"></span> First-time joining &nbsp;&nbsp;&nbsp; <span class="tf-chk${!f.f1.first ? " on" : ""}"></span> Joining after returning from leave${f.f1.leaveType ? ` (${esc(f.f1.leaveType)})` : ""}`) +
        hrs(s, { date: true }) + sgn("CEO approval<br>Signature: ________________", "Date: ________________", 10)) };
    case "custody": {
      const rows = f.custody.filter((r) => r.n.trim());
      if (!rows.length) return null;
      return { type, title: "IT Custody Receipt", html: wrap("IT Custody Receipt",
        info(e) + `<table class="tf-bi"><tr><th style="width:8%">#</th><th>Item</th><th>Model / serial no.</th><th>Condition</th></tr>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.n)}</td><td>${esc(r.s || "—")}</td><td>${esc(r.c || "—")}</td></tr>`).join("")}</table>` +
        p("I, the employee named above, acknowledge receiving the IT custody listed above from Ariba Business Solutions Company. I undertake to take care of it, use it for company work only and return it upon request or at the end of my service.") +
        sgn(`Employee: ${esc(nm(e))}<br>Signature: ________________`, "Date: ________________") + sgn("On behalf of IT Department<br>Signature: ________________", "Date: ________________", 8)) };
    }
    case "extension":
      if (!f.f3.end) return null;
      return { type, title: "Probation Extension Notice", html: wrap("Probation Extension Notice",
        info(e) + bx(`<div><b>Contract start date:</b> ${DE(J(f.f3.join))}</div><div><b>Probation end date after extension:</b> ${DE(f.f3.end)}</div>`) +
        p(`Dear ${esc(nm(e))}, greetings,`) + p(`Referring to the employment contract concluded with you on ${DE(J(f.f3.join))}, please be informed that your probation period has been extended to a further period ending on <b>${DE(f.f3.end)}</b>.`) +
        p("Accordingly, kindly acknowledge receipt of this notice and return a signed copy to us.") + p("With our best wishes for your success,") + hrs(s, { date: true }) +
        ack(e, "agree to the extension of the probation period as stated above.")) };
    case "termination":
      if (!f.f4.last) return null;
      return { type, title: "Probation Termination Notice", html: wrap("Probation Termination Notice",
        info(e) + bx(`<div><b>Contract start date:</b> ${DE(J(f.f4.join))}</div><div><b>Last working day:</b> ${DE(f.f4.last)}</div>`) +
        p(`Dear ${esc(nm(e))}, greetings,`) + p(`Referring to the employment contract concluded with you on ${DE(J(f.f4.join))}, please be informed that your probation period is terminated, and your last working day under probation will be <b>${DE(f.f4.last)}</b>.`) +
        p("Accordingly, kindly acknowledge receipt of this notice and return a signed copy to us.") + p("With our best wishes for your success,") + hrs(s, { date: true }) +
        ack(e, "acknowledge receipt of the probation termination notice.")) };
    case "clearance":
      if (!f.f5.last) return null;
      return { type, title: "Final Clearance", html: wrap("Final Clearance",
        info(e) + bx(`<div><b>Joining date:</b> ${DE(J(f.f5.join))}</div><div><b>Last working day:</b> ${DE(f.f5.last)}</div>`) +
        bx(`Clearance reason: <span class="tf-chk${f.f5.reason === "resign" ? " on" : ""}"></span> Resignation &nbsp;&nbsp; <span class="tf-chk${f.f5.reason === "end" ? " on" : ""}"></span> Contract end &nbsp;&nbsp; <span class="tf-chk${f.f5.reason === "other" ? " on" : ""}"></span> Other${f.f5.reason === "other" && f.f5.other ? ": " + esc(f.f5.other) : ""}`) +
        p("We, Ariba Business Solutions Company, confirm that the employee named above has completed his/her work at the Company and handed over all custody in his/her possession, and has no dues or claims outstanding towards the Company.") +
        p("Accordingly, the employee is hereby cleared.") + hrs(s, { date: true })) };
    case "experience": {
      const nature = ({ "دوام كامل": "Full time", "دوام جزئي": "Part time", "عقد مؤقت": "Temporary contract" } as Record<string, string>)[f.f6.nature] || f.f6.nature || "Full time";
      return { type, title: "Experience Certificate", html: wrap("Experience Certificate",
        `<div class="meta-row"><div>Ref: ${esc(f.f6.no || `AR-${e.empNo}-${new Date().getFullYear()}`)}</div><div>Date: ${DE(new Date())}</div></div>` +
        p(`Ariba Business Solutions Company certifies that Mr./Ms. <b>${esc(nm(e))}</b>, ${esc(nat(e))} national, ID no. (${esc(e.iqamaNo)}), worked with us as (<b>${esc(e.jobTitle)}</b>) in the ${esc(dep(e))} department.`) +
        `<table class="tf-info"><tr><td class="tf-lbl">Contract type</td><td class="tf-val" colspan="3">Employment contract</td></tr><tr><td class="tf-lbl">Nature of contract</td><td class="tf-val" colspan="3">${esc(nature)}</td></tr><tr><td class="tf-lbl">Start date</td><td class="tf-val">${DE(f.f6.start || e.contractJoin)}</td><td class="tf-lbl">End date</td><td class="tf-val">${f.f6.still ? "Still employed to date" : DE(f.f6.end)}</td></tr></table>` +
        p("During the period of employment he/she carried out the tasks assigned and was of good conduct.") + p("We thank him/her for the efforts during that period and wish him/her every success.") +
        p("This certificate was issued at his/her request without any liability on the Company.") + p("Best regards,") + hrs(s)) };
    }
    case "evaluation": {
      const crit = ["Technical knowledge in his/her field", "Compliance with company rules and regulations", "Quality of work output", "Relationship with management and colleagues", "Ability to learn, develop and take initiative"];
      const lab: Record<number, string> = { 0: "Unsatisfactory", 50: "Below expectations", 70: "Meets expectations", 90: "Exceeds expectations", 100: "Outstanding" };
      const sc = f.f7.scores.length ? f.f7.scores : [70, 70, 70, 70, 70];
      const tot = Math.round(sc.reduce((a, b) => a + b, 0) / sc.length);
      const d = f.f7.decision;
      return { type, title: "Probation Evaluation", html: wrap("Probationary Period Evaluation",
        info(e) + bx(`<b>Contract start date:</b> ${DE(J(f.f7.join))} &nbsp;&nbsp; <b>Probation end date:</b> ${DE(f.f7.end)}`) +
        p("The employee above is about to complete the probation period. Please complete this form and return it to Human Resources before it ends.") +
        `<table class="tf-eval"><tr><th>#</th><th>Criterion</th><th>Score</th><th>Rating</th></tr>${crit.map((c, i) => `<tr><td>${i + 1}</td><td style="text-align:left;padding-left:8px">${c}</td><td>${sc[i] || 0}%</td><td>${lab[sc[i] || 0] || ""}</td></tr>`).join("")}<tr style="font-weight:800;background:#f0f6f4"><td colspan="2">Total</td><td colspan="2">${tot}%</td></tr></table>` +
        bx(`<b>Direct manager recommendations:</b> ${esc(f.f7.rec)}<div style="min-height:4mm"></div>`) +
        bx(`<b>Final decision:</b> &nbsp; <span class="tf-chk${d === "appoint" ? " on" : ""}"></span> Confirm employment &nbsp;&nbsp; <span class="tf-chk${d === "terminate" ? " on" : ""}"></span> Terminate &nbsp;&nbsp; <span class="tf-chk${d === "extend" ? " on" : ""}"></span> Extend probation`) +
        hrs(s, { extra: '<div style="text-align:center;font-weight:700;font-size:11.5px">Direct manager<br>Signature: ________________</div>' })) };
    }
    case "contract_end": {
      const c = f.ce;
      if (!c.last || !c.law || (c.law === "other" && !c.other.trim())) return null;
      const basis = c.law === "other" ? c.other.trim() : `Article (${LW[c.law][0]}) of the Labor Law — ${LW[c.law][1]}`;
      const r = c.ref ? (c.law === "m85" || c.law === "m75" ? `, based on your resignation submitted on ${DE(c.ref)}` : c.law === "m74" ? `, based on the mutual agreement dated ${DE(c.ref)}` : "") : "";
      return { type, title: "Employment Contract Termination Notice", html: wrap("Employment Contract Termination Notice",
        info(e) + bx(`<div><b>Contract start date:</b> ${DE(J(c.join))}</div><div><b>Last working day:</b> ${DE(c.last)}</div><div><b>Legal basis:</b> ${esc(basis)}</div>`) +
        p(`Dear ${esc(nm(e))}, greetings,`) + p(`Referring to the employment contract concluded with you on ${DE(J(c.join))}, please be informed that your employment contract will be terminated with your last working day on <b>${DE(c.last)}</b>${r}, pursuant to <b>${esc(basis)}</b>.`) +
        (c.notes.trim() ? p(`<b>Notes:</b> ${esc(c.notes.trim())}`) : "") +
        p("Your statutory entitlements will be settled in accordance with the Labor Law. Accordingly, kindly acknowledge receipt of this notice and return a signed copy to us.") +
        p("With our best wishes for your success,") + hrs(s, { date: true }) + ack(e, "acknowledge receipt of the employment contract termination notice.")) };
    }
  }
  return null;
}

/** English salary certificate (legacy scHtml('en')): same table, Hijri + Gregorian date, ref, bank box, signature. */
export function buildSalaryCertEn(d: SalaryCertData & { nameEn: string; natEn: string; jobEn: string; placeEn: string; toEn: string }, s: Signer): Built {
  const t = todayInfo();
  const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 });
  const amt = (n: number) => money(n) + " SAR";
  const X1 = (v: unknown) => esc(v == null || v === "" ? "—" : v);
  const total = d.basic + d.housing + d.transport + d.other;
  const dmy = (iso: string) => { const a = String(iso || "").slice(0, 10).split("-"); return a.length === 3 && a[0] ? `${a[2]}/${a[1]}/${a[0]}` : ""; };
  const P = (h: string, ex = "justify") => `<p class="tf-p" dir="ltr" style="text-align:${ex};margin:0 0 3mm">${h}</p>`;
  const css = "<style>.sc-ref{font-size:12.5px;line-height:1.9;margin:0 0 4mm}.sc-t{width:100%;border-collapse:collapse;border:2px solid #111;margin:3.5mm 0;table-layout:fixed}.sc-t td{border:1px solid #222;padding:5px 6px;font-size:12px;text-align:center;vertical-align:middle;height:9mm;word-break:break-word}.sc-l{background:#014D3D;color:#fff;font-weight:800}.sc-s{background:#29B35E;color:#fff;font-weight:800}.sc-v{font-weight:700;color:#111}</style>";
  const lab = (x: string, cls = "sc-l", extra = "") => `<td class="${cls}"${extra}>${x}</td>`;
  const vv = (x: unknown, extra = "") => `<td class="sc-v"${extra}>${X1(x)}</td>`;
  const table = '<table class="sc-t" dir="ltr"><colgroup><col style="width:19.1%"><col style="width:25%"><col style="width:22.1%"><col style="width:15%"><col style="width:18.8%"></colgroup>' +
    `<tr>${lab("Name")}${vv(d.nameEn, ' colspan="4"')}</tr><tr>${lab("Employee No.")}${vv(d.empNo)}${lab("Hire date")}${vv(dmy(d.join), ' colspan="2"')}</tr>` +
    `<tr>${lab("Nationality")}${vv(d.natEn)}${lab("Job title")}${vv(d.jobEn, ' colspan="2"')}</tr>` +
    `<tr>${lab("ID / Iqama No.", "sc-l", ' rowspan="2"')}${vv(d.id, ' rowspan="2"')}${lab("Salary", "sc-l", ' rowspan="5"')}${lab("Basic", "sc-s")}${vv(amt(d.basic))}</tr>` +
    `<tr>${lab("Housing", "sc-s")}${vv(amt(d.housing))}</tr><tr>${lab("Place of issue", "sc-l", ' rowspan="3"')}${vv(d.placeEn, ' rowspan="3"')}${lab("Transport", "sc-s")}${vv(amt(d.transport))}</tr>` +
    `<tr>${lab("Other allowances", "sc-s")}${vv(amt(d.other))}</tr><tr>${lab("Total", "sc-s")}<td class="sc-v" style="font-weight:900">${esc(amt(total))}</td></tr></table>`;
  const bank = d.bankOn && (d.iban || d.bank || d.acct)
    ? `<div class="tf-box" dir="ltr" style="text-align:left">${d.bank ? `<div><b>Bank name:</b> ${esc(d.bank)}</div>` : ""}${d.acct ? `<div><b>Account number:</b> ${esc(d.acct)}</div>` : ""}${d.iban ? `<div><b>IBAN:</b> ${esc(d.iban)}</div>` : ""}</div>` : "";
  const ref = `<div class="sc-ref" dir="ltr" style="text-align:left"><div><b>Date:</b> ${t.hd} / ${t.hm} / ${t.hy} AH &nbsp;&nbsp; <b>Corresponding to:</b> ${t.gd} / ${t.gm} / ${t.gy}</div><div><b>Ref:</b> ${esc(d.ref)}</div></div>`;
  const body = css + ref + P(`<b>Messrs. ${esc(d.toEn || d.to)}</b>`, "start") + P("Greetings and peace be upon you...", "start") +
    P("We, Ariba Business Solutions Company, hereby confirm that the employee whose details are below is employed with us up to the date of this letter:") +
    table + bank + P("This certificate was issued at his/her request without any liability on the Company.") + P("With our best regards...", "center") +
    hrs(d.seal ? s : { ...s, stamp: null, signature: null });
  return { type: "salary_cert", title: "Salary Certificate", html: tfWrap("", "", body) };
}
