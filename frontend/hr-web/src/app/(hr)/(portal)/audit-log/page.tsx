"use client";

// سجل التعديلات — port of the design's pages/audit/index.jsx + PurgeBox.jsx against GET /audit-log.
//
// Five filters, a table of time / user / module / action / summary (with the field-level «old ← new» list when
// the write recorded one), print and Excel, and the two-person purge box underneath. The server decides who may
// read what: `finance` is locked to payroll, insurance, settlement and eos, and only `finance` may decide a purge.
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageState } from "@/components/hr/not-built";
import { useToast } from "@/components/common/toast";
import {
  auditModules, decidePurge, fieldValue, listAudit, moduleName, purgeInfo, requestPurge, riyadhTime,
  type AuditFilters, type AuditModule, type AuditRow, type PurgeInfo,
} from "@/lib/audit";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { printHtml } from "@/lib/print";
import { buildXlsx } from "@/lib/xlsx";

const INP: React.CSSProperties = {
  background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--tx)",
  padding: "6px 9px", fontSize: 12,
};
const TD: React.CSSProperties = {
  padding: "6px 8px", borderBottom: "1px solid rgba(36,48,68,.25)", textAlign: "right", fontSize: 11.5,
  verticalAlign: "top",
};
const TH: React.CSSProperties = {
  background: "var(--c2)", padding: "7px 8px", textAlign: "right", fontSize: 10.5, fontWeight: 700,
  borderBottom: "2px solid var(--bl)", whiteSpace: "nowrap",
};
const LBL: React.CSSProperties = {
  fontSize: 10.5, color: "var(--mu)", display: "block", marginBottom: 3, fontWeight: 600,
};

const PURGE_STATUS: Record<string, string> = {
  pending: "بانتظار موافقة المالية",
  approved: "موافق عليه — بانتظار المسح",
  rejected: "مرفوض",
};

