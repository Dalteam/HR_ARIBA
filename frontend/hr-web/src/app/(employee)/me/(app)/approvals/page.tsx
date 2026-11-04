"use client";

// The employee web area's approvals tab, as the design's Approvals.jsx: what waits for THIS account at the
// request's current stage (manager / HR / CEO), a decision with the design's reason box (inline — no browser
// pop-ups) and the approval path. GET/POST /me/approvals (canonical.py `_can_act`), the same rules as the app.
import { useState } from "react";
import { useToast } from "@/components/common/toast";
import { MeState } from "@/components/me/me-shell";
import { ApiError } from "@/lib/api";
import { ddmmyyyy } from "@/lib/format";
import { useLocale } from "@/lib/i18n/locale";
import { decideApproval, myApprovals, type MyRequest } from "@/lib/me";
import { reqLabel } from "@/lib/me-labels";
import { useApi } from "@/lib/use-api";

/** The one line that says what a request is about (the design's reqDetail). */
function detail(r: MyRequest): string {
  if (r.from_date) return `${ddmmyyyy(r.from_date)} ← ${ddmmyyyy(r.to_date)}${r.days ? ` · ${Number(r.days)}` : ""}`;
  if (r.on_date) return `${ddmmyyyy(r.on_date)}${r.time_from ? ` ${r.time_from.slice(0, 5)}` : ""}${r.hours ? ` · ${Number(r.hours)}` : ""}`;
  if (r.amount) return `${Number(r.amount).toLocaleString("en-US")} ر.س`;
  return r.notes ?? "";
}

export default function MeApprovals() {
  const { lang } = useLocale();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const toast = useToast();
  const q = useApi(myApprovals, "me-approvals");
  const [busy, setBusy] = useState("");
  const [rej, setRej] = useState<Record<string, string | undefined>>({});

  async function act(r: MyRequest, action: "approve" | "reject", reason?: string) {
    setBusy(r.id);
    try {
      await decideApproval(r.id, action, reason);
      toast(
        action === "approve"
          ? T("تمت الموافقة وانتقل الطلب للمرحلة التالية", "Approved — moved to the next stage")
          : T("تم رفض الطلب", "Request rejected"),
        "ok",
      );
      q.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : T("تعذر تنفيذ الإجراء", "Could not complete the action"), "err");
    } finally {
      setBusy("");
    }
  }

  if (q.error) return <MeState error={q.error.message} />;
  if (!q.data) return <MeState loading={q.loading} error={null} />;
  if (!q.data.length) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 35, color: "var(--mu)", fontSize: 12.5 }}>
        ✅ {T("لا توجد طلبات بانتظار موافقتك حالياً.", "No requests are awaiting your approval.")}
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="card-title">
          {T("طلبات بانتظار موافقتك", "Requests awaiting your approval")} <span className="b ba">{q.data.length}</span>
        </div>
        {q.data.map((r) => {
          const open = rej[r.id];
          return (
            <div key={r.id} style={{ background: "var(--c2)", border: "1px solid var(--bd)", borderInlineStart: "3px solid var(--am)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <strong style={{ fontSize: 12.5 }}>{r.employee_name || T("الموظف", "Employee")}</strong>
                <span className="b ba">{reqLabel(r.type, lang)}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--mu)", margin: "6px 0" }}>{detail(r)}</div>
              {r.notes && <div style={{ fontSize: 11, marginBottom: 8 }}>{r.notes}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-success" style={{ flex: 1 }} disabled={busy === r.id} onClick={() => void act(r, "approve")}>
                  ✓ {T("موافقة", "Approve")}
                </button>
                <button type="button" className="btn btn-danger" style={{ flex: 1 }} disabled={busy === r.id} onClick={() => setRej((p) => ({ ...p, [r.id]: p[r.id] === undefined ? "" : undefined }))}>
                  ✗ {T("رفض", "Reject")}
                </button>
              </div>
              {open !== undefined && (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    rows={2}
                    value={open}
                    placeholder={T("اكتب سبب الرفض (إجباري)…", "Write the rejection reason (required)…")}
                    onChange={(e) => setRej((p) => ({ ...p, [r.id]: e.target.value }))}
                    style={{ width: "100%", fontSize: 11.5 }}
                  />
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ width: "100%", marginTop: 6, opacity: open.trim().length >= 2 ? 1 : 0.5 }}
                    disabled={open.trim().length < 2 || busy === r.id}
                    onClick={() => void act(r, "reject", open)}
                  >
                    {T("تأكيد الرفض", "Confirm rejection")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title">{T("مسار الطلب", "Approval path")}</div>
        <div style={{ fontSize: 11, color: "var(--mu)", lineHeight: 1.8 }}>
          {T("الموظف ← المدير المباشر ← الموارد البشرية ← الرئيس التنفيذي ← الموظف", "Employee → direct manager → HR → CEO → employee")}
        </div>
        <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 6, lineHeight: 1.8 }}>
          {T(
            "تظهر هنا فقط الطلبات التي عندك صلاحية عليها في مرحلتها الحالية؛ وإذا لم يكن للموظف مدير مباشر تُختصر مرحلة المدير.",
            "Only the requests you may act on at their current stage appear here; a request from someone without a direct manager skips the manager stage.",
          )}
        </div>
      </div>
    </>
  );
}

