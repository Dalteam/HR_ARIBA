"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PasswordReveal } from "./password-reveal";
import { useToast } from "@/components/common/toast";
import { ApiError, type DocumentType, type Employee, type EmployeeInput, type EmployeeListItem, type Lookups, type SalaryPreview } from "@/lib/api";
import { accountForEmployee, createAccount, issueTemporaryPassword } from "@/lib/auth";
import { deleteDocument, listDocuments, openDocument, photoBlob, salaryPreview, uploadDocument, uploadPhoto } from "@/lib/employees";
import { request } from "@/lib/api";
import { FEATURES, isReady, type FeatureId } from "@/lib/features";
import { listLocations, type Location } from "@/lib/locations";
import { dmy, sar } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import { useApi } from "@/lib/use-api";
import { DependentsTab } from "./dependents-tab";
import { EmpCustody } from "./emp-custody";
import { DateField } from "@/components/common/date-time-field";

type Tab = "ft1" | "ft2" | "ft3" | "ft4" | "ft6" | "ft5";
type V = Record<string, string | boolean>;

// The seven upload slots of the prototype's "الوثائق الإلكترونية" block, in order.
const DOC_SLOTS: DocumentType[] = ["iqama", "passport", "graduation_certificate", "experience_certificate", "gosi_certificate", "national_address", "cv"];
const MONEY = ["basic_salary", "housing_allowance", "transport_allowance", "project_allowance", "other_allowances", "other_deductions", "extra_allowance"];
const SALARY_KEYS = [...MONEY, "currency", "exchange_rate", "gosi_system", "payment_method", "bank_name", "iban"];
const ID_KEYS = ["national_id", "passport_no", "insurance_card_no", "iban"];

function initial(e?: Employee): V {
  const s = e?.salary;
  return {
    emp_no: e?.emp_no ?? "", name_ar: e?.name_ar ?? "", name_en: e?.name_en ?? "", workplace_id: e?.workplace?.id ?? "",
    nationality_id: e?.nationality?.id ?? "", department_id: e?.department?.id ?? "", job_title: e?.job_title ?? "",
    birth_date: e?.birth_date ?? "", mobile: e?.mobile ?? "", email: e?.email ?? "", bank_name: s?.bank_name ?? "",
    iban: s?.iban ?? "", sponsor: e?.sponsor ?? "", religion: e?.religion ?? "", manager_id: e?.manager?.id ?? "",
    notes: e?.notes ?? "", gender: e?.gender ?? "", marital_status: e?.marital_status ?? "", category: e?.category ?? "active",
    national_address: e?.national_address ?? "", national_id: e?.national_id ?? "", national_id_expiry: e?.national_id_expiry ?? "",
    passport_no: e?.passport_no ?? "", passport_expiry: e?.passport_expiry ?? "", insurance_company: e?.insurance_company ?? "",
    insurance_class: e?.insurance_class ?? "", insurance_card_no: e?.insurance_card_no ?? "", insurance_expiry: e?.insurance_expiry ?? "",
    contract_nature: e?.contract_nature ?? "fixed", contract_duration_months: e?.contract_duration_months ? String(e.contract_duration_months) : "",
    join_date: e?.join_date ?? "", annual_leave_days: String(e?.annual_leave_days ?? 21),
    basic_salary: s?.basic_salary ?? "0", housing_allowance: s?.housing_allowance ?? "0", transport_allowance: s?.transport_allowance ?? "0",
    project_allowance: s?.project_allowance ?? "0", other_allowances: s?.other_allowances ?? "0", other_deductions: s?.other_deductions ?? "0",
    extra_allowance: s?.extra_allowance ?? "0", currency: s?.currency ?? "SAR", exchange_rate: s?.exchange_rate ?? "1",
    gosi_system: s?.gosi_system ?? "matching", wps_type: e?.wps_type ?? "wps", payment_method: s?.payment_method ?? "mudad",
    exclude_from_payroll: e?.exclude_from_payroll ?? false, exclude_from_eos: e?.exclude_from_eos ?? false,
  };
}

function toBody(v: V, keys: string[]): EmployeeInput {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const x = v[k];
    if (typeof x === "boolean") out[k] = x;
    else if (k === "contract_duration_months") out[k] = x === "" ? null : Number(x);
    else if (k === "annual_leave_days") out[k] = Number(x || 21);
    else if (MONEY.includes(k)) out[k] = x === "" ? "0" : x;
    else out[k] = x === "" ? null : x;
  }
  return out as EmployeeInput;
}