export default function Page() {
  const toast = useToast();
  const { hasRole } = useAuth();
  const [modules, setModules] = useState<AuditModule[]>([]);
  const [f, setF] = useState<AuditFilters>({ module: "", actor: "", from: "", to: "", q: "", limit: 300 });
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purge, setPurge] = useState<PurgeInfo | null>(null);
  const [month, setMonth] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (filters: AuditFilters) => {
    setLoading(true);
    setError(null);
    try {
      const page = await listAudit(filters);
      setRows(page.items);
      setTotal(page.total);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPurge = useCallback(async () => {
    try {
      const info = await purgeInfo();
      setPurge(info);
      setMonth((current) => current || info.months[0]?.month || "");
    } catch {
      setPurge(null); // the box is a convenience; a viewer without the right to it still reads the table
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the screen's first read
    void load({ module: "", actor: "", from: "", to: "", q: "", limit: 300 });
    void loadPurge();
    auditModules()
      .then((r) => setModules(r.items))
      .catch(() => setModules([]));
  }, [load, loadPurge]);

  const set = (key: keyof AuditFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    const next = { ...f, [key]: value };
    setF(next);
    if (key !== "q") void load(next);
  };

  const subtitle = useMemo(() => {
    if (loading) return "جاري التحميل…";
    const shown = total > rows.length ? ` — معروض آخر ${rows.length}` : "";
    return `عدد التعديلات: ${total}${shown}`;
  }, [loading, rows.length, total]);

  async function requestDelete() {
    if (!month) return;
    setBusy(true);
    try {
      const result = await requestPurge(month);
      toast(`تم إرسال الطلب للمالية${result.notified === 0 ? " — لا يوجد حساب مالية نشط حاليًا" : ""}`, "ok");
      await loadPurge();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, approve: boolean) {
    setBusy(true);
    try {
      await decidePurge(id, approve);
      toast(approve ? "تمت الموافقة" : "تم الرفض", "ok");
      await loadPurge();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  function exportExcel() {
    const header = ["الوقت", "المستخدم", "الحساب", "الصلاحية", "القسم", "الإجراء", "الموظف/العنصر", "التفاصيل", "التغييرات"];
    const body = rows.map((r) => [
      riyadhTime(r.at), r.actor_name || "", r.actor_username || "", r.actor_role || "", moduleName(r.module),
      r.action, r.entity_name || "", r.summary || "",
      (r.details?.changes || []).map((c) => `${c.label || c.field}: ${fieldValue(c.old)} ← ${fieldValue(c.new)}`).join(" | "),
    ]);
    const blob = buildXlsx([
      { name: "سجل التعديلات", widths: [20, 22, 14, 10, 18, 28, 22, 70, 60], rows: [["سجل التعديلات"], [], header, ...body] },
    ]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit_log.xlsx";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function print() {
    const head = ["الوقت", "المستخدم", "القسم", "الإجراء", "التفاصيل"].map((h) => `<th>${h}</th>`).join("");
    const body = rows
      .map(
        (r) =>
          `<tr><td dir="ltr">${riyadhTime(r.at)}</td><td>${r.actor_name || r.actor_username || "—"}</td>` +
          `<td>${moduleName(r.module)}</td><td>${r.action}</td><td>${r.summary || ""}</td></tr>`,
      )
      .join("");
    printHtml(`سجل التعديلات — ${total}`, `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
  }


  return (
    <div style={{ padding: "4px 0" }}>
      <div className="card" style={{ padding: 14 }}>
        <div className="ct" style={{ marginBottom: 10 }}>
          <i className="ti ti-history" /> سجل التعديلات
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={LBL}>القسم</label>
            <select style={INP} value={f.module} onChange={set("module")}>
              <option value="">كل الأقسام</option>
              {modules.map((m) => (
                <option key={m.module} value={m.module}>
                  {moduleName(m.module)} ({m.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={LBL}>المستخدم (الحساب)</label>
            <input style={{ ...INP, minWidth: 150 }} value={f.actor} placeholder="EMP010" onChange={set("actor")} onBlur={() => load(f)} />
          </div>
          <div>
            <label style={LBL}>من</label>
            <input type="date" style={INP} value={f.from} onChange={set("from")} />
          </div>
          <div>
            <label style={LBL}>إلى</label>
            <input type="date" style={INP} value={f.to} onChange={set("to")} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={LBL}>بحث</label>
            <input
              style={{ ...INP, width: "100%", boxSizing: "border-box" }}
              value={f.q}
              onChange={set("q")}
              onKeyDown={(e) => e.key === "Enter" && void load(f)}
            />
          </div>
          <button type="button" className="btn bpl bsm" onClick={() => void load(f)}>
            <i className="ti ti-refresh" /> تحديث
          </button>
          <button type="button" className="btn bgr bsm" onClick={print} aria-label="print">
            <i className="ti ti-printer" />
          </button>
          <button type="button" className="btn bgr bsm" onClick={exportExcel}>
            Excel
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--mu)" }}>
          {subtitle}
          {hasRole("finance") && " — صلاحية المالية تعرض مسير الرواتب والتأمينات والمخالصة ونهاية الخدمة فقط"}
        </div>

        {purge && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--bd)" }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>حذف شهر قديم من سجل التعديلات</div>
            <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 6 }}>
              مسموح فقط للشهور الأقدم من 30 يوم، والطلب يُرسل للمالية للموافقة (والمسح الفعلي تنفذه المالية يدويًا).
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select style={INP} value={month} onChange={(e) => setMonth(e.target.value)}>
                {purge.months.length ? (
                  purge.months.map((m) => (
                    <option key={m.month} value={m.month}>
                      {m.month} ({m.count})
                    </option>
                  ))
                ) : (
                  <option value="">لا توجد شهور أقدم من 30 يوم</option>
                )}
              </select>
              <button type="button" className="btn bgr bsm" disabled={busy || !purge.months.length} onClick={requestDelete}>
                طلب حذف
              </button>
            </div>
            {purge.requests.length > 0 && (
              <table style={{ width: "100%", marginTop: 8, fontSize: 11.5 }}>
                <tbody>
                  {purge.requests.map((q) => (
                    <tr key={q.id}>
                      <td>{q.month}</td>
                      <td>{q.requester_name || ""}</td>
                      <td>{PURGE_STATUS[q.status] || q.status}</td>
                      <td>
                        {purge.is_finance && q.status === "pending" && (
                          <>
                            <button type="button" className="btn bpl bsm" disabled={busy} onClick={() => decide(q.id, true)}>
                              موافقة
                            </button>{" "}
                            <button type="button" className="btn bgr bsm" disabled={busy} onClick={() => decide(q.id, false)}>
                              رفض
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>


      <div className="card" style={{ padding: 0, overflow: "auto", marginTop: 12 }}>
        <PageState loading={loading} error={error} onRetry={() => void load(f)} />
        {!loading && !error && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["الوقت", "المستخدم", "القسم", "الإجراء", "التفاصيل"].map((h) => (
                  <th key={h} style={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...TD, whiteSpace: "nowrap", direction: "ltr" }}>{riyadhTime(r.at)}</td>
                  <td style={{ ...TD, whiteSpace: "nowrap" }}>
                    <b>{r.actor_name || r.actor_username || "—"}</b>
                    <div style={{ fontSize: 10, color: "var(--mu)" }}>
                      {r.actor_username} · {r.actor_role}
                    </div>
                  </td>
                  <td style={{ ...TD, whiteSpace: "nowrap" }}>
                    <span className="b bb" style={{ fontSize: 10 }}>
                      {moduleName(r.module)}
                    </span>
                  </td>
                  <td style={{ ...TD, fontWeight: 700 }}>{r.action}</td>
                  <td style={TD}>
                    {r.summary}
                    {r.details?.changes?.length ? (
                      <div style={{ marginTop: 4, fontSize: 10.5, color: "var(--mu)" }}>
                        {r.details.changes.map((c, i) => (
                          <div key={i}>
                            {c.label || c.field}: <span style={{ color: "var(--rd)" }}>{fieldValue(c.old)}</span> ←{" "}
                            <span style={{ color: "var(--gr)" }}>{fieldValue(c.new)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} style={{ ...TD, textAlign: "center", color: "var(--mu)", padding: 28 }}>
                    لا توجد تعديلات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

