"use client";

// The design's SectionAudit (reference/hr-v1 pages/audit/SectionAudit.jsx, V132): a «سجل التعديلات» button above the
// pages it lists, opening a window with only that section's changes (GET /audit-log?modules=…), with print and
// Excel. Shown to whoever may read the audit log (module `audit`); the server still decides what they see
// (finance: payroll, insurance, settlement and eos only).
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AuditTable, auditExcel, auditPrint } from "@/components/hr/audit-table";
import { Modal } from "@/components/hr/modal";
import { ApiError } from "@/lib/api";
import { listAudit, moduleName, type AuditRow } from "@/lib/audit";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/i18n/locale";

/** The design's PAGE_MODS, keyed by our routes. */
const PAGE_MODULES: Record<string, string[]> = {
  "/employees": ["employees"],
  "/attendance": ["attendance"],
  "/payroll": ["payroll"],
  "/payslips": ["payroll"],
  "/end-of-service": ["settlement", "eos"],
  "/settlement": ["settlement", "eos"],
  "/leaves": ["leaves", "requests"],
  "/locations": ["locations"],
  "/documents": ["documents"],
  "/templates": ["documents"],
  "/settings": ["settings", "security", "locations"],
};

export function SectionAudit() {
  const pathname = usePathname();
  const { can } = useAuth();
  const { lang } = useLocale();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const mods = PAGE_MODULES["/" + (pathname.split("/")[1] || "")];
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open || !mods) return undefined;
    let off = false;
    listAudit({ modules: mods, limit: 300 })
      .then((r) => { if (!off) setRows(r.items); })
      .catch((e) => { if (!off) { setRows([]); setMsg(e instanceof ApiError ? e.message : String(e)); } });
    return () => { off = true; };
  }, [open, mods]);

  if (!mods || !can("audit", "view")) return null;
  const title = T("سجل التعديلات — ", "Audit log — ") + mods.map(moduleName).join(" / ");
  const close = () => { setOpen(false); setRows(null); setMsg(""); };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 16px 0" }}>
        <button type="button" className="btn bgr bsm" onClick={() => setOpen(true)}>
          <i className="ti ti-history" /> {T("سجل التعديلات", "Audit log")}
        </button>
      </div>
      {open && (
        <Modal title={<><i className="ti ti-history" /> {title}</>} width={1100} onClose={close}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button type="button" className="btn bgr bsm" aria-label="print" disabled={!rows?.length} onClick={() => auditPrint(rows ?? [], title)}>
              <i className="ti ti-printer" />
            </button>
            <button type="button" className="btn bgr bsm" disabled={!rows?.length} onClick={() => auditExcel(rows ?? [], title)}>
              Excel
            </button>
          </div>
          <div style={{ maxHeight: "64vh", overflow: "auto" }}>
            {rows === null ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--mu)" }}>{T("جاري التحميل…", "Loading…")}</div>
            ) : msg ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--rd)" }}>{msg}</div>
            ) : (
              <AuditTable rows={rows} />
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
