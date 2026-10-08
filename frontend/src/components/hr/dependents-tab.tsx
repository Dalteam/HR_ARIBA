"use client";

import { useState } from "react";
import { useToast } from "@/components/common/toast";
import { ApiError, type Dependent, type DependentInput, type DependentRelation } from "@/lib/api";
import { createDependent, deleteDependent, listDependents, openDocument, updateDependent, uploadDependentDocument } from "@/lib/employees";
import { dmy } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import { useApi } from "@/lib/use-api";

const RELATIONS: DependentRelation[] = ["wife", "husband", "son", "daughter", "father", "mother"];
const EMPTY: Required<DependentInput> = {
  relation: "wife", name_ar: "", name_en: "", birth_date: "", national_id: "", national_id_expiry: "",
  passport_no: "", passport_expiry: "", insurance_company: "", insurance_card_no: "", insurance_expiry: "", mobile: "",
};

/** The prototype's #ft5 dependents tab. */
export function DependentsTab({ employeeId, canEdit }: { employeeId: string; canEdit: boolean }) {
  const { t, tEnum } = useLocale();
  const toast = useToast();
  const list = useApi(() => listDependents(employeeId), `deps:${employeeId}`);
  const [form, setForm] = useState<Required<DependentInput> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof DependentInput, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const open = (d?: Dependent) => {
    setEditId(d?.id ?? null);
    setFiles([]);
    setForm(d ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (d as unknown as Record<string, string | null>)[k] ?? ""])) as Required<DependentInput> : { ...EMPTY });
  };

  async function save() {
    if (!form) return;
    setBusy(true);
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === "" ? null : v])) as DependentInput;
    try {
      const dep = editId ? await updateDependent(editId, body) : await createDependent(employeeId, body);
      for (const f of files) await uploadDependentDocument(dep.id, f);
      toast(t("common.saved"), "ok");
      setForm(null);
      list.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("common.error"), "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: Dependent) {
    if (!window.confirm(t("dep.deleteConfirm", { name: d.name_ar }))) return;
    await deleteDependent(d.id);
    list.reload();
  }

  const input = (k: keyof DependentInput, label: MessageKey, type = "text", ph?: MessageKey) => (
    <div>
      <label>{t(label)}</label>
      <input type={type} placeholder={ph ? t(ph) : undefined} value={form?.[k] ?? ""} onChange={(e) => set(k, e.target.value)} style={{ width: "100%" }} />
    </div>
  );

  return (
    <div id="ft5" style={{ padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--bd)" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--bl)" }}>{t("dep.title")}</div>
        {canEdit && (
          <button type="button" className="btn bpl" onClick={() => open()} style={{ padding: "7px 14px", fontSize: 12 }}>
            <i className="ti ti-plus" /> {t("dep.add")}
          </button>
        )}
      </div>
      <div id="DEP_LIST" style={{ marginBottom: 16 }}>
        {list.data?.length === 0 && <div style={{ color: "var(--mu)", fontSize: 12 }}>{t("dep.empty")}</div>}
        {list.data?.map((d) => (
          <div key={d.id} className="di" style={{ marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <div className="dv" style={{ fontWeight: 700 }}>{d.name_ar} <span className="b bb">{tEnum("relation", d.relation)}</span></div>
              <div className="dl">{[d.national_id, d.birth_date && dmy(d.birth_date), d.insurance_company].filter(Boolean).join(" · ") || "—"}</div>
              {d.documents.map((f) => (
                <button key={f.id} type="button" className="btn bsm" onClick={() => openDocument(f.id)} style={{ marginTop: 4 }}>
                  <i className="ti ti-paperclip" /> {f.file_name}
                </button>
              ))}
            </div>
            {canEdit && (
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" className="btn bsm" onClick={() => open(d)} aria-label={t("dep.edit")}><i className="ti ti-edit" /></button>
                <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => remove(d)} aria-label={t("dep.delete")}><i className="ti ti-trash" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      {form && (
        <div id="DEP_FORM" style={{ background: "var(--c2)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div className="fsec">{t("dep.sec")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {input("name_ar", "dep.nameAr", "text", "dep.nameArPh")}
            {input("name_en", "dep.nameEn")}
            <div>
              <label>{t("dep.relation")}</label>
              <select value={form.relation} onChange={(e) => set("relation", e.target.value)} style={{ width: "100%" }}>
                {RELATIONS.map((r) => <option key={r} value={r}>{tEnum("relation", r)}</option>)}
              </select>
            </div>
            {input("birth_date", "dep.dob", "date")}
            {input("national_id", "dep.id", "text", "dep.idPh")}
            {input("national_id_expiry", "dep.idExp", "date")}
            {input("passport_no", "dep.pp")}
            {input("passport_expiry", "dep.ppExp", "date")}
            {input("insurance_company", "dep.insCo")}
            {input("insurance_card_no", "dep.insCard")}
            {input("insurance_expiry", "dep.insExp", "date")}
            {input("mobile", "dep.mobile")}
          </div>
          <div style={{ marginBottom: 10 }}>
            <label>{t("dep.files")}</label>
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ width: "100%", marginTop: 4 }} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn bgl" onClick={save} disabled={busy} style={{ flex: 1 }}><i className="ti ti-check" /> {t("dep.save")}</button>
            <button type="button" className="btn" onClick={() => setForm(null)} style={{ flex: 1 }}>{t("common.cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
