"use client";

// Two report tools of the updated design's reports page on OUR data:
// - CustomReport (its reports/CustomReport.jsx): any employee columns from OUR employee list, salary basis, documents
//   registry and leave balances. Left out, because no list route returns them: mobile, e-mail, religion, direct
//   manager, number of dependents and bank account number.
// - LeaveReport (its reports/LeaveReport.jsx): the chosen year's ledger of every employee (OUR /leave/balances/{id}),
//   the totals since joining, the days used by type and the request counts (OUR /requests).
import { useEffect, useMemo, useState } from "react";
import { PageState } from "@/components/hr/not-built";
import { ReportBuilder, type Col, type Person } from "@/components/hr/report-builder";
import type { EmployeeListItem } from "@/lib/api";
import { listAllEmployees } from "@/lib/employees";
import { ddmmyyyy } from "@/lib/format";
import { balanceDetail, listBalances, listRequests, type BalanceDetail, type BalanceRow, type HrRequest } from "@/lib/leave";
import { listDocRegistry, type DocRow } from "@/lib/registry";
import { getSalaryBasis, type SalaryBasisRow } from "@/lib/salary";

const fD = (d: string | null | undefined) => (d ? ddmmyyyy(d) : "");
const r2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
const age = (d: string | null) => { if (!d) return ""; const b = new Date(d), n = new Date(); if (isNaN(b.getTime())) return ""; let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
const person = (e: EmployeeListItem): Person => ({ id: e.id, empNo: e.emp_no, nameAr: e.name_ar, nameEn: e.name_en ?? "", employer: e.workplace?.name_ar ?? "", dept: e.department?.name_ar ?? "", terminated: e.is_terminated });
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

type CR = Person & { e: EmployeeListItem; s?: SalaryBasisRow; d?: DocRow; b?: BalanceRow };
const G = <R, C>(grp: string, list: [string, string, string, (r: R, c: C) => string | number, boolean?][]): Col<R, C>[] => list.map(([k, ar, en, get, num]) => ({ grp, k, ar, en, get, num }));
const CUSTOM: Col<CR, { en: boolean }>[] = [
  ...G<CR, { en: boolean }>("البيانات الشخصية", [
    ["empNo", "الرقم الوظيفي", "Employee no.", (r) => r.empNo], ["nameAr", "الاسم بالعربي", "Name (AR)", (r) => r.nameAr], ["nameEn", "الاسم بالإنجليزي", "Name (EN)", (r) => r.nameEn],
    ["nationality", "الجنسية", "Nationality", (r) => r.e.nationality?.name_ar ?? ""], ["dob", "تاريخ الميلاد", "Birth date", (r) => fD(r.s?.birth_date)], ["age", "العمر", "Age", (r) => age(r.s?.birth_date ?? null)],
  ]),
  ...G<CR, { en: boolean }>("الوظيفة", [["employer", "جهة العمل", "Employer", (r) => r.employer], ["dept", "القسم", "Department", (r) => r.dept], ["jobTitle", "الوظيفة", "Job title", (r) => r.e.job_title ?? ""]]),
  ...G<CR, { en: boolean }>("الوثائق", [
    ["iqamaNo", "رقم الهوية/الإقامة", "ID/Iqama no.", (r) => r.d?.national_id ?? r.e.national_id_masked ?? ""], ["iqamaExpiry", "انتهاء الإقامة", "Iqama expiry", (r) => fD(r.d?.national_id_expiry ?? r.e.national_id_expiry)],
    ["passportNo", "رقم الجواز", "Passport no.", (r) => r.d?.passport_no ?? ""], ["passportExpiry", "انتهاء الجواز", "Passport expiry", (r) => fD(r.d?.passport_expiry)],
    ["insuranceCo", "شركة التأمين", "Insurer", (r) => r.d?.insurance_company ?? ""], ["insuranceClass", "فئة التأمين", "Insurance class", (r) => r.d?.insurance_class ?? ""],
    ["insuranceCard", "رقم بطاقة التأمين", "Insurance card", (r) => r.d?.insurance_card_no ?? ""], ["insuranceExpiry", "انتهاء التأمين", "Insurance expiry", (r) => fD(r.d?.insurance_expiry)],
  ]),
  ...G<CR, { en: boolean }>("العقد والإجازات", [
    ["contractType", "نوع العقد", "Contract type", (r) => r.d?.contract_type ?? ""], ["contractJoin", "تاريخ المباشرة", "Join date", (r) => fD(r.e.join_date)], ["contractEnd", "انتهاء العقد", "Contract end", (r) => fD(r.e.contract_end_date)],
    ["yos", "سنوات الخدمة", "Years of service", (r) => r2(r.e.years_of_service), true], ["leaveBalance", "رصيد الإجازة", "Leave balance", (r) => (r.b ? r2(r.b.current) : ""), true],
  ]),
  ...G<CR, { en: boolean }>("الراتب", [
    ["salary", "الراتب الأساسي", "Basic salary", (r) => r2(r.s?.basic_salary), true], ["housing", "بدل السكن", "Housing", (r) => r2(r.s?.housing_allowance), true], ["transport", "بدل المواصلات", "Transport", (r) => r2(r.s?.transport_allowance), true],
    ["salaryTotal", "إجمالي الراتب", "Total salary", (r) => r2(r.s?.total_salary), true], ["netSalary", "صافي الراتب", "Net salary", (r) => r2(r.s?.net_salary), true], ["currency", "العملة", "Currency", (r) => r.s?.currency ?? ""],
  ]),
  ...G<CR, { en: boolean }>("البنك", [["bank", "البنك", "Bank", (r) => r.s?.bank_name ?? ""], ["iban", "الآيبان IBAN", "IBAN", (r) => r.s?.iban ?? ""]]),
];

export function CustomReport() {
  const [rows, setRows] = useState<CR[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([listAllEmployees({ tab: "all", sort: "name_ar" }), getSalaryBasis().catch(() => [] as SalaryBasisRow[]), listDocRegistry().catch(() => [] as DocRow[]), listBalances().catch(() => [] as BalanceRow[])])
      .then(([p, s, d, b]) => {
        const S = new Map(s.map((x) => [String(x.id), x])), D = new Map(d.map((x) => [String(x.id), x])), B = new Map(b.map((x) => [String(x.employee_id), x]));
        setRows(p.items.map((e) => ({ ...person(e), e, s: S.get(e.id), d: D.get(e.id), b: B.get(e.id) })));
      })
      .catch((e) => setError(err(e)));
  }, []);
  if (!rows) return <div className="card" style={{ marginBottom: 14 }}><PageState loading={!error} error={error} /></div>;
  return (
    <ReportBuilder<CR, { en: boolean }>
      id="CR_BOX" icon="ti-adjustments-horizontal" title={["منشئ التقارير المخصص", "Custom report builder"]} sub={["اختر الأعمدة والموظفين ثم صدّر PDF أو Excel أو Word أو أرسله بالإيميل", "Pick columns & employees, then export or email"]}
      catalog={CUSTOM} rows={rows} ctx={(en) => ({ en })} storageKey="ariba_cr_templates_v1" allowTerminated
      groupsEn={{ "البيانات الشخصية": "Personal", "الوظيفة": "Job", "الوثائق": "Documents", "العقد والإجازات": "Contract & leave", "الراتب": "Salary", "البنك": "Bank" }}
      groupIcons={{ "البيانات الشخصية": "ti-user", "الوظيفة": "ti-briefcase", "الوثائق": "ti-id", "العقد والإجازات": "ti-file-text", "الراتب": "ti-cash", "البنك": "ti-building-bank" }}
      defaults={["empNo", "nameAr", "jobTitle", "nationality"]}
      presets={[
        ["أساسي", "Basic", ["empNo", "nameAr", "jobTitle", "dept", "employer", "nationality"], "ti-list"],
        ["الوثائق والانتهاء", "Documents & expiry", ["empNo", "nameAr", "iqamaNo", "iqamaExpiry", "passportNo", "passportExpiry", "insuranceExpiry"], "ti-id"],
        ["العقود", "Contracts", ["empNo", "nameAr", "contractType", "contractJoin", "contractEnd", "yos", "leaveBalance"], "ti-file-text"],
        ["الرواتب والبنك", "Payroll & bank", ["empNo", "nameAr", "salary", "salaryTotal", "netSalary", "bank", "iban"], "ti-cash"],
      ]}
    />
  );
}

