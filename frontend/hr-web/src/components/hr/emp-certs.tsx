"use client";

// The design's EmpCerts («إضافة شهادة للموظف», Stage 17): type, title, issuer, issue and expiry dates and the file. The
// file goes up through OUR POST /employees/{id}/documents, then PUT /documents/{id}/meta stores the details
// (migration 007). Needs `attachments: edit`; the API checks it.
import { useState } from "react";
import { useToast } from "@/components/common/toast";
import { DateField } from "@/components/common/date-time-field";
import { ApiError, request, type DocumentType } from "@/lib/api";
import { uploadDocument } from "@/lib/employees";
import { useLocale } from "@/lib/i18n/locale";

export const CERT_TYPES: [DocumentType, string, string][] = [
  ["degree", "شهادة علمية / تخرج", "Academic / Degree"], ["experience", "شهادة خبرة", "Experience"],
  ["professional", "شهادة احترافية", "Professional"], ["course", "شهادة دورة / تدريب", "Course / Training"], ["other", "أخرى", "Other"],
];
const MAX_BYTES = 12 * 1024 * 1024;

export function EmpCerts({ employeeId, onSaved }: { employeeId: string; onSaved: () => void }) {
  const { lang } = useLocale();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const toast = useToast();
  const [f, setF] = useState({ type: "degree" as DocumentType, title: "", issuer: "", issue: "", expiry: "" });
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState(0);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!file) return toast(T("اختر ملف الشهادة", "Choose the certificate file"), "err");
    if (!f.title.trim()) return toast(T("اكتب اسم الشهادة", "Write the certificate title"), "err");
    if (file.size > MAX_BYTES) return toast(T("الملف يتجاوز 12 MB", "The file is over 12 MB"), "err");
    setBusy(true);
    try {
      const doc = await uploadDocument(employeeId, f.type, file);
      await request(`/documents/${doc.id}/meta`, { method: "PUT", body: { title: f.title.trim(), issuer: f.issuer.trim(), issue_date: f.issue || null, expiry_date: f.expiry || null } });
      toast("✓ " + T("أُضيفت الشهادة لملف الموظف", "Certificate added to the employee's file"), "ok");
      setF({ ...f, title: "", issuer: "", issue: "", expiry: "" });
      setFile(null);
      setKey((n) => n + 1);
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : T("تعذر إضافة الشهادة", "Could not add the certificate"), "err");
    } finally {
      setBusy(false);
    }
  }
  const L = (t: string) => <label style={{ fontSize: 10.5, color: "var(--mu)", fontWeight: 600, display: "block", marginBottom: 2 }}>{t}</label>;
  return (
    <div className="ff" id="EMP_CERTS" style={{ border: "1px solid var(--bd)", borderRadius: 10, padding: 10, margin: "10px 0" }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}><i className="ti ti-certificate" /> {T("إضافة شهادة للموظف", "Add a certificate")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}>
        <div>{L(T("نوع الشهادة", "Type"))}<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as DocumentType })}>{CERT_TYPES.map(([v, a, e]) => <option key={v} value={v}>{T(a, e)}</option>)}</select></div>
        <div>{L(T("اسم الشهادة", "Title"))}<input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={T("مثال: بكالوريوس هندسة / PMP", "e.g. BSc Engineering / PMP")} /></div>
        <div>{L(T("الجهة المانحة", "Issuer"))}<input value={f.issuer} maxLength={200} onChange={(e) => setF({ ...f, issuer: e.target.value })} /></div>
        <div>{L(T("تاريخ الإصدار", "Issued"))}<DateField value={f.issue} onChange={(x) => setF({ ...f, issue: x })} /></div>
        <div>{L(T("تاريخ الانتهاء (إن وُجد)", "Expires (if any)"))}<DateField value={f.expiry} onChange={(x) => setF({ ...f, expiry: x })} /></div>
        <div>{L(T("الملف (PDF / صورة)", "File (PDF / image)"))}<input key={key} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
      </div>
      <button type="button" className="btn bpl bsm" style={{ marginTop: 8 }} disabled={busy} onClick={add}><i className="ti ti-plus" /> {busy ? "…" : T("إضافة الشهادة", "Add certificate")}</button>
    </div>
  );
}
