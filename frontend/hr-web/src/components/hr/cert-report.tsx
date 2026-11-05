"use client";

// The design's CertReport («تقرير الشهادات والمرفقات», Stage 17) on OUR /registry/attachments: pick the types, search
// by employee / title / issuer, an issue-date range, the employees who have none of the chosen types, open a file,
// print and Excel. The list carries details only; a file is opened one at a time through /documents/{id}/file.
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/common/toast";
import { ApiError, request, type EmployeeListItem } from "@/lib/api";
import { listAllEmployees, openDocument } from "@/lib/employees";
import { ddmmyyyy } from "@/lib/format";
import { useLocale } from "@/lib/i18n/locale";
import { printHtml } from "@/lib/print";
import { buildXlsx } from "@/lib/xlsx";

type Att = { id: string; employee_id: string; name_ar: string | null; type: string; file_name: string; created_at: string;
  title?: string | null; issuer?: string | null; issue_date?: string | null; expiry_date?: string | null };

const TYPES: [string, string, string][] = [
  ["degree", "شهادة علمية / تخرج", "Degree"], ["experience", "شهادة خبرة", "Experience"], ["professional", "شهادة احترافية", "Professional"],
  ["course", "دورة / تدريب", "Course"], ["identity", "الهوية / الإقامة", "ID / Iqama"], ["passport", "جواز السفر", "Passport"],
  ["social_insurance", "شهادة التأمينات", "GOSI certificate"], ["national_address", "العنوان الوطني", "National address"],
  ["cv", "السيرة الذاتية", "CV"], ["contract", "عقد العمل", "Contract"], ["other", "أخرى", "Other"],
];
const CERTS = ["degree", "experience", "professional", "course"];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const d10 = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

