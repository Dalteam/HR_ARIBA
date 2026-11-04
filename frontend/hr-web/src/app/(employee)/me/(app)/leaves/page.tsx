"use client";

// The employee web area's requests tab, as the design's Leaves.jsx: my requests with their stage, and a new
// request for the leave types our API records with a period. The day count is the server's (workdays for annual
// leave, calendar days for the rest — me_requests.py request_days), so the form shows the balance, never a figure
// of its own. Sending and deleting go through /me/requests, the same routes the employee app uses.
import { useState } from "react";
import { useToast } from "@/components/common/toast";
import { MeState } from "@/components/me/me-shell";
import { ApiError } from "@/lib/api";
import { myEmployee } from "@/lib/employees";
import { ddmmyyyy, todayIso } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/ar";
import { useLocale } from "@/lib/i18n/locale";
import {
  cancelMyLeave, deleteMyRequest, editMyLeave, LEAVE_ROW_TYPES, LEAVE_TYPES, myLeave, myLeavePolicy, myRequests, requestLeaveCancel,
  submitMyRequest, type MyRequest, type MyRequestType,
} from "@/lib/me";
import { reqLabel } from "@/lib/me-labels";
import { useApi } from "@/lib/use-api";

/** The one line that says what a request is about (the design's reqDetail). */
function detail(r: MyRequest): string {
  if (r.from_date) return `${ddmmyyyy(r.from_date)} ← ${ddmmyyyy(r.to_date)}${r.days ? ` · ${Number(r.days)}` : ""}`;
  if (r.on_date) return `${ddmmyyyy(r.on_date)}${r.time_from ? ` ${r.time_from.slice(0, 5)}` : ""}${r.hours ? ` · ${Number(r.hours)}` : ""}`;
  if (r.amount) return `${Number(r.amount).toLocaleString("en-US")} ر.س`;
  return r.notes ?? "";
}

function Badge({ r }: { r: MyRequest }) {
  const { t } = useLocale();
  if (r.status === "approved") return <span className="b bg">{t("me.stApproved")}</span>;
  if (r.status === "rejected") return <span className="b br">{t("me.stRejected")}</span>;
  const stage: Record<string, MessageKey> = { manager: "me.stManager", hr: "me.stHr", ceo: "me.stCeo" };
  const key = stage[r.stage];
  return <span className="b ba">{key ? t(key) : t("me.stPending")}</span>;
}


