"use client";

// Settings ▸ the design's LeavePolicyCard and WorkflowCard on OUR /settings/leave-policy and /settings/workflow
// (Stage 12). Editing needs `settings: edit`; «تشغيل الآن» for escalation needs `requests: edit`. The API checks
// both itself. Approval circles are a later stage (owner, 4 Nov 2026); e-mail stays off, so the extra HR e-mail
// list is kept but nothing is sent.
// LeaveRulesCard (Stage 20, S7) is the design's CarryCard + accrual method + RightsCard on OUR
// /settings/leave-rules, over `backend/app/services/leave_rules.py`.
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/common/toast";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/i18n/locale";
import { getLeavePolicy, getWorkflow, putLeavePolicy, putWorkflow, runEscalation, type LeavePolicy, type WorkflowSettings } from "@/lib/leave";
import { getLeaveRules, putLeaveRules, type AccrualMethod, type LeaveRulesPayload, type SpecialKind } from "@/lib/settings";

const card: React.CSSProperties = { marginTop: 12, maxWidth: 900 };
const err = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

const POLICY_ROWS: [keyof LeavePolicy, string, string][] = [
  ["emp_cancel_pending", "يسمح للموظف بإلغاء طلب الإجازة قبل الموافقة عليه", "Employee may cancel a leave request before approval"],
  ["emp_edit_pending", "يسمح للموظف بتعديل تواريخ طلب الإجازة قبل الموافقة", "Employee may edit leave dates before approval"],
  ["emp_request_cancel_approved", "يسمح للموظف بإرسال «طلب إلغاء» لإجازة معتمدة (يمرّ بدائرة الموافقات)", "Employee may request cancelling an approved leave (goes through the approval circle)"],
  ["allow_advance_balance", "السماح للموظف باستخدام رصيده قبل استحقاقه", "Employee may use leave before it accrues"],
  ["hr_cancel_approved", "تسمح للموارد البشرية بإلغاء إجازة معتمدة وإرجاع الرصيد مباشرة", "HR may cancel an approved leave and restore the balance directly"],
];

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
      toast("✓ " + T("تم حفظ سياسة الإجازات", "Leave policy saved"), "ok");
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
      toast("✓ " + T("تم حفظ إعدادات سير الطلبات", "Workflow settings saved"), "ok");
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
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-route" /> {T("سير الطلبات: مسار الاعتماد والتصعيد", "Request workflow: approvals and escalation")}</div>
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

// ---- Stage 20 (S7): the carry cap, the accrual method and the three special types' rights ----
// The order and wording follow the design's CarryCard / RightsCard; the figures and the counts come from the server,
// which is also what the ledger and the reports read (`services/leave_rules.py` → `services/leave.py`).
const ACCRUAL: Record<AccrualMethod, { ar: string; en: string; noteAr: string; noteEn: string }> = {
  workdays: {
    ar: "أيام العمل", en: "Working days",
    noteAr: "يُستحق بنسبة أيام العمل المنقضية من السنة (بدون الجمعة والسبت والعطل) — وهو ما عليه كل الأرصدة الحالية.",
    noteEn: "Pro-rated over the working days elapsed (Fri/Sat and holidays out) — what every current balance uses.",
  },
  calendar: {
    ar: "تقويمي", en: "Calendar",
    noteAr: "يُستحق بنسبة أيام السنة الميلادية المنقضية (365، و366 في السنة الكبيسة) بما فيها العطل.",
    noteEn: "Pro-rated over the calendar days elapsed (365, or 366 in a leap year), weekends and holidays included.",
  },
  monthly: {
    ar: "شهري", en: "Monthly",
    noteAr: "يُستحق 1/12 من الرصيد السنوي عن كل شهر، والشهر الجاري بنسبة أيامه المنقضية.",
    noteEn: "1/12 of the annual entitlement for every month, the current one by its elapsed days.",
  },
};
const KINDS: [SpecialKind, string, string][] = [
  ["consultant", "استشاري (مهمة محددة)", "Consultant"],
  ["tamheer", "التمهير", "Tamheer"],
  ["trainee", "متدرب", "Trainee"],
];


