"use client";

// The employee web area's overtime tab, as the design's Overtime.jsx: a request (a day, the hours — half an
// hour at least — and the reason) and my overtime requests with their stage. POST /me/requests handles the
// `overtime` type (canonical.py); the design's optional attachment is left out, so the reason goes in the notes.
import { useState } from "react";
import { StatusIcon } from "@/components/common/status-icon";
import { useToast } from "@/components/common/toast";
import { MeState } from "@/components/me/me-shell";
import { ApiError } from "@/lib/api";
import { ddmmyyyy, todayIso } from "@/lib/format";
import { useLocale } from "@/lib/i18n/locale";
import { deleteMyRequest, myRequests, submitMyRequest, type MyRequest } from "@/lib/me";
import { useApi } from "@/lib/use-api";

export default function MeOvertime() {
  const { lang } = useLocale();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const toast = useToast();
  const reqs = useApi(myRequests, "me-requests");
  const [date, setDate] = useState(todayIso());
  const [hours, setHours] = useState("1");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => (e instanceof ApiError ? e.message || T("تعذر تنفيذ العملية", "Could not complete the action") : String(e));

  async function send(ev: React.FormEvent) {
    ev.preventDefault();
    const h = Number(hours);
    if (!date || !h || h < 0.5) {
      toast(T("حدد التاريخ وعدد الساعات (0.5 على الأقل)", "Select the date and the hours (0.5 at least)"), "err");
      return;
    }
    setBusy(true);
    try {
      await submitMyRequest({ type: "overtime", on_date: date, hours: h, notes: notes.trim() || undefined });
      toast(T("أُرسل طلب العمل الإضافي", "Overtime request submitted"), "ok");
      setNotes("");
      reqs.reload();
    } catch (e) {
      toast(fail(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: MyRequest) {
    if (!window.confirm(T("حذف هذا الطلب؟", "Delete this request?"))) return;
    try {
      await deleteMyRequest(r.id);
      toast(T("تم حذف الطلب", "Request deleted"), "ok");
      reqs.reload();
    } catch (e) {
      toast(fail(e), "err");
    }
  }

  if (reqs.error) return <MeState error={reqs.error.message} />;
  const list = (reqs.data ?? []).filter((r) => r.type === "overtime");
  const stage = (r: MyRequest) =>
    r.stage === "manager" ? T("بانتظار المدير", "With the manager") : r.stage === "hr" ? T("بانتظار الموارد البشرية", "With HR") : r.stage === "ceo" ? T("بانتظار الرئيس التنفيذي", "With the CEO") : T("بانتظار الاعتماد", "Pending");

  return (
    <>
      <div className="card">
        <div className="card-title">⏱️ {T("طلب عمل إضافي", "Overtime request")}</div>
        <form onSubmit={send}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label htmlFor="otDate">{T("التاريخ", "Date")}</label>
              <input id="otDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="otHours">{T("عدد الساعات", "Hours")}</label>
              <input id="otHours" type="number" min="0.5" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          </div>
          <label htmlFor="otNotes" style={{ display: "block", marginTop: 10 }}>{T("السبب / المهمة", "Reason / task")}</label>
          <textarea id="otNotes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div style={{ fontSize: 10.5, color: "var(--mu)", marginTop: 6 }}>
            {T("الحد الأدنى نصف ساعة، والتاريخ هو يوم العمل الإضافي نفسه.", "Half an hour is the minimum, and the date is the day the overtime was worked.")}
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 10 }}>
            {busy ? "…" : T("إرسال الطلب", "Submit request")}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">📋 {T("طلبات العمل الإضافي", "Overtime requests")}</div>
        {!list.length && <div style={{ color: "var(--mu)", textAlign: "center", padding: 10, fontSize: 12 }}>{T("لا توجد طلبات", "No requests")}</div>}
        {list.map((r) => (
          <div key={r.id} className="req-item" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <b style={{ fontSize: 12.5 }}>{ddmmyyyy(r.on_date)}</b>
                <span style={{ fontSize: 11, color: "var(--mu)" }}>{Number(r.hours ?? 0)} {T("ساعة", "hours")}</span>
              </div>
              {r.notes && <div style={{ fontSize: 11, marginTop: 2 }}>{r.notes}</div>}
              {r.status === "rejected" && r.rejection_reason && <div style={{ fontSize: 11, color: "var(--rd)", marginTop: 2 }}><StatusIcon name="rejected" />{r.rejection_reason}</div>}
              <div style={{ fontSize: 10, color: "var(--mu)", marginTop: 3 }}>{ddmmyyyy(r.created_at)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
              {r.status === "approved" ? (
                <span className="b bg">{T("موافق", "Approved")}</span>
              ) : r.status === "rejected" ? (
                <span className="b br">{T("مرفوض", "Rejected")}</span>
              ) : (
                <span className="b ba">{stage(r)}</span>
              )}
              {r.status !== "approved" && (
                <button type="button" className="btn" onClick={() => void remove(r)} style={{ background: "transparent", border: "1px solid var(--bd)", color: "var(--rd)", padding: "5px 10px", fontSize: 11 }}>
                  {T("حذف", "Delete")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

