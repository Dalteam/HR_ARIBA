"use client";

// Import employees from an .xlsx / .csv file: the updated design's employees/Import.jsx — pick the file,
// check the column mapping, preview every row with what it will do, then run. The reading is lib/import-xlsx.ts
// (no library), the checks and the bodies are lib/employee-import.ts, and the writes are the ordinary
// POST /employees and PATCH /employees/{id} calls, so every row lands in the audit log with its user.

import { useMemo, useRef, useState } from "react";
import { useToast } from "@/components/common/toast";
import { Modal } from "@/components/hr/modal";
import { ApiError } from "@/lib/api";
import { createEmployee, getLookups, listAllEmployees, updateEmployee } from "@/lib/employees";
import { planRows, type Plan } from "@/lib/employee-import";
import { FORMATS, saveBlob } from "@/lib/exporter";
import { useLocale } from "@/lib/i18n/locale";
import { FIELDS, autoMap, readFile, templateHead, type FieldKey, type Sheet } from "@/lib/import-xlsx";
import { useApi } from "@/lib/use-api";
import { buildXlsx } from "@/lib/xlsx";

const MAX_BYTES = 5 * 1024 * 1024;
const PREVIEW = 300;
const BADGE: Record<Plan["action"], string> = { new: "bg", update: "ba", skip: "bk", error: "br" };