export function LeaveRulesCard() {
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (ar: string, e: string) => (en ? e : ar);
  const toast = useToast();
  const { can } = useAuth();
  const edit = can("settings", "edit");
  const [v, setV] = useState<LeaveRulesPayload | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setV(await getLeaveRules());
    } catch (e) {
      toast(err(e), "err");
    }
  }, [toast]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the card's first read
    void load();
  }, [load]);

  async function save() {
    if (!v) return;
    setBusy(true);
    try {
      setV(await putLeaveRules({
        carry: { enabled: v.carry.enabled, days: Number(v.carry.days) || 0 },
        accrual: { method: v.accrual.method },
        rights: v.rights,
      }));
      toast("✓ " + T("تم حفظ قواعد الإجازات", "Leave rules saved"), "ok");
    } catch (e) {
      toast(err(e), "err");
    } finally {
      setBusy(false);
    }
  }

  const right = (k: SpecialKind, f: "leave" | "eos") =>
    setV((o) => (o ? { ...o, rights: { ...o.rights, [k]: { ...o.rights[k], [f]: !o.rights[k][f] } } } : o));
  const method = v ? (ACCRUAL[v.accrual.method] ?? ACCRUAL.workdays) : null;

  return (
    <div className="card" style={card} id="LEAVE_RULES">
      <div className="ct" style={{ marginBottom: 8 }}>
        <i className="ti ti-calendar-repeat" /> {T("ترحيل الرصيد وطريقة الاستحقاق والاستحقاقات الخاصة", "Carry-over, accrual method and special entitlements")}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--mu)", lineHeight: 1.7, marginBottom: 8 }}>
        {T("هذه القواعد يطبّقها الخادم على كل رصيد وتقرير فور الحفظ: الترحيل للسنة التالية، وطريقة احتساب الاستحقاق، ومن يستحق إجازة ومن يُحتسب له فائض نهاية الخدمة.",
          "The server applies these rules to every balance and report as soon as they are saved: what carries into next year, how the entitlement accrues, and who keeps a leave balance and an end-of-service excess.")}
      </div>
      {!v ? <div style={{ color: "var(--mu)" }}>…</div> : (
        <>
          <div style={{ fontWeight: 700, fontSize: 12.5, margin: "6px 0" }}>{T("ترحيل الرصيد", "Carry-over")}</div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
            <input type="checkbox" checked={v.carry.enabled} disabled={!edit || busy} onChange={(e) => setV({ ...v, carry: { ...v.carry, enabled: e.target.checked } })} />
            {T("ترحيل ما تبقّى من الرصيد إلى السنة التالية", "Carry the remaining balance into the next year")}
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginTop: 6, flexWrap: "wrap" }}>
            <span>{T("حد الترحيل", "Carry cap")}</span>
            <input type="number" min={0} max={v.max_carry_days} value={v.carry.days} disabled={!edit || busy || !v.carry.enabled}
              style={{ width: 90 }} onChange={(e) => setV({ ...v, carry: { ...v.carry, days: Number(e.target.value) || 0 } })} />
            <span>{T("يوم في السنة", "days per year")}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 4 }}>
            {v.carry.enabled
              ? T(`ما زاد على ${Number(v.carry.days)} يومًا لا يُرحَّل، ويُدفع مع نهاية الخدمة كفائض إجازات.`,
                `Anything above ${Number(v.carry.days)} days is not carried and is paid out at the end of service as a leave excess.`)
              : T("الحد موقوف: يُرحَّل كامل الرصيد، ولا يوجد فائض نهاية خدمة.",
                "No cap: the whole balance carries and there is no end-of-service excess.")}
          </div>
          <div style={{ fontWeight: 700, fontSize: 12.5, margin: "12px 0 6px" }}>{T("طريقة احتساب الاستحقاق", "Accrual method")}</div>
          <select value={v.accrual.method} disabled={!edit || busy} style={{ minWidth: 220 }}
            onChange={(e) => setV({ ...v, accrual: { method: e.target.value as AccrualMethod } })}>
            {v.methods.map((m) => <option key={m} value={m}>{en ? ACCRUAL[m].en : ACCRUAL[m].ar}</option>)}
          </select>
          {method && <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 4 }}>{en ? method.noteEn : method.noteAr}</div>}
          <div style={{ fontWeight: 700, fontSize: 12.5, margin: "12px 0 6px" }}>{T("الاستحقاقات الخاصة", "Special entitlements")}</div>
          <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 6 }}>
            {T("إلغاء «إجازات» يعني عدم وجود رصيد إجازات لهذا النوع أصلًا، وإلغاء «نهاية الخدمة» يعني عدم احتساب فائض إجازاته عند نهاية الخدمة. الحفظ يسري على كل الأرصدة والتقارير.",
              "Clearing «leave» means the type keeps no leave ledger at all; clearing «end of service» means its leave excess is not counted at the end of service. Saving applies to every balance and report.")}
          </div>
          <table className="tbl" style={{ width: "100%", fontSize: 12 }}>
            <thead>
              <tr>
                <th>{T("نوع الموظف", "Employee type")}</th>
                <th>{T("إجازات", "Leave")}</th>
                <th>{T("نهاية الخدمة", "End of service")}</th>
                <th>{T("عدد الموظفين", "Employees")}</th>
              </tr>
            </thead>
            <tbody>
              {KINDS.map(([k, ar, e]) => (
                <tr key={k}>
                  <td>{en ? e : ar}</td>
                  <td><input type="checkbox" checked={!!v.rights[k]?.leave} disabled={!edit || busy} onChange={() => right(k, "leave")} /></td>
                  <td><input type="checkbox" checked={!!v.rights[k]?.eos} disabled={!edit || busy} onChange={() => right(k, "eos")} /></td>
                  <td dir="ltr">{v.employees[k] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10.5, color: "var(--mu)", marginTop: 6 }}>
            {T(`ومن ليس من هذه الأنواع (${v.employees.other ?? 0} موظفًا) تبقى له إجازاته وفائض نهاية الخدمة دائمًا.`,
              `Everyone outside these types (${v.employees.other ?? 0}) always keeps a leave balance and an end-of-service excess.`)}
          </div>
          {edit && (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn bpl bsm" disabled={busy} onClick={() => void save()}>
                <i className="ti ti-device-floppy" /> {T("حفظ", "Save")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

