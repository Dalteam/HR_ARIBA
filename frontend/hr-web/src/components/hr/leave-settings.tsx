"use client";

// Settings ▸ the design's LeavePolicyCard and WorkflowCard on OUR /settings/leave-policy and /settings/workflow
// (Stage 12). Editing needs `settings: edit`; «تشغيل الآن» for escalation needs `requests: edit`. The API checks
// both itself. Approval circles are a later stage (owner, 4 Nov 2026); e-mail stays off, so the extra HR e-mail
// list is kept but nothing is sent.
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/common/toast";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/i18n/locale";
import { getLeavePolicy, getWorkflow, putLeavePolicy, putWorkflow, runEscalation, type LeavePolicy, type WorkflowSettings } from "@/lib/leave";

const card: React.CSSProperties = { marginTop: 12, maxWidth: 900 };
const err = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

const POLICY_ROWS: [keyof LeavePolicy, string, string][] = [
  ["emp_cancel_pending", "يسمح للموظف بإلغاء طلب الإجازة قبل الموافقة عليه", "Employee may cancel a leave request before approval"],
  ["emp_edit_pending", "يسمح للموظف بتعديل تواريخ طلب الإجازة قبل الموافقة", "Employee may edit leave dates before approval"],
  ["emp_request_cancel_approved", "يسمح للموظف بإرسال «طلب إلغاء» لإجازة معتمدة (يمرّ بدائرة الموافقات)", "Employee may request cancelling an approved leave (goes through the approval circle)"],
  ["allow_advance_balance", "السماح للموظف باستخدام رصيده قبل استحقاقه", "Employee may use leave before it accrues"],
  ["hr_cancel_approved", "تسمح للموارد البشرية بإلغاء إجازة معتمدة وإرجاع الرصيد مباشرة", "HR may cancel an approved leave and restore the balance directly"],
];
/** The switches the API already acts on; the employee-side ones arrive with the employee app's leave stage. */
const LIVE: (keyof LeavePolicy)[] = ["hr_cancel_approved"];

export function LeavePolicyCard() {
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (ar: string, e: string) => (en ? e : ar);
  const toast = useToast();
  const { can } = useAuth();
  const edit = can("settings", "edit");
  const [v, setV] = useState<LeavePolicy | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getLeavePolicy().then(setV).catch((e) => toast(err(e), "err"));
  }, [toast]);

  async function save() {
    if (!v) return;
    setBusy(true);
    try {
      setV(await putLeavePolicy(v));
      toast("✓ " + T("اتحفظت سياسة الإجازات", "Leave policy saved"), "ok");
    } catch (e) {
      toast(err(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={card} id="LEAVE_POLICY">
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-calendar-x" /> {T("إلغاء وتعديل واسترجاع الإجازات", "Leave cancel / edit / restore")}</div>
      <div style={{ fontSize: 11.5, color: "var(--mu)", lineHeight: 1.7, marginBottom: 8 }}>
        {T("عند إلغاء إجازة معتمدة ترجع أيامها لرصيد الموظف تلقائيًا ويصله إشعار. الإيقاف هنا يُطبَّق من الخادم فعليًا.", "Cancelling an approved leave returns its days to the balance and notifies the employee. Switching off here is enforced by the server.")}
      </div>
      {!v ? <div style={{ color: "var(--mu)" }}>…</div> : POLICY_ROWS.map(([k, ar, e]) => (
        <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, padding: "5px 0" }}>
          <input type="checkbox" checked={v[k]} disabled={!edit || busy} onChange={(ev) => setV({ ...v, [k]: ev.target.checked })} />
          {en ? e : ar}
          {!LIVE.includes(k) && <span style={{ fontSize: 10.5, color: "var(--mu)" }}>({T("يُطبَّق مع مرحلة إجازات تطبيق الموظف", "applies with the employee-app leave stage")})</span>}
        </label>
      ))}
      {edit && <div style={{ marginTop: 10 }}><button type="button" className="btn bpl bsm" disabled={busy || !v} onClick={save}><i className="ti ti-device-floppy" /> {T("حفظ", "Save")}</button></div>}
    </div>
  );
}

