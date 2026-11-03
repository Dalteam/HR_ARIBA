"use client";

import { useState } from "react";
import { useToast } from "@/components/common/toast";
import { Modal } from "@/components/hr/modal";
import { type ExportSpec, FORMATS, type Format, makeFile, saveBlob, tablesFrom } from "@/lib/exporter";
import { FEATURES, isReady } from "@/lib/features";
import { useLocale } from "@/lib/i18n/locale";

// The updated design's top-bar export (its PageExport.jsx + ExportDialog.jsx): it picks up any table shown on
// the open page and saves it as PDF / Excel / Word. The stamp overlay and the e-mail half wait for their steps
// (lib/features.ts `exportSeal`, `exportEmail`) and say so instead of pretending.
export function PageExport({ title }: { title: string }) {
  const toast = useToast();
  const { lang } = useLocale();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const [specs, setSpecs] = useState<ExportSpec[] | null>(null);
  const [cur, setCur] = useState<ExportSpec | null>(null);

  const open = () => {
    const t = tablesFrom(document.querySelector(".con")).filter((x) => x.rows.length);
    if (!t.length) return toast(T("لا يوجد جدول معروض في هذه الصفحة للتصدير", "There is no table on this page to export"), "err");
    const sub = new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn");
    const all = t.map((x, i) => ({ ...x, title: x.title || title, name: (title || "page") + "_" + (i + 1), sub }));
    if (all.length === 1) setCur(all[0]);
    else setSpecs(all);
  };

  return (
    <>
      <button className="ib" id="PAGE_EXPORT" type="button" onClick={open} title={T("تصدير هذه الصفحة (Excel / PDF / Word / إيميل)", "Export this page (Excel / PDF / Word / e-mail)")}>
        <i className="ti ti-file-export" />
      </button>
      {specs && !cur && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSpecs(null)}>
          <div className="card" style={{ minWidth: 320, maxWidth: 520, padding: 14 }} onClick={(e) => e.stopPropagation()}>
            <div className="ct" style={{ marginBottom: 8 }}>{T("اختر الجدول المراد تصديره", "Choose the table to export")}</div>
            {specs.map((s, i) => (
              <button key={i} type="button" className="btn" style={{ display: "block", width: "100%", textAlign: "start", marginBottom: 6 }} onClick={() => { setCur(s); setSpecs(null); }}>
                {s.title} <span style={{ color: "var(--mu)", fontSize: 11 }}>({s.rows.length})</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {cur && <ExportDialog spec={cur} onClose={() => setCur(null)} />}
    </>
  );
}

function ExportDialog({ spec, onClose }: { spec: ExportSpec; onClose: () => void }) {
  const toast = useToast();
  const { lang } = useLocale();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const [fmt, setFmt] = useState<Format>("pdf");
  const [busy, setBusy] = useState(false);
  const canSeal = fmt === "pdf" && spec.headers.length <= 7;
  const waits = (id: "exportSeal" | "exportEmail") => (lang === "en" ? FEATURES[id].waits?.en : FEATURES[id].waits?.ar);

  async function dl() {
    setBusy(true);
    try {
      saveBlob(await makeFile(fmt, spec));
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : T("تعذر إنشاء الملف", "Could not create the file"), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={T("تصدير / إرسال: ", "Export / send: ") + spec.title} width={640} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {(Object.entries(FORMATS) as [Format, [string, string, string]][]).map(([k, v]) => (
          <label key={k} style={{ display: "flex", gap: 5, alignItems: "center", border: "1px solid " + (fmt === k ? "var(--bl)" : "var(--bd)"), borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}>
            <input type="radio" name="xfmt" checked={fmt === k} onChange={() => setFmt(k)} /> {v[0]}
          </label>
        ))}
        {canSeal && (
          <label style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12, opacity: isReady("exportSeal") ? 1 : 0.55 }} title={waits("exportSeal")}>
            <input type="checkbox" id="XD_SEAL" disabled={!isReady("exportSeal")} /> {T("ختم / توقيع (قابل للتحريك)", "Stamp / signature (movable)")}
          </label>
        )}
        <button className="btn bpl bsm" id="XD_DL" type="button" disabled={busy} onClick={dl} style={{ marginInlineStart: "auto" }}>
          <i className="ti ti-download" /> {busy ? "…" : T("تنزيل", "Download")}
        </button>
      </div>
      <div className="fsec">{T("إرسال بالإيميل تلقائياً (بدون فتح برنامج بريد)", "Send by e-mail automatically (no mail program needed)")}</div>
      <div className="al alb" id="XD_MAIL_PENDING" style={{ marginTop: 6 }}>
        <i className="ti ti-hourglass" aria-hidden />
        <div>
          <strong>{T("غير متاح بعد", "Not available yet")}</strong>
          <div>{T("يُفتح بعد ", "Opens after ") + (waits("exportEmail") ?? "")}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <button className="btn" type="button" onClick={onClose}>{T("إغلاق", "Close")}</button>
      </div>
    </Modal>
  );
}