export function EmployeeImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { lang } = useLocale();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [map, setMap] = useState<(FieldKey | "")[]>([]);
  const [fileName, setFileName] = useState("");
  const [update, setUpdate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [failed, setFailed] = useState<string[]>([]);

  const lookups = useApi(getLookups, "lookups");
  const employees = useApi(() => listAllEmployees(), "employees:all");
  const ready = !!lookups.data && !!employees.data;

  const sheet = sheets ? sheets[sheetIndex] ?? null : null;
  const header = sheet ? sheet.rows[0] ?? [] : [];

  const ctx = useMemo(
    () => (ready && lookups.data && employees.data ? { lookups: lookups.data, employees: employees.data.items, update, t: T } : null),
    // T is rebuilt each render but only depends on lang
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, lookups.data, employees.data, update, lang],
  );
  const plans = useMemo(() => (ctx && sheet && sheet.rows.length > 1 ? planRows(sheet.rows.slice(1), map, ctx) : []), [ctx, sheet, map]);
  const count = (action: Plan["action"]) => plans.filter((p) => p.action === action).length;
  const todo = plans.filter((p) => p.action === "new" || p.action === "update");

  async function pick(file: File | undefined) {
    if (!file) return;
    setFailed([]);
    if (file.size > MAX_BYTES) {
      toast(T("الملف أكبر من 5 ميغابايت — قسّمه إلى ملفات أصغر", "The file is larger than 5 MB — split it"), "err");
      return;
    }
    try {
      const read = await readFile(file);
      if (!read.length || !read[0].rows.length) throw new Error(T("الملف فارغ", "the file is empty"));
      let best = 0;
      read.forEach((s, i) => {
        if (s.rows.length > (read[best]?.rows.length ?? 0)) best = i;
      });
      setSheets(read);
      setSheetIndex(best);
      setMap(autoMap(read[best].rows[0] ?? []));
      setFileName(file.name);
    } catch (e) {
      toast(T("تعذر قراءة الملف: ", "Could not read the file: ") + (e instanceof Error ? e.message : String(e)), "err");
    }
  }

  function pickSheet(i: number) {
    setSheetIndex(i);
    setMap(autoMap(sheets?.[i]?.rows[0] ?? []));
    setFailed([]);
  }

  function downloadTemplate() {
    const head = templateHead();
    saveBlob({ blob: buildXlsx([{ name: "Employees", rows: [head], widths: head.map(() => 20) }]), name: "employees_import_template.xlsx", mime: FORMATS.xlsx[2] });
  }

  async function run() {
    if (!todo.length) {
      toast(T("لا يوجد ما يُضاف أو يُحدَّث", "Nothing to add or update"), "info");
      return;
    }
    setBusy(true);
    setFailed([]);
    let added = 0;
    let updated = 0;
    const errors: string[] = [];
    for (let i = 0; i < todo.length; i++) {
      const plan = todo[i];
      setProgress(`${i + 1} / ${todo.length}`);
      try {
        if (plan.action === "update" && plan.existing && plan.body) {
          await updateEmployee(plan.existing.id, plan.body);
          updated++;
        } else if (plan.body) {
          await createEmployee(plan.body);
          added++;
        }
      } catch (e) {
        errors.push(`#${plan.row}: ${e instanceof ApiError ? e.message : String(e)}`);
      }
    }
    setBusy(false);
    setProgress("");
    setFailed(errors.slice(0, 20));
    onDone();
    // something failed: re-read the list so the preview shows what really exists now
    if (errors.length) employees.reload();
    const done = T(
      `أُضيف ${added} موظف${updated ? ` وحُدِّث ${updated}` : ""}${errors.length ? ` — ${errors.length} مرفوض: ${errors[0]}` : ""}`,
      `Added ${added}${updated ? `, updated ${updated}` : ""}${errors.length ? `, rejected ${errors.length}: ${errors[0]}` : ""}`,
    );
    toast((errors.length ? "" : "✓ ") + done, errors.length ? "err" : "ok");
    if (!errors.length) onClose();
  }

  const ACTION_LABEL: Record<Plan["action"], string> = {
    new: T("جديد", "New"),
    update: T("تحديث", "Update"),
    skip: T("موجود — تخطي", "Exists — skip"),
    error: T("مرفوض", "Rejected"),
  };

  return (
    <Modal
      title={T("📥 استيراد موظفين من Excel / CSV", "📥 Import employees from Excel / CSV")}
      width={1100}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>{T("إغلاق", "Close")}</button>
          {sheet && (
            <button type="button" className="btn bpl" id="EI_RUN" disabled={busy || !ready} onClick={() => void run()}>
              {busy ? T("جاري الاستيراد… ", "Importing… ") + progress : T(`استيراد ${todo.length}`, `Import ${todo.length}`)}
            </button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <input ref={fileRef} id="EI_FILE" type="file" accept=".xlsx,.csv,.txt" disabled={busy || !ready} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pick(f); }} />
        <button type="button" className="btn bsm" onClick={downloadTemplate}>
          <i className="ti ti-download" /> {T("تنزيل قالب", "Download template")}
        </button>
        {sheets && sheets.length > 1 && (
          <select value={sheetIndex} onChange={(e) => pickSheet(Number(e.target.value))} style={{ width: "auto" }} disabled={busy}>
            {sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
          </select>
        )}
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
          <input type="checkbox" checked={update} onChange={(e) => setUpdate(e.target.checked)} disabled={busy} />
          {T("تحديث الموظفين الموجودين (بدل التخطي)", "Update existing employees (instead of skipping)")}
        </label>
      </div>
      <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 10, lineHeight: 1.8 }}>
        {T(
          "يُتعرَّف على الموظف الموجود بالرقم الوظيفي فقط، لأن قائمة الموظفين تُخفي رقم الهوية والبريد.",
          "An existing employee is recognised by employee number only, because our employee list masks the ID and the e-mail.",
        )}
      </div>
      {!ready && (
        <div className="card" style={{ padding: 12, fontSize: 12 }}>
          {lookups.error || employees.error
            ? T("تعذر تحميل القوائم أو الموظفين: ", "Could not load the lists or the employees: ") + (lookups.error?.message ?? employees.error?.message ?? "")
            : T("جاري تحميل القوائم والموظفين…", "Loading the lists and the employees…")}
        </div>
      )}
      {sheet && (
        <>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{T("مطابقة الأعمدة", "Column mapping")} — {fileName}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 6, marginBottom: 10 }}>
            {header.map((h, ci) => (
              <div key={ci} style={{ fontSize: 11 }}>
                <div style={{ color: "var(--mu)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(h || "—")}</div>
                <select value={map[ci] ?? ""} disabled={busy} onChange={(e) => setMap(map.map((m, j) => (j === ci ? (e.target.value as FieldKey | "") : m)))} style={{ width: "100%" }}>
                  <option value="">{T("— تجاهل —", "— ignore —")}</option>
                  {FIELDS.map((f) => <option key={f.k} value={f.k}>{f.ar}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div id="EI_SUM" style={{ display: "flex", gap: 14, fontSize: 12, marginBottom: 8, flexWrap: "wrap" }}>
            {(["new", "update", "skip", "error"] as Plan["action"][]).map((a) => (
              <span key={a}><span className={"b " + BADGE[a]}>{ACTION_LABEL[a]}</span> {count(a)}</span>
            ))}
          </div>
          <div className="tw" style={{ maxHeight: 280, overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{T("الاسم", "Name")}</th>
                  <th>{T("الرقم", "No.")}</th>
                  <th>{T("الهوية", "ID")}</th>
                  <th>{T("الراتب", "Salary")}</th>
                  <th>{T("الإجراء", "Action")}</th>
                  <th>{T("ملاحظات", "Notes")}</th>
                </tr>
              </thead>
              <tbody>
                {plans.slice(0, PREVIEW).map((p) => (
                  <tr key={p.row}>
                    <td>{p.row}</td>
                    <td>{String(p.v.nameAr ?? p.v.nameEn ?? "—")}</td>
                    <td>{String(p.v.empNo ?? "—")}</td>
                    <td>{String(p.v.iqamaNo ?? "—")}</td>
                    <td>{p.v.salary === undefined ? "—" : String(p.v.salary)}</td>
                    <td><span className={"b " + BADGE[p.action]}>{ACTION_LABEL[p.action]}</span></td>
                    <td style={{ fontSize: 10.5, color: p.issues.length ? "var(--rd)" : "var(--am)" }}>{[...p.issues, ...p.warns].join("، ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plans.length > PREVIEW && (
            <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 4 }}>
              {T(`المعاينة أول ${PREVIEW} صف من ${plans.length}`, `The preview shows the first ${PREVIEW} of ${plans.length} rows`)}
            </div>
          )}
          {failed.length > 0 && (
            <div className="card" style={{ padding: 10, marginTop: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "var(--rd)", marginBottom: 4 }}>{T("صفوف رفضها الخادم", "Rows the server rejected")}</div>
              <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 11, lineHeight: 1.9 }}>
                {failed.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