export function WorkflowCard() {
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (ar: string, e: string) => (en ? e : ar);
  const toast = useToast();
  const { can } = useAuth();
  const edit = can("settings", "edit");
  const runner = can("requests", "edit");
  const [w, setW] = useState<WorkflowSettings | null>(null);
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getWorkflow();
      setW(data);
      setEmails(data.extra_hr_emails.join(", "));
    } catch (e) {
      toast(err(e), "err");
    }
  }, [toast]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the card's first read
    void load();
  }, [load]);

  async function save() {
    if (!w) return;
    setBusy(true);
    try {
      const saved = await putWorkflow({
        manager_wait_days: Number(w.manager_wait_days), ceo_wait_days: Number(w.ceo_wait_days),
        advance_max_percent: Number(w.advance_max_percent), final_by_type: w.final_by_type,
        extra_hr_emails: emails.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean),
      });
      setW({ ...w, ...saved });
      toast("✓ " + T("اتحفظت إعدادات سير الطلبات", "Workflow settings saved"), "ok");
    } catch (e) {
      toast(err(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    try {
      const r = await runEscalation();
      toast("✓ " + T(`تم التشغيل: ${r.escalated} طلب انتقل للموارد البشرية`, `Done: ${r.escalated} request(s) moved to HR`), "ok");
      await load();
    } catch (e) {
      toast(err(e), "err");
    } finally {
      setBusy(false);
    }
  }

  const num = (k: "manager_wait_days" | "ceo_wait_days" | "advance_max_percent", min: number, max: number) => (
    <input type="number" min={min} max={max} value={w ? w[k] : ""} disabled={!edit || busy} style={{ width: 90 }}
      onChange={(e) => w && setW({ ...w, [k]: e.target.value as unknown as number })} />
  );
  const finalTypes = w ? Object.keys(w.final_by_type) : [];
  const typeName = (code: string) => w?.types?.find((t) => t.code === code)?.name_ar || code;
  return (
    <div className="card" style={card} id="WF_CARD">
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-route" /> {T("مسار اعتماد الطلبات والتصعيد", "Request workflow and escalation")}</div>
      {!w ? <div style={{ color: "var(--mu)" }}>…</div> : (
        <>
          <div className="fg">
            <div><label>{T("مهلة المدير المباشر (أيام)", "Direct manager's wait (days)")}</label>{num("manager_wait_days", 0, 60)}</div>
            <div><label>{T("مهلة الرئيس التنفيذي (أيام)", "CEO's wait (days)")}</label>{num("ceo_wait_days", 0, 60)}</div>
            <div><label>{T("سقف السلفة (% من الراتب)", "Salary-advance ceiling (% of salary)")}</label>{num("advance_max_percent", 1, 1000)}</div>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--mu)", lineHeight: 1.7, margin: "8px 0" }}>
            {T("بعد انتهاء المهلة ينتقل الطلب للموارد البشرية للقرار (موافقة أو رفض أو إرجاع) ويصل إشعار للموارد البشرية والموظف والمدير. 0 = بدون تصعيد. الفحص تلقائي يوميًا الساعة 7:05 صباحًا بتوقيت الرياض.",
              "After the wait the request moves to HR for the decision (approve, reject or return); HR, the employee and the manager are notified. 0 = no escalation. The check runs automatically every day at 07:05 Riyadh time.")}
            {w.last_escalation && <> {T("آخر تشغيل: ", "Last run: ")}<b dir="ltr">{w.last_escalation.date}</b> — {w.last_escalation.moved}</>}
          </div>
          {finalTypes.length > 0 && (
            <>
              <div style={{ fontWeight: 700, fontSize: 12.5, margin: "10px 0 6px" }}>{T("الاعتماد الأخير لكل نوع طلب", "Final approver per request type")}</div>
              <div className="fg">
                {finalTypes.map((code) => (
                  <div key={code}>
                    <label>{typeName(code)}</label>
                    <select value={w.final_by_type[code]} disabled={!edit || busy} onChange={(e) => setW({ ...w, final_by_type: { ...w.final_by_type, [code]: e.target.value as "hr" | "ceo" } })}>
                      <option value="hr">{T("الموارد البشرية", "HR")}</option>
                      <option value="ceo">{T("الرئيس التنفيذي", "CEO")}</option>
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>{T("بريد إضافي لإشعارات الموارد البشرية", "Extra e-mail for HR notifications")}</label>
            <input value={emails} disabled={!edit || busy} onChange={(e) => setEmails(e.target.value)} style={{ width: "100%" }} dir="ltr" />
            <div style={{ fontSize: 10.5, color: "var(--mu)", marginTop: 3 }}>{T("يُحفظ فقط — إرسال البريد متوقف حاليًا.", "Saved only — e-mail sending is off for now.")}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {edit && <button type="button" className="btn bpl bsm" disabled={busy} onClick={save}><i className="ti ti-device-floppy" /> {T("حفظ", "Save")}</button>}
            {runner && <button type="button" className="btn bsm" disabled={busy} onClick={runNow}><i className="ti ti-player-play" /> {T("تشغيل التصعيد الآن", "Run escalation now")}</button>}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--mu)", marginTop: 8 }}>{T("دوائر الاعتماد المتعددة (مرشح أول وثانٍ وثالث لكل مرحلة) تأتي في مرحلة لاحقة.", "Multi-step approval circles (first, second and third approvers per step) come in a later stage.")}</div>
        </>
      )}
    </div>
  );
}