type LR = Person & { e: EmployeeListItem; b?: BalanceRow; det?: BalanceDetail; reqs: HrRequest[] };
type LC = { y: number; cur: boolean; en: boolean };
const ledger = (r: LR, y: number) => r.det?.years.find((l) => l.year === y);
const inYear = (q: HrRequest, y: number) => String(q.from_date || q.on_date || "").slice(0, 4) === String(y) || String(q.to_date || "").slice(0, 4) === String(y);
const typeDays = (r: LR, y: number, types: string[]) => r2(r.reqs.filter((q) => q.status === "approved" && types.includes(q.type) && inYear(q, y)).reduce((s, q) => s + (Number(q.days) || 0), 0));
const cnt = (r: LR, y: number, st: string) => r.reqs.filter((q) => q.status === st && inYear(q, y)).length;
const LEAVE: Col<LR, LC>[] = [
  ...G<LR, LC>("الموظف", [
    ["empNo", "الرقم الوظيفي", "Emp. no.", (r) => r.empNo], ["nameAr", "الاسم", "Name", (r, c) => (c.en ? r.nameEn || r.nameAr : r.nameAr)], ["dept", "القسم", "Department", (r) => r.dept],
    ["employer", "جهة العمل", "Employer", (r) => r.employer], ["jobTitle", "المسمى الوظيفي", "Job title", (r) => r.e.job_title ?? ""], ["join", "تاريخ المباشرة", "Join date", (r) => fD(r.e.join_date)], ["svc", "سنوات الخدمة", "Service (yrs)", (r) => r2(r.e.years_of_service)],
  ]),
  ...G<LR, LC>("أرصدة السنة المختارة", [
    ["annual", "الاستحقاق السنوي بالعقد (يوم)", "Contract annual entitlement", (r) => r2(r.b?.annual)],
    ["carry", "الرصيد السابق المرحَّل", "Carried-in balance", (r, c) => r2(ledger(r, c.y)?.opening), true],
    ["entitle", "المستحق للسنة", "Year entitlement", (r, c) => r2(ledger(r, c.y)?.entitlement), true],
    ["accrued", "المستحق حتى اليوم", "Accrued to date", (r, c) => { const l = ledger(r, c.y); return l ? r2(c.cur && r.det ? r.det.summary.current - l.opening - l.adjustment + l.used : l.entitlement) : 0; }, true],
    ["adj", "التعديلات اليدوية", "Manual adjustments", (r, c) => r2(ledger(r, c.y)?.adjustment), true],
    ["pct", "نسبة المستخدم %", "Used %", (r, c) => { const l = ledger(r, c.y); return l && l.entitlement ? Math.round((l.used / l.entitlement) * 100) : 0; }],
    ["used", "المستخدم", "Used", (r, c) => r2(ledger(r, c.y)?.used), true],
    ["balance", "الرصيد الحالي (المتبقي)", "Current balance", (r, c) => r2(c.cur ? r.b?.current : ledger(r, c.y)?.close), true],
    ["yearEnd", "رصيد نهاية السنة", "Year-end balance", (r, c) => r2(ledger(r, c.y)?.close), true],
    ["carryNext", "المرحَّل للسنة التالية", "Carry to next year", (r, c) => r2(ledger(r, c.y)?.carry), true],
    ["eosYear", "فائض نهاية الخدمة (السنة)", "EOS excess (year)", (r, c) => r2(ledger(r, c.y)?.eos), true],
  ]),
  ...G<LR, LC>("المجمَّع من بداية الخدمة", [
    ["cumAcc", "إجمالي المستحق منذ المباشرة", "Total accrued", (r) => r2(r.b?.accrued_since_join), true], ["cumUsed", "إجمالي المستخدم منذ المباشرة", "Total used", (r) => r2(r.b?.used_since_join), true],
    ["cumBal", "الرصيد المجمَّع المتبقي", "Accumulated balance", (r) => r2(r.b?.remaining_since_join), true], ["cumEos", "فائض نهاية الخدمة المجمَّع", "Accumulated EOS excess", (r) => r2(r.det?.accumulated_eos), true],
    ["projected", "المتوقع في نهاية السنة الحالية", "Projected year-end", (r) => r2(r.b?.year_end), true],
  ]),
  ...G<LR, LC>("الإجازات المستخدمة حسب النوع (أيام السنة)", [
    ["d_annual", "سنوية", "Annual", (r, c) => typeDays(r, c.y, ["annual"]), true], ["d_sick", "مرضية", "Sick", (r, c) => typeDays(r, c.y, ["sick"]), true],
    ["d_emerg", "اضطرارية", "Emergency", (r, c) => typeDays(r, c.y, ["emergency"]), true], ["d_death", "وفاة", "Bereavement", (r, c) => typeDays(r, c.y, ["death"]), true],
    ["d_marr", "زواج", "Marriage", (r, c) => typeDays(r, c.y, ["marriage"]), true], ["d_mat", "أمومة / أبوة", "Maternity / paternity", (r, c) => typeDays(r, c.y, ["maternity", "paternity"]), true],
    ["d_hajj", "حج / عمرة", "Hajj / Umrah", (r, c) => typeDays(r, c.y, ["hajj", "umrah"]), true], ["d_unpaid", "بدون راتب", "Unpaid", (r, c) => typeDays(r, c.y, ["unpaid"]), true],
    ["d_remote", "عن بعد", "Remote", (r, c) => typeDays(r, c.y, ["remote"]), true],
  ]),
  ...G<LR, LC>("حالة الطلبات", [
    ["n_app", "عدد الطلبات المعتمدة", "Approved requests", (r, c) => cnt(r, c.y, "approved"), true], ["n_pen", "عدد الطلبات المعلقة", "Pending requests", (r, c) => cnt(r, c.y, "pending"), true],
    ["n_can", "عدد الإجازات الملغاة", "Cancelled", (r, c) => cnt(r, c.y, "cancelled"), true], ["n_rej", "عدد الطلبات المرفوضة", "Rejected", (r, c) => cnt(r, c.y, "rejected"), true],
    ["last", "آخر إجازة معتمدة (من)", "Last approved leave", (r) => { const a = r.reqs.filter((q) => q.status === "approved" && q.from_date).sort((x, z) => String(z.from_date).localeCompare(String(x.from_date)))[0]; return a ? fD(a.from_date) : "—"; }],
  ]),
];
const L_DEFAULT = ["empNo", "nameAr", "dept", "carry", "entitle", "used", "adj", "balance", "cumBal"];
const L_FULL = ["empNo", "nameAr", "dept", "join", "annual", "carry", "entitle", "accrued", "adj", "used", "balance", "yearEnd", "carryNext", "cumAcc", "cumUsed", "cumBal", "cumEos"];