export default function MeLeaves() {
  const { t, lang } = useLocale();
  const toast = useToast();
  const { data: e, error, loading } = useApi(myEmployee, "me");
  const reqs = useApi(myRequests, `mereqs:${e?.id ?? ""}`);
  const leave = useApi(myLeave, `meleave:${e?.id ?? ""}`);
  const policy = useApi(myLeavePolicy, `melvpol:${e?.id ?? ""}`);
  const [editing, setEditing] = useState<{ id: string; from: string; to: string } | null>(null);
  const [type, setType] = useState<MyRequestType>("annual");
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  if (error?.status === 404) return <MeState error={t("me.noEmployee")} />;
  if (!e) return <MeState loading={loading} error={error?.message} />;

  const ty = (k: string) => reqLabel(k, lang);
  const list = reqs.data ?? [];
  const pending = list.filter((r) => r.status === "pending").length;

  async function send(ev: React.FormEvent) {
    ev.preventDefault();
    if (!from || !to || to < from) return toast(t("me.lvBadPeriod"), "err");
    setBusy(true);
    try {
      await submitMyRequest({ type, from_date: from, to_date: to, notes: notes.trim() || undefined });
      toast(t("me.lvSent"), "ok");
      setNotes("");
      reqs.reload();
      leave.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t("common.error"), "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: MyRequest) {
    if (!window.confirm(t("me.lvDeleteQ"))) return;
    try {
      await deleteMyRequest(r.id);
      toast(t("me.lvDeleted"), "ok");
      reqs.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t("common.error"), "err");
    }
  }

  // Stage 14: cancel / change dates of a pending leave, ask to cancel an approved one (each behind HR's switch)
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast(ok, "ok");
      setEditing(null);
      reqs.reload();
      leave.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t("common.error"), "err");
    }
  }
  const cancel = (r: MyRequest) =>
    window.confirm(T("تُلغى الإجازة قبل الموافقة عليها ويُبلَّغ من ينتظر ردّه. هل أنت متأكد؟", "Cancel this leave before it is decided? Whoever it waits for is told."))
    && act(() => cancelMyLeave(r.id), T("تم إلغاء الطلب", "Request cancelled"));
  const askCancel = (r: MyRequest) =>
    window.confirm(T("يُرسل طلب إلغاء لإجازتك المعتمدة ويمرّ بالموافقات، وعند اعتماده ترجع أيامها لرصيدك. هل أنت متأكد؟", "Send a request to cancel this approved leave? Once approved, its days return to your balance."))
    && act(() => requestLeaveCancel(r.id), T("تم إرسال طلب الإلغاء", "Cancellation request sent"));
  const leaveRow = (r: MyRequest) => LEAVE_ROW_TYPES.has(r.type) && !r.payload?.cancelled;
  const small: React.CSSProperties = { background: "transparent", border: "1px solid var(--bd)", padding: "4px 9px", fontSize: 11 };

  return (
    <>
      <div className="card">
        <div className="card-title"><i className="ti ti-clipboard-list" aria-hidden /> {t("me.lvTitle")}</div>
        {pending > 0 && <div style={{ fontSize: 11.5, color: "var(--am)", marginBottom: 6 }}>{t("me.lvPending", { n: pending })}</div>}
        {reqs.error && <div style={{ color: "var(--rd)", fontSize: 12 }}>{reqs.error.message}</div>}
        {reqs.data && !list.length && <div style={{ color: "var(--mu)", fontSize: 12 }}>{t("me.lvNone")}</div>}
        {list.map((r) => (
          <div key={r.id} className="req-item" style={{ alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <b style={{ fontSize: 12.5 }}>{ty(r.type)}</b>
                <Badge r={r} />
              </div>
              <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 2 }}>{detail(r)}</div>
              {r.notes && <div style={{ fontSize: 11, marginTop: 2 }}>{r.notes}</div>}
              {r.status === "rejected" && r.rejection_reason && <div style={{ fontSize: 11, color: "var(--rd)", marginTop: 2 }}>❌ {r.rejection_reason}</div>}
              <div style={{ fontSize: 10, color: "var(--mu)", marginTop: 3 }}>{ddmmyyyy(r.created_at)}</div>
              {r.cancel_pending && <div style={{ fontSize: 11, color: "var(--am)", marginTop: 3 }}>⏳ طلب إلغاء هذه الإجازة قيد الاعتماد</div>}
              {r.payload?.cancelled && <div style={{ fontSize: 11, color: "var(--am)", marginTop: 3 }}>🚫 {T("أُلغيت هذه الإجازة", "This leave was cancelled")}{r.payload.cancelled.reason ? ": " + r.payload.cancelled.reason : ""}</div>}
              {leaveRow(r) && policy.data && (
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {r.status === "pending" && policy.data.emp_edit_pending && (
                    <button type="button" className="btn" style={{ ...small, color: "var(--bl)" }}
                      onClick={() => setEditing({ id: r.id, from: String(r.from_date ?? r.payload?.from ?? ""), to: String(r.to_date ?? r.payload?.to ?? "") })}>
                      {T("تعديل التواريخ", "Change dates")}
                    </button>
                  )}
                  {r.status === "pending" && policy.data.emp_cancel_pending && (
                    <button type="button" className="btn" style={{ ...small, color: "var(--am)" }} onClick={() => cancel(r)}>{T("إلغاء الطلب", "Cancel request")}</button>
                  )}
                  {r.status === "approved" && !r.cancel_pending && policy.data.emp_request_cancel_approved && (
                    <button type="button" className="btn" style={{ ...small, color: "var(--am)" }} onClick={() => askCancel(r)}>{T("طلب إلغاء الإجازة", "Ask to cancel")}</button>
                  )}
                </div>
              )}
              {editing?.id === r.id && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
                  <div><label style={{ fontSize: 11 }}>{T("من", "From")}</label><input type="date" value={editing.from} onChange={(ev) => setEditing({ ...editing, from: ev.target.value })} /></div>
                  <div><label style={{ fontSize: 11 }}>{T("إلى", "To")}</label><input type="date" value={editing.to} onChange={(ev) => setEditing({ ...editing, to: ev.target.value })} /></div>
                  <button type="button" className="btn bpl" style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={() => act(() => editMyLeave(r.id, editing.from, editing.to), T("تم تعديل التواريخ", "Dates changed"))}>{T("حفظ", "Save")}</button>
                  <button type="button" className="btn" style={small} onClick={() => setEditing(null)}>{T("رجوع", "Back")}</button>
                </div>
              )}
            </div>
            {r.status !== "approved" && (
              <button type="button" className="btn" onClick={() => remove(r)}
                style={{ background: "transparent", border: "1px solid var(--bd)", color: "var(--rd)", padding: "5px 10px", fontSize: 11 }}>
                {t("me.lvDelete")}
              </button>
            )}
          </div>
        ))}
      </div>


      <div className="card">
        <div className="card-title"><i className="ti ti-send" aria-hidden /> {t("me.lvNew")}</div>
        <form onSubmit={send}>
          <label htmlFor="lvType">{t("me.lvType")}</label>
          <select id="lvType" value={type} onChange={(ev) => setType(ev.target.value as MyRequestType)} style={{ marginBottom: 12 }}>
            {LEAVE_TYPES.map((k) => <option key={k} value={k}>{ty(k)}</option>)}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label htmlFor="lvFrom">{t("me.lvFrom")}</label>
              <input id="lvFrom" type="date" value={from} onChange={(ev) => setFrom(ev.target.value)} />
            </div>
            <div>
              <label htmlFor="lvTo">{t("me.lvTo")}</label>
              <input id="lvTo" type="date" value={to} min={from || undefined} onChange={(ev) => setTo(ev.target.value)} />
            </div>
          </div>
          {type === "annual" && leave.data && (
            <div style={{ fontSize: 11.5, color: "var(--mu)", marginTop: 8 }}>{t("me.lvAvailable", { n: leave.data.current })}</div>
          )}
          <label htmlFor="lvNotes" style={{ display: "block", marginTop: 10 }}>{t("me.lvNotes")}</label>
          <textarea id="lvNotes" rows={2} value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder={t("me.lvNotesOpt")} />
          <div style={{ fontSize: 10.5, color: "var(--mu)", marginTop: 6 }}>{t("me.lvDaysNote")}</div>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 10 }}>
            {busy ? "…" : t("me.lvSubmit")}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title"><i className="ti ti-route" aria-hidden /> {t("me.lvPathTitle")}</div>
        <div style={{ fontSize: 11, color: "var(--mu)", lineHeight: 1.8 }}>{t("me.lvPath")}</div>
        {leave.data?.upcoming_holidays?.length ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--bl)", marginBottom: 4 }}>{t("me.lvHolidays")}</div>
            {leave.data.upcoming_holidays.map((h) => (
              <div key={h.date} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                <span>{h.name}</span>
                <span style={{ color: "var(--mu)" }}>{ddmmyyyy(h.date)}{h.days > 1 ? ` (${h.days})` : ""}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