export function CertReport() {
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (ar: string, e: string) => (en ? e : ar);
  const toast = useToast();
  const [types, setTypes] = useState<string[]>(CERTS);
  const [rows, setRows] = useState<Att[] | null>(null);
  const [emps, setEmps] = useState<EmployeeListItem[]>([]);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listAllEmployees({ tab: "active" }).then((p) => setEmps(p.items)).catch(() => setEmps([]));
  }, []);

  async function run() {
    if (!types.length) return toast(T("اختر نوعًا واحدًا على الأقل", "Pick at least one type"), "err");
    setBusy(true);
    try {
      setRows(await request<Att[]>("/registry/attachments", { query: { types: types.join(",") } }));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : T("تعذر تحميل المرفقات", "Could not load"), "err");
    } finally {
      setBusy(false);
    }
  }
  const tl = (t: string) => { const x = TYPES.find((y) => y[0] === t); return x ? (en ? x[2] : x[1]) : t; };
  const view = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((d) => (!s || `${d.name_ar ?? ""} ${d.title ?? ""} ${d.issuer ?? ""} ${d.file_name}`.toLowerCase().includes(s))
      && (!from || d10(d.issue_date || d.created_at) >= from) && (!to || d10(d.issue_date || d.created_at) <= to));
  }, [rows, q, from, to]);
  const without = useMemo(() => {
    if (!rows || !missing) return [];
    const has = new Set(rows.map((d) => String(d.employee_id)));
    return emps.filter((e) => !has.has(String(e.id)));
  }, [rows, missing, emps]);
  const H = [T("الموظف", "Employee"), T("النوع", "Type"), T("اسم الشهادة", "Title"), T("الجهة المانحة", "Issuer"), T("الإصدار", "Issued"), T("الانتهاء", "Expires"), T("الملف", "File")];
  const cells = (d: Att) => [d.name_ar || d.employee_id, tl(d.type), d.title || "", d.issuer || "", d.issue_date ? ddmmyyyy(d.issue_date) : "", d.expiry_date ? ddmmyyyy(d.expiry_date) : "", d.file_name];

  function print() {
    const head = H.map((h) => `<th>${esc(h)}</th>`).join("");
    const body = view.map((d) => `<tr>${cells(d).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
    const miss = without.length ? `<h3>${esc(T("موظفون ليس لديهم أي وثيقة من الأنواع المختارة", "Employees without any of the chosen types"))}</h3><table><tr><th>${esc(T("الموظف", "Employee"))}</th><th>${esc(T("الرقم الوظيفي", "Emp. no"))}</th></tr>${without.map((e) => `<tr><td>${esc(e.name_ar)}</td><td>${esc(e.emp_no)}</td></tr>`).join("")}</table>` : "";
    printHtml(T("تقرير الشهادات والمرفقات", "Certificates & attachments report") + ` — ${view.length}`, `<div>${esc(types.map(tl).join("، "))}</div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${miss}`);
  }
  function excel() {
    const blob = buildXlsx([{ name: T("الشهادات", "Certificates"), widths: [26, 18, 26, 22, 12, 12, 30], rows: [[T("تقرير الشهادات والمرفقات", "Certificates & attachments report")], [], H, ...view.map(cells)] }], { rtl: !en });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "certificates_report.xlsx";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  return (
    <div className="card" id="CERT_REPORT" style={{ padding: 12, marginBottom: 14 }}>
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-certificate" /> {T("تقرير الشهادات والمرفقات", "Certificates & attachments report")}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, margin: "4px 0" }}>{T("الأنواع", "Types")}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
        {TYPES.map(([k, a, e]) => (
          <label key={k} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input type="checkbox" checked={types.includes(k)} onChange={() => setTypes((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]))} /> {en ? e : a}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
        <div><label style={{ fontSize: 11 }}>{T("بحث (موظف / شهادة / جهة)", "Search (employee / title / issuer)")}</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label style={{ fontSize: 11 }}>{T("الإصدار من", "Issued from")}</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label style={{ fontSize: 11 }}>{T("إلى", "to")}</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12 }}><input type="checkbox" checked={missing} onChange={(e) => setMissing(e.target.checked)} /> {T("إظهار من ليس لديهم", "Show who has none")}</label>
        <button type="button" className="btn bpl bsm" disabled={busy} onClick={run}><i className="ti ti-search" /> {busy ? "…" : T("عرض", "Show")}</button>
        <button type="button" className="btn bsm" disabled={!view.length} onClick={print}><i className="ti ti-printer" /> {T("طباعة", "Print")}</button>
        <button type="button" className="btn bsm" disabled={!view.length} onClick={excel}>Excel</button>
      </div>
      {rows && (
        <div className="tw" style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>{T("الوثائق: ", "Documents: ")}<b>{view.length}</b> · {T("الموظفون: ", "Employees: ")}<b>{new Set(view.map((d) => d.employee_id)).size}</b></div>
          <table>
            <thead><tr>{H.map((h) => <th key={h}>{h}</th>)}<th /></tr></thead>
            <tbody>
              {view.map((d) => (
                <tr key={d.id}>
                  {cells(d).map((c, i) => <td key={i}>{c || "—"}</td>)}
                  <td><button type="button" className="btn bsm" title={T("فتح الملف", "Open the file")} onClick={() => openDocument(d.id).catch(() => toast(T("تعذر فتح الملف", "Could not open the file"), "err"))}><i className="ti ti-eye" /></button></td>
                </tr>
              ))}
              {!view.length && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--mu)" }}>{T("لا توجد نتائج", "No results")}</td></tr>}
            </tbody>
          </table>
          {without.length > 0 && (
            <>
              <div style={{ fontWeight: 700, margin: "12px 0 6px" }}>{T("موظفون ليس لديهم أي وثيقة من الأنواع المختارة", "Employees without any of the chosen types")} ({without.length})</div>
              <div style={{ fontSize: 12, lineHeight: 1.9 }}>{without.map((e) => `${e.name_ar} (${e.emp_no})`).join("، ")}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