/** The employee form in the updated design's form (its EmpForm.jsx): six tabs (basic, documents, contract, salary,
 *  custody, dependents), a «↺» on every changed field and «استرجاع الكل», the fingerprint work locations (OUR
 *  /locations/assignments + PUT /employees/{id}/work-locations), document download and delete. Waiting (lib/features.ts):
 *  custody, certificates with title and issuer, the probation period, allowances as a % of basic, the default-password list. */
export function EmployeeForm({
  employee,
  lookups,
  managers,
  canEdit,
  onSubmit,
}: {
  employee?: Employee;
  lookups: Lookups;
  managers: EmployeeListItem[];
  canEdit: boolean;
  onSubmit: (body: EmployeeInput) => Promise<void>;
}) {
  const { t, tEnum, lang } = useLocale();
  const toast = useToast();
  const isNew = !employee;
  const start = useMemo(() => initial(employee), [employee]);
  const [v, setV] = useState<V>(start);
  const [tab, setTab] = useState<Tab>("ft1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<SalaryPreview | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [temp, setTemp] = useState<string | null>(null);
  const salaryVisible = isNew || !!employee?.salary;
  const masked = !!employee?.ids_masked;
  const ro = !canEdit;
  const docs = useApi(() => (employee ? listDocuments(employee.id) : Promise.resolve([])), `docs:${employee?.id}`);
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const waiting = (id: FeatureId) => toast(T("غير متاح بعد — يُفتح بعد ", "Not available yet — opens after ") + (lang === "en" ? FEATURES[id].waits?.en : FEATURES[id].waits?.ar), "info");
  // fingerprint work locations (the design's WL_BOX): saved with «حفظ وتحديث», existing employees only
  const [locs, setLocs] = useState<Location[]>([]);
  const [wl, setWl] = useState<string[]>([]);
  const [wlBase, setWlBase] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    listLocations().then((l) => alive && setLocs(l.filter((x) => x.is_active !== false && x.type !== "remote"))).catch(() => undefined);
    if (employee)
      request<{ employee_id: string; location_ids: string[] }[]>("/locations/assignments")
        .then((a) => {
          if (!alive) return;
          const ids = (a.find((x) => x.employee_id === employee.id)?.location_ids ?? []).map(String);
          setWl(ids);
          setWlBase(ids);
        })
        .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [employee]);
  const wlChanged = JSON.stringify([...wl].sort()) !== JSON.stringify([...wlBase].sort());
  const changed = isNew ? [] : Object.keys(start).filter((k) => v[k] !== start[k]);
  const undo = (k: string) =>
    !isNew && !ro && v[k] !== start[k] ? (
      <button type="button" className="undo-f" title={T("استرجاع القيمة المحفوظة: ", "Restore the saved value: ") + (String(start[k] ?? "") || T("(فارغ)", "(empty)")).slice(0, 40)} onClick={() => set(k, start[k])}>↺</button>
    ) : null;
  function revertAll() {
    if (!window.confirm(T("استرجاع كل البيانات لآخر قيمة محفوظة؟ ستضيع التعديلات غير المحفوظة.", "Restore every field to its saved value? Unsaved changes are lost."))) return;
    setV(start);
    setWl(wlBase);
    toast("↺ " + T("رجعت كل البيانات للقيم المحفوظة", "Every field restored"), "info");
  }

  // Photo preview (protected file -> object URL).
  useEffect(() => {
    if (!employee?.has_photo) return;
    let url: string | null = null;
    photoBlob(employee.id).then((b) => setPhoto((url = URL.createObjectURL(b)))).catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [employee?.id, employee?.has_photo]);

  // Live total / GOSI / net from the backend (prototype `cSP`), debounced.
  const previewKey = [...MONEY, "currency", "exchange_rate", "gosi_system", "nationality_id", "wps_type", "category", "birth_date"].map((k) => v[k]).join("|");
  useEffect(() => {
    if (!salaryVisible || !canEdit) return;
    const h = setTimeout(() => {
      salaryPreview({
        basic_salary: String(v.basic_salary || 0), housing_allowance: String(v.housing_allowance || 0), transport_allowance: String(v.transport_allowance || 0),
        project_allowance: String(v.project_allowance || 0), other_allowances: String(v.other_allowances || 0), extra_allowance: String(v.extra_allowance || 0),
        other_deductions: String(v.other_deductions || 0), currency: v.currency as never, exchange_rate: String(v.exchange_rate || 1),
        gosi_system: v.gosi_system as never, nationality_id: (v.nationality_id as string) || null, wps_type: v.wps_type as never,
        category: v.category as never, birth_date: (v.birth_date as string) || null,
      }).then(setPreview).catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, salaryVisible, canEdit]);

  const set = (k: string, x: string | boolean) =>
    setV((p) => {
      const next = { ...p, [k]: x };
      // Legacy defaultExchangeRate: USD → 3.755, SAR → 1 (only when the rate was not typed by hand).
      if (k === "currency") {
        if (x === "USD" && (!p.exchange_rate || String(p.exchange_rate) === "1")) next.exchange_rate = "3.755";
        if (x === "SAR") next.exchange_rate = "1";
      }
      return next;
    });
  const err = (k: string) => errors[k] && <div style={{ color: "var(--rd)", fontSize: 10, marginTop: 2 }}>{errors[k]}</div>;
  const field = (k: string, label: MessageKey, type = "text", extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`f-${k}`}>{t(label)}{undo(k)}</label>
      {type === "date"
        ? <DateField id={`f-${k}`} title={t(label)} value={(v[k] as string) ?? ""} onChange={(x) => set(k, x)} disabled={ro || !!extra.disabled} />
        : <input id={`f-${k}`} type={type} value={v[k] as string} onChange={(e) => set(k, e.target.value)} disabled={ro || extra.disabled} {...extra} />}
      {err(k)}
    </div>
  );
  const select = (k: string, label: MessageKey, opts: [string, string][], placeholder?: string) => (
    <div>
      <label htmlFor={`f-${k}`}>{t(label)}{undo(k)}</label>
      <select id={`f-${k}`} value={v[k] as string} onChange={(e) => set(k, e.target.value)} disabled={ro}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {opts.map(([val, txt]) => <option key={val} value={val}>{txt}</option>)}
      </select>
      {err(k)}
    </div>
  );
  const enumOpts = (g: string, vals: string[]): [string, string][] => vals.map((x) => [x, tEnum(g, x)]);
  const lookupOpts = (l: { id: string; name_ar: string; name_en: string }[]): [string, string][] => l.map((x) => [x.id, lang === "en" ? x.name_en : x.name_ar]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (ro) return;
    const local: Record<string, string> = {};
    if (!String(v.name_ar).trim()) local.name_ar = "*";
    if (!v.workplace_id) local.workplace_id = "*";
    if (!v.join_date) local.join_date = "*";
    if (v.contract_nature === "fixed" && !Number(v.contract_duration_months)) local.contract_duration_months = "*";
    if (Object.keys(local).length) {
      setErrors(local);
      setTab(local.name_ar || local.workplace_id ? "ft1" : "ft3");
      // Say which fields are missing (the red «*» alone looked like the button did nothing).
      const LABEL: Record<string, MessageKey> = { name_ar: "form.nameAr", workplace_id: "form.employer", join_date: "form.cj", contract_duration_months: "form.dur" };
      toast(`${t("form.missing")}: ${Object.keys(local).map((k) => t(LABEL[k]).replace(/\s*\*$/, "")).join("، ")}`, "err");
      return;
    }
    let keys = Object.keys(v);
    if (!isNew) keys = keys.filter((k) => v[k] !== start[k]);
    if (!salaryVisible) keys = keys.filter((k) => !SALARY_KEYS.includes(k));
    if (masked) keys = keys.filter((k) => !ID_KEYS.includes(k) && k !== "notes");
    if (!isNew && keys.length === 0 && !wlChanged) return;
    setBusy(true);
    try {
      if (isNew || keys.length) await onSubmit(toBody(v, keys));
      if (employee && wlChanged) {
        await request(`/employees/${employee.id}/work-locations`, { method: "PUT", body: { location_ids: wl } });
        setWlBase(wl);
      }
      setErrors({});
      toast(t("form.saved"), "ok");
    } catch (e) {
      if (e instanceof ApiError) {
        const fe = e.fieldErrors();
        setErrors(fe);
        toast(e.message, "err");
      } else toast(t("common.error"), "err");
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file || !employee) return;
    try {
      await uploadPhoto(employee.id, file);
      setPhoto(URL.createObjectURL(file));
      toast(t("form.uploaded"), "ok");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("common.error"), "err");
    }
  }

  async function onDoc(type: DocumentType, file: File | undefined) {
    if (!file || !employee) return;
    try {
      await uploadDocument(employee.id, type, file);
      toast(t("form.uploaded"), "ok");
      docs.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("common.error"), "err");
    }
  }

  async function newPassword() {
    if (!employee) return;
    try {
      if (employee.has_account) setTemp((await issueTemporaryPassword((await accountForEmployee(employee.id)).id)).temporary_password);
      else setTemp((await createAccount(employee.id)).temporary_password);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("common.error"), "err");
    }
  }

  async function removeDoc(id: string) {
    if (!window.confirm(T("حذف هذا المستند نهائيًا؟", "Delete this document for good?"))) return;
    try {
      await deleteDocument(id);
      toast("✓ " + T("اتحذف", "Deleted"), "ok");
      docs.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("common.error"), "err");
    }
  }
  const waitBtn = (id: FeatureId, label: string, icon: string) => (
    <button type="button" className="btn bsm" style={{ opacity: isReady(id) ? 1 : 0.6 }} onClick={() => waiting(id)}><i className={"ti " + icon} aria-hidden /> {label}</button>
  );

  const tabs: [Tab, string][] = [["ft1", t("form.tab1")], ["ft2", t("form.tab2")], ["ft3", t("form.tab3")], ["ft4", t("form.tab4")], ["ft6", T("العهدة", "Custody")], ["ft5", t("form.tab5")]];

  return (
    <div className="card">
      <div className="ch">
        <div className="ct"><i className="ti ti-user-plus" /> <span id="t_ft">{isNew ? t("form.add") : t("form.edit")}</span></div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link href="/employees" className="btn bsm"><i className="ti ti-arrow-back-up" /> {T("تراجع", "Back")}</Link>
        </div>
      </div>
      <div className="tbar">
        {tabs.map(([k, l]) => (
          <div key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{k === "ft5" && <>👨‍👩‍👧 </>}{k === "ft6" && <><i className="ti ti-package" aria-hidden /> </>}{l}</div>
        ))}
      </div>
      {masked && <div className="al alb"><i className="ti ti-lock" /><div>{t("form.idsMasked")}</div></div>}
      <form id="EF2" onSubmit={submit} autoComplete="off" noValidate>
        {tab === "ft1" && (
          <div id="ft1" className="fg">
            <div className="fsec">{t("form.personal")}</div>
            {field("name_ar", "form.nameAr", "text", { required: true })}
            {field("name_en", "form.nameEn")}
            {field("emp_no", "form.empNo", "text", { placeholder: t("form.empNoPh"), disabled: !isNew, dir: "ltr" })}
            {select("workplace_id", "form.employer", lookupOpts(lookups.workplaces), t("common.choose"))}
            <div id="WL_BOX" style={{ gridColumn: "1/-1", background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 3 }}>
                <i className="ti ti-map-pin" /> {T("مواقع العمل (مربوطة بمواقع البصمة)", "Work locations (linked to fingerprint locations)")}
                {!isNew && !ro && wlChanged && <button type="button" className="undo-f" title={T("استرجاع المواقع المحفوظة", "Restore the saved locations")} onClick={() => setWl(wlBase)}>↺</button>}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--mu)", lineHeight: 1.7, marginBottom: 6 }}>
                {isNew
                  ? T("احفظ الموظف أولًا، ثم اختر مواقع البصمة الخاصة به.", "Save the employee first, then choose their fingerprint locations.")
                  : T("اختار موقع أو أكتر — الموظف هيبصم في المواقع دي بس. لو سيبتها فاضية، هيبصم في مواقع جهة عمله زي الأول.", "Pick one or more — the employee punches only there. Left empty, they punch at their workplace's locations as before.")}
              </div>
              {!isNew && (
                <div id="WL_LIST" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: "4px 12px" }}>
                  {locs.length ? locs.map((l) => (
                    <label key={l.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, cursor: ro ? "default" : "pointer", margin: 0, fontWeight: 500, color: "var(--tx)" }}>
                      <input type="checkbox" style={{ width: "auto", margin: 0 }} disabled={ro} checked={wl.includes(String(l.id))} onChange={(ev) => setWl((a) => (ev.target.checked ? [...a, String(l.id)] : a.filter((x) => x !== String(l.id))))} />
                      <span>{l.name}</span>
                      <span style={{ fontSize: 9.5, background: "rgba(41,179,94,.15)", color: "#1f9a4f", borderRadius: 8, padding: "0 6px" }}>{l.type === "hq" ? T("مقر رئيسي", "HQ") : T("مشروع", "Project")}</span>
                    </label>
                  )) : <div style={{ fontSize: 11, color: "var(--mu)" }}>{T("مفيش مواقع بصمة — أضف من \"مواقع البصمة\".", "No fingerprint locations — add them on the locations page.")}</div>}
                </div>
              )}
            </div>
            {select("nationality_id", "form.nat", lookupOpts(lookups.nationalities), "—")}
            {select("department_id", "form.dept", lookupOpts(lookups.departments), "—")}
            {field("job_title", "form.job")}
            {field("birth_date", "form.dob", "date")}
            {field("mobile", "form.mobile")}
            {field("email", "form.email", "email")}
            <div className="fsec" style={{ marginTop: 8 }}>{t("form.photoSec")}</div>
            <div className="photo-field">
              <div className="emp-photo-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {photo ? <img src={photo} alt="" /> : t("form.noPhoto")}
              </div>
              <div>
                <label htmlFor="EMP_PHOTO_FILE">{t("form.photoUpload")}</label>
                <input id="EMP_PHOTO_FILE" type="file" accept="image/jpeg,image/png" disabled={ro || isNew} onChange={(e) => onPhoto(e.target.files?.[0])} />
                <div style={{ fontSize: 10, color: "var(--mu)", marginTop: 5 }}>{isNew ? t("form.photoAfterSave") : t("form.photoHint")}</div>
              </div>
            </div>
            {salaryVisible && field("bank_name", "form.bank")}
            {salaryVisible && field("iban", "form.iban", "text", { dir: "ltr", disabled: masked })}
            {field("sponsor", "form.sponsor")}
            {select("religion", "form.religion", enumOpts("religion", ["muslim", "other"]), "—")}
            {select("manager_id", "form.manager", managers.filter((m) => m.id !== employee?.id && !m.is_terminated).map((m) => [m.id, `${(lang === "en" && m.name_en) || m.name_ar} — ${m.job_title ?? ""}`]), t("form.noManager"))}
            <div className="ff">
              <label htmlFor="f-notes">{t("form.notes")}</label>
              <textarea id="f-notes" rows={2} value={v.notes as string} onChange={(e) => set("notes", e.target.value)} disabled={ro || masked} />
            </div>
            <div className="fsec" style={{ marginTop: 8 }}>{t("form.extraSec")}</div>
            {select("gender", "form.gender", enumOpts("gender", ["male", "female"]), "—")}
            {select("marital_status", "form.marital", enumOpts("marital_status", ["single", "married", "divorced", "widowed"]), "—")}
            {select("category", "form.category", enumOpts("category", ["active", "tamheer", "training", "consultant", "hourly"]))}
            {field("national_address", "form.address")}
          </div>
        )}

        {tab === "ft2" && (
          <div id="ft2" className="fg">
            <div className="fsec">{t("form.docsSec")}</div>
            {field("national_id", "form.iq", "text", { dir: "ltr", disabled: masked })}
            {field("national_id_expiry", "form.iqe", "date")}
            {field("passport_no", "form.pp", "text", { dir: "ltr", disabled: masked })}
            {field("passport_expiry", "form.ppe", "date")}
            <div className="fsec">{t("form.insSec")}</div>
            {field("insurance_company", "form.ico")}
            {field("insurance_class", "form.icl")}
            {field("insurance_card_no", "form.icard", "text", { disabled: masked })}
            {field("insurance_expiry", "form.ie", "date")}
            <div className="fsec" style={{ marginTop: 10 }}><i className="ti ti-paperclip" aria-hidden /> {t("form.eDocsSec")}</div>
            {isNew ? (
              <div className="ff" style={{ fontSize: 11, color: "var(--mu)" }}>{t("form.eDocsAfterSave")}</div>
            ) : (
              <>
                {canEdit &&
                  DOC_SLOTS.map((d) => (
                    <div key={d}>
                      <label>{tEnum("doc", d)}</label>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => { onDoc(d, e.target.files?.[0]); e.target.value = ""; }} />
                    </div>
                  ))}
                {canEdit && (
                  <div className="ff" id="EMP_CERTS" style={{ border: "1px dashed var(--bd)", borderRadius: 10, padding: 10, margin: "10px 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b><i className="ti ti-certificate" /> {T("إضافة شهادة للموظف", "Add a certificate")}</b>
                    <span style={{ fontSize: 11, color: "var(--mu)", flex: 1 }}>{T("بنوعها واسمها وجهتها وتاريخها", "with its type, title, issuer and dates")}</span>
                    {waitBtn("empCerts", T("إضافة الشهادة", "Add certificate"), "ti-plus")}
                  </div>
                )}
                <div className="ff" style={{ fontSize: 11, color: "var(--mu)" }}>
                  {T("العنوان الوطني وانتهاؤه، ورقم التأمينات وانتهاء شهادتها: ", "National address and its expiry, GOSI number and certificate expiry: ")}
                  {T("غير متاح بعد — يُفتح بعد ", "not available yet — opens after ")}{lang === "en" ? FEATURES.docsNationalAddress.waits?.en : FEATURES.docsNationalAddress.waits?.ar}
                </div>
                <div className="ff" style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{T("الوثائق المرفوعة", "Uploaded documents")}</div>
                  {docs.data && !docs.data.length && <div style={{ color: "var(--mu)" }}>{T("لا توجد وثائق", "No documents")}</div>}
                  {docs.data?.map((f) => (
                    <div key={f.id} className="di" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span className="dv">{tEnum("doc", f.type)} — {f.file_name} <span className="dl">({dmy(f.created_at)})</span></span>
                      <span style={{ display: "flex", gap: 4 }}>
                        <button type="button" className="btn bsm" title={T("عرض", "View")} onClick={() => openDocument(f.id)}><i className="ti ti-eye" /></button>
                        {canEdit && <button type="button" className="btn bsm" title={T("حذف", "Delete")} onClick={() => removeDoc(f.id)}><i className="ti ti-trash" /></button>}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "ft3" && (
          <div id="ft3" className="fg">
            <div className="fsec">{t("form.contractSec")}</div>
            {select("contract_nature", "form.cn", [["fixed", t("form.cnFixed")], ["indefinite", t("form.cnIndefinite")]])}
            {field("contract_duration_months", "form.dur", "number", { min: 1, disabled: v.contract_nature !== "fixed" })}
            {field("join_date", "form.cj", "date")}
            <div>
              <label>{t("form.ce")}</label>
              <DateField value={employee?.contract_end_date ?? ""} onChange={() => {}} disabled />
            </div>
            <div className="ff" style={{ fontSize: 10, color: "var(--mu)", padding: "4px 0" }}>
              {v.contract_nature === "fixed" ? t("form.cHintFixed") : t("form.cHintIndefinite")}
            </div>
            {field("annual_leave_days", "form.ldc", "number")}
            <div className="fsec" style={{ marginTop: 8 }}>{T("فترة التجربة", "Probation period")}</div>
            <div>
              <label>{T("مدة التجربة (من تاريخ المباشرة)", "Probation (from the joining date)")}</label>
              <select disabled value=""><option value="">{T("الافتراضي: 90 يوم", "Default: 90 days")}</option></select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>{waitBtn("empProbation", T("تمديد / تاريخ يدوي", "Extend / set a date"), "ti-calendar-plus")}</div>
            <div className="ff" style={{ fontSize: 10, color: "var(--mu)", padding: "4px 0" }}>{T("تُحسب نهاية التجربة تلقائيًا من تاريخ المباشرة، ولتمديدها اختر مدة أطول أو تاريخًا يدويًا.", "The probation end follows the joining date; to extend it pick a longer period or a date.")}</div>
          </div>
        )}

        {tab === "ft4" &&
          (salaryVisible ? (
            <div id="ft4" className="fg">
              <div className="fsec">{t("form.salarySec")}</div>
              {field("basic_salary", "form.sal", "number", { step: "any" })}
              {field("housing_allowance", "form.hou", "number", { step: "any" })}
              {field("transport_allowance", "form.tra", "number", { step: "any" })}
              {field("project_allowance", "form.prj", "number", { step: "any" })}
              {field("other_allowances", "form.oth", "number", { step: "any" })}
              {field("other_deductions", "form.ded", "number", { step: "any" })}
              {field("extra_allowance", "form.extra", "number", { step: "any" })}
              {canEdit && <div style={{ display: "flex", alignItems: "flex-end" }}>{waitBtn("empAllowPct", T("البدل كنسبة % من الأساسي", "Allowance as % of basic"), "ti-percentage")}</div>}
              <div className="fsec" style={{ marginTop: 8 }}>{t("form.gosiSec")}</div>
              {select("currency", "form.currency", enumOpts("currency", ["SAR", "USD", "EUR", "EGP"]))}
              {field("exchange_rate", "form.rate", "number", { step: "any", disabled: v.currency === "SAR" })}
              {select("gosi_system", "form.gosi", enumOpts("gosi_system", ["non_matching", "matching", "non_saudi"]))}
              {select("wps_type", "form.wps", enumOpts("wps_type", ["wps", "trainee", "tamheer", "external", "consultant", "no_wps", "remote"]))}
              {select("payment_method", "form.payMethod", enumOpts("payment_method", ["mudad", "bank_transfer", "international_transfer", "cash"]))}
              <div>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={!!v.exclude_from_payroll} disabled={ro} onChange={(e) => set("exclude_from_payroll", e.target.checked)} /> {t("form.excludePayroll")}
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={!!v.exclude_from_eos} disabled={ro} onChange={(e) => set("exclude_from_eos", e.target.checked)} /> {t("form.excludeEos")}
                </label>
              </div>
              <div className="ff" id="SP">
                {preview && (
                  <div style={{ background: "var(--c2)", borderRadius: 8, padding: 10, border: "1px solid var(--bd)", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, fontSize: 12 }}>
                    <div><div style={{ color: "var(--mu)", fontSize: 10 }}>{t("form.sp.total")}</div><div style={{ fontWeight: 700, color: "var(--gr)" }}>{sar(preview.total_salary)}</div></div>
                    <div><div style={{ color: "var(--mu)", fontSize: 10 }}>{t("form.sp.empIns")}</div><div style={{ color: "var(--rd)" }}>{sar(-Number(preview.gosi_employee))}</div></div>
                    <div><div style={{ color: "var(--mu)", fontSize: 10 }}>{t("form.sp.coIns")}</div><div style={{ color: "var(--am)" }}>{sar(preview.gosi_employer)}</div></div>
                    <div><div style={{ color: "var(--mu)", fontSize: 10 }}>{t("form.sp.net")}</div><div style={{ fontWeight: 700, color: "var(--cy)" }}>{sar(preview.net_salary_sar)}</div></div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="al alb"><i className="ti ti-lock" /><div>{t("form.salaryHidden")}</div></div>
          ))}

        {tab !== "ft5" && tab !== "ft6" && canEdit && (
          <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
            <button type="submit" className="btn bpl" disabled={busy}><i className="ti ti-check" /> <span id="t_save">{t("form.saveUpdate")}</span></button>
            {!isNew && !employee?.is_terminated && (
              <button type="button" className="btn bsm" style={{ marginInlineStart: 8 }} onClick={newPassword}>
                <i className="ti ti-key" aria-hidden /> {employee?.has_account ? t("form.newPassword") : t("form.createLogin")}
              </button>
            )}
            {!isNew && (
              <button type="button" className="btn bsm" id="EMP_REVERT_ALL" disabled={!changed.length && !wlChanged} title={T("استرجاع كل البيانات لآخر قيمة محفوظة", "Restore every field to its saved value")} onClick={revertAll}>
                ↺ {T("استرجاع الكل", "Restore all")}{changed.length + (wlChanged ? 1 : 0) ? " (" + (changed.length + (wlChanged ? 1 : 0)) + ")" : ""}
              </button>
            )}
            {!isNew && waitBtn("pwDefaultList", T("الحسابات بكلمة افتراضية", "Accounts on a default password"), "ti-list-check")}
            <Link href="/employees" className="btn bsm" id="t_cancel">{t("common.cancel")}</Link>
            <span style={{ fontSize: 11, color: "var(--gr)" }}>⚡ {T("يمكنك التعديل دائماً — يمكن التراجع بعد الحفظ", "You can always edit — and undo after saving")}</span>
          </div>
        )}
      </form>

      {tab === "ft6" && <EmpCustody employeeId={employee?.id ?? null} lang={lang} />}

      {tab === "ft5" &&
        (employee ? (
          <DependentsTab employeeId={employee.id} canEdit={canEdit} />
        ) : (
          <div style={{ padding: 10, fontSize: 12, color: "var(--mu)" }}>{t("dep.afterSave")}</div>
        ))}

      {temp && employee && <PasswordReveal password={temp} username={employee.emp_no} onClose={() => setTemp(null)} />}
    </div>
  );
}