export function LeaveReport() {
  const yNow = new Date().getFullYear();
  const [y, setY] = useState(yNow);
  const [rows, setRows] = useState<LR[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const [p, b, reqs] = await Promise.all([listAllEmployees({ tab: "active", sort: "name_ar" }), listBalances(), listRequests()]);
      const B = new Map(b.map((x) => [String(x.employee_id), x]));
      // each employee's yearly ledger: a few requests at a time
      const det = new Map<string, BalanceDetail>();
      for (let i = 0; i < p.items.length; i += 6)
        await Promise.all(p.items.slice(i, i + 6).map((e) => balanceDetail(e.id).then((d) => det.set(e.id, d)).catch(() => undefined)));
      setRows(p.items.map((e) => ({ ...person(e), e, b: B.get(e.id), det: det.get(e.id), reqs: reqs.filter((q) => q.employee_id === e.id) })));
    })().catch((e) => setError(err(e)));
  }, []);
  const yrs = useMemo(() => Array.from({ length: 6 }, (_, i) => yNow - i), [yNow]);
  if (!rows) return <div className="card" style={{ marginBottom: 14 }}><PageState loading={!error} error={error} /></div>;
  return (
    <ReportBuilder<LR, LC>
      id="LVR_BOX" icon="ti-calendar-stats" title={["تقرير الإجازات الشامل — " + y, "Comprehensive leave report — " + y]} sub={["الأرصدة السنوية، المرحَّل، الاستحقاق، المستخدم، الحالي، حسب النوع — اختر الأعمدة والموظفين ثم اطبع أو صدّر", "Balances, carry-in, entitlement, used, current, by type — pick columns & employees, then print or export"]}
      catalog={LEAVE} rows={rows} ctx={(en) => ({ y, cur: y === yNow, en })} storageKey="ariba_lvr_templates_v1" tools lowKeys={["balance", "cumBal", "yearEnd"]}
      groupsEn={{ "الموظف": "Employee", "أرصدة السنة المختارة": "Selected-year balances", "المجمَّع من بداية الخدمة": "Accumulated since joining", "الإجازات المستخدمة حسب النوع (أيام السنة)": "Used by type (days)", "حالة الطلبات": "Request status" }}
      defaults={L_DEFAULT}
      presets={[["الملخص", "Summary", L_DEFAULT], ["التفصيلي الكامل", "Full detail", L_FULL], ["حسب نوع الإجازة", "By leave type", ["empNo", "nameAr", "d_annual", "d_sick", "d_emerg", "d_death", "d_marr", "d_mat", "d_hajj", "d_unpaid", "d_remote", "balance"]], ["حالة الطلبات", "Request status", ["empNo", "nameAr", "n_app", "n_pen", "n_can", "n_rej", "last"]]]}
      top={<div className="cr-row" style={{ marginBottom: 8 }}><label style={{ fontSize: 12, fontWeight: 700 }}>السنة / Year</label><select value={y} onChange={(e) => setY(Number(e.target.value))}>{yrs.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>}
    />
  );
}
