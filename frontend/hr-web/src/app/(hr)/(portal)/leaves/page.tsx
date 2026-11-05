"use client";

// Leaves & requests (الإجازات والطلبات) in the updated design's form (its pages/leaves/*): pending · all requests ·
// new request · balances · official holidays · overtime. Every request type the employee app sends shows here, from
// OUR /requests, /holidays and /leave/balances routes. Decisions go through the design's note dialog (no browser
// pop-ups). Waiting for the "more HR leave actions" stage (lib/features.ts): return to the manager, cancelling an
// approved leave while keeping it, and undoing the last balance save. Kept from ours: the type filter on the pending
// list (the attendance page links to it for forgotten punches), the labour-law note, the missing-Eid warning and
// deleting a request (permanent here: the design's recycle bin is its own stage).
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Modal } from "@/components/hr/modal";
import { PageState } from "@/components/hr/not-built";
import { PromptModal } from "@/components/hr/prompt-modal";
import { useToast } from "@/components/common/toast";
import { useAuth } from "@/lib/auth-context";
import { listAllEmployees, openDocument, uploadDocument } from "@/lib/employees";
import { isReady } from "@/lib/features";
import { ddmmyyyy, todayIso } from "@/lib/format";
import { useLocale } from "@/lib/i18n/locale";
import { printHtml } from "@/lib/print";
import { tableHtml } from "@/lib/exporter";
import type { EmployeeListItem } from "@/lib/api";
import {
  addHoliday,
  approveRequest,
  balanceDetail,
  countWorkdays,
  createRequest,
  deleteHoliday,
  deleteRequest,
  finalApproveRequest,
  listBalances,
  listHolidays,
  listRequests,
  LVL,
  OTHER_TYPES,
  overrideRequest,
  cancelLeave,
  rejectRequest,
  returnToManager,
  saveBalance,
  balanceHistory,
  undoBalance,
  typeLabel,
  type BalanceDetail,
  type BalanceRow,
  type Holiday,
  type HrRequest,
} from "@/lib/leave";
import { DateField } from "@/components/common/date-time-field";

type Tab = "lv1" | "lv2" | "lv3" | "lv4" | "lv5" | "lv6";
type Tr = (ar: string, en: string) => string;
const TABS: Tab[] = ["lv1", "lv2", "lv3", "lv4", "lv5", "lv6"];
const fD = (d: string | null) => (d ? ddmmyyyy(d) : "—");
const f2 = (n: number) => Number(n || 0).toFixed(2);
const short = (s: string) => s.split(" ").slice(0, 3).join(" ");
const PERM_LIKE = new Set(["permission", "maternity_permission", "early_leave", "advance"]);
/** the leave types HR records on the «طلب جديد» tab (the design's HR_LEAVE_TYPES, those our API knows) */
const HR_TYPES = Object.keys(LVL);
/** consultants, Tamheer and trainees earn no annual leave (the design's leaveExempt) */
const EXEMPT = new Set(["consultant", "tamheer", "training"]);
const EN_TYPE: Record<string, string> = {
  annual: "Annual", sick: "Sick", emergency: "Emergency", death: "Bereavement", marriage: "Marriage", paternity: "Paternity", maternity: "Maternity", umrah: "Umrah", hajj: "Hajj", remote: "Remote",
  permission: "Permission", maternity_permission: "Maternity permission", early_leave: "Early leave", advance: "Salary advance", mission: "Mission", forgot_punch: "Forgot punch", overtime: "Overtime",
};
const STAGE: Record<string, [string, string]> = { manager: ["بانتظار المدير المباشر", "Pending Direct Manager"], hr: ["بانتظار الموارد البشرية", "Pending HR"], ceo: ["بانتظار الرئيس التنفيذي", "Pending CEO"] };
const STAGE_ORDER: Record<string, number> = { hr: 0, manager: 1, ceo: 2 };

/** The note dialog's purpose (the design's `dlg.kind`). */
type Dlg = { kind: "approve" | "final" | "reject" | "delete" | "return" | "cancel"; r: HrRequest } | null;

function useT() {
  const { lang } = useLocale();
  const en = lang === "en";
  const T: Tr = (a, b) => (en ? b : a);
  return { en, T, ty: (t: string) => (en ? EN_TYPE[t] ?? t : typeLabel(t)) };
}

export default function Page() {
  return (
    <Suspense>
      <RequestsPage />
    </Suspense>
  );
}

function RequestsPage() {
  const toast = useToast();
  const { en, T } = useT();
  const { can: may } = useAuth();
  const can = may(["leaves", "requests"], "edit");
  // deep link from the attendance page: /leaves?tab=lv1&type=forgot_punch
  const params = useSearchParams();
  const tq = params.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(tq && TABS.includes(tq) ? tq : "lv1");
  const [typeFilter, setTypeFilter] = useState(params.get("type") ?? "");
  const [emps, setEmps] = useState<EmployeeListItem[]>([]);
  const [reqs, setReqs] = useState<HrRequest[] | null>(null);
  const [hols, setHols] = useState<Holiday[]>([]);
  const [bal, setBal] = useState<BalanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState("");
  const [dlg, setDlg] = useState<Dlg>(null);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    Promise.all([listAllEmployees({ tab: "active", sort: "name_ar" }), listRequests(), listHolidays(), listBalances()])
      .then(([p, r, h, b]) => {
        if (!alive) return;
        setEmps(p.items);
        setReqs(r);
        setHols(h);
        setBal(b);
        setError(null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [tick]);

  // every pending request of every type and date, HR's own stage first; the badge counts exactly what the list shows
  const pending = useMemo(
    () => (reqs ?? []).filter((r) => r.status === "pending").sort((a, b) => (STAGE_ORDER[a.stage] ?? 9) - (STAGE_ORDER[b.stage] ?? 9) || a.created_at.localeCompare(b.created_at)),
    [reqs],
  );

  async function act(fn: () => Promise<unknown>, ok: string, key: string) {
    setBusy(key);
    try {
      await fn();
      toast(ok, "ok");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    } finally {
      setBusy("");
    }
  }
  function confirm(v: string) {
    const d = dlg;
    setDlg(null);
    if (!d) return;
    const r = d.r;
    if (d.kind === "approve")
      act(() => (r.stage === "hr" ? approveRequest(r.id, v || undefined) : overrideRequest(r.id, v || "تمت الموافقة من الموارد البشرية")), "✓ " + T("تمت الموافقة على الطلب", "Request approved"), r.id);
    else if (d.kind === "final") act(() => finalApproveRequest(r.id, v || undefined), "✓ " + T("تم الاعتماد النهائي للطلب", "Request finally approved"), r.id);
    else if (d.kind === "reject") act(() => rejectRequest(r.id, v), T("تم رفض الطلب — أُرسل إشعار للموظف", "Request rejected — the employee was notified"), r.id);
    else if (d.kind === "return") act(() => returnToManager(r.id, v), "↩ " + T("أُعيد الطلب للمدير المباشر — أُرسل إشعار له وللموظف", "Returned to the direct manager — both were notified"), r.id);
    else if (d.kind === "cancel") act(() => cancelLeave(r.id, v), "✓ " + T("أُلغيت الإجازة ورجع رصيدها — أُرسل إشعار للموظف", "Leave cancelled and its days returned — the employee was notified"), r.id);
    else act(() => deleteRequest(r.id), T("تم الحذف", "Deleted"), r.id);
  }
  const att = (r: HrRequest) =>
    r.attachment_id ? (
      <button type="button" className="btn bsm" style={{ color: "var(--cy)", margin: 2 }} onClick={() => openDocument(r.attachment_id!).catch(() => toast(T("المرفق غير موجود", "Attachment not found"), "err"))}>
        📎 {T("مرفق", "Attachment")}
      </button>
    ) : null;

  const tabs: [Tab, string, string][] = [
    ["lv1", "معلقة", "Pending"],
    ["lv2", "كل الطلبات", "All Requests"],
    ["lv3", "طلب جديد", "New Request"],
    ["lv4", "الأرصدة", "Balances"],
    ["lv5", "الإجازات الرسمية", "Official Holidays"],
    ["lv6", "⏱️ عمل إضافي", "⏱️ Overtime"],
  ];

  return (
    <div className="pg on" id="pg-lv">
      <div className="tbar">
        {tabs.filter(([k]) => k !== "lv3" || can).map(([k, ar, enL]) => (
          <div key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
            {en ? enL : ar}
            {k === "lv1" && <> <span className="b ba" id="LVB">{pending.length}</span></>}
          </div>
        ))}
      </div>
      {!reqs ? (
        <PageState loading={!error} error={error} onRetry={reload} />
      ) : (
        <>
          {tab === "lv1" && <Pending list={pending} can={can} busy={busy} type={typeFilter} onType={setTypeFilter} setDlg={setDlg} att={att} />}
          {tab === "lv2" && <AllRequests reqs={reqs} emps={emps} can={can} initialType={typeFilter} setDlg={setDlg} att={att} onRefresh={reload} />}
          {tab === "lv3" && can && <NewRequest emps={emps} hols={hols} bal={bal} onDone={() => { reload(); setTab("lv1"); }} />}
          {tab === "lv4" && <Balances bal={bal} emps={emps} can={can} onSaved={reload} />}
          {tab === "lv5" && <Holidays hols={hols} can={can} onChange={reload} />}
          {tab === "lv6" && <Overtime emps={emps} can={can} reqs={reqs.filter((r) => r.type === "overtime")} setDlg={setDlg} att={att} onDone={reload} />}
        </>
      )}
      {dlg && (
        <PromptModal
          title={{ approve: T("موافقة على الطلب", "Approve the request"), final: T("اعتماد نهائي بالنيابة", "Final approval on behalf"), reject: T("سبب الرفض", "Rejection reason"), delete: T("حذف الطلب", "Delete the request"), return: T("إرجاع للمدير المباشر", "Return to the direct manager"), cancel: T("إلغاء الإجازة وإرجاع الرصيد", "Cancel the leave and restore the balance") }[dlg.kind]}
          label={dlg.kind === "reject" || dlg.kind === "cancel" ? T("السبب", "Reason") : dlg.kind === "return" ? T("ملاحظة للمدير المباشر", "Note for the direct manager") : T("ملاحظة (اختياري)", "Note (optional)")}
          required={dlg.kind === "reject" || dlg.kind === "return"}
          noInput={dlg.kind === "delete"}
          message={
            dlg.kind === "final"
              ? T("سيتم اعتماد الطلب نهائياً بالنيابة عن كل المراحل المتبقية (المدير المباشر / الموارد البشرية / الرئيس التنفيذي) ويُسجَّل أنه اعتماد بالنيابة. هل أنت متأكد؟", "The request will be finally approved on behalf of every remaining stage (direct manager / HR / CEO), recorded as an approval on behalf. Sure?")
              : dlg.kind === "delete"
                ? dlg.r.status === "approved" && dlg.r.type === "annual"
                  ? T("حذف الإجازة المعتمدة نهائيًا؟ يرجع رصيدها للموظف ويختفي الطلب من تطبيقه. (لا توجد سلة مهملات بعد.)", "Delete this approved leave for good? Its days return to the balance and it disappears from the employee app. (There is no recycle bin yet.)")
                  : T("حذف هذا الطلب نهائيًا؟ يختفي من تطبيق الموظف. (لا توجد سلة مهملات بعد.)", "Delete this request for good? It disappears from the employee app. (There is no recycle bin yet.)")
                : dlg.kind === "return"
                  ? T("يرجع الطلب للمدير المباشر ليرد عليه (موافقة أو رفض) قبل قرار الموارد البشرية، ويصله ويصل الموظف إشعار.", "The request goes back to the direct manager to answer before HR decides; both are notified.")
                  : dlg.kind === "cancel"
                    ? T("تُلغى الإجازة وتبقى في السجل «ملغاة»، وترجع أيامها لرصيد الموظف ويصله إشعار.", "The leave is cancelled and kept as «cancelled»; its days return to the balance and the employee is notified.")
                    : undefined
          }
          danger={dlg.kind === "reject" || dlg.kind === "delete" || dlg.kind === "cancel"}
          confirmText={dlg.kind === "reject" ? T("رفض", "Reject") : dlg.kind === "delete" ? T("حذف", "Delete") : dlg.kind === "return" ? T("إرجاع", "Return") : dlg.kind === "cancel" ? T("إلغاء الإجازة", "Cancel the leave") : T("تأكيد", "Confirm")}
          cancelText={T("إلغاء", "Cancel")}
          onClose={() => setDlg(null)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}

function TypeSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const { T, ty } = useT();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 170 }}>
      <option value="">{T("كل الأنواع", "All types")}</option>
      <optgroup label={T("الإجازات", "Leaves")}>{Object.keys(LVL).map((k) => <option key={k} value={k}>{ty(k)}</option>)}</optgroup>
      <optgroup label={T("طلبات أخرى", "Other requests")}>{Object.keys(OTHER_TYPES).map((k) => <option key={k} value={k}>{ty(k)}</option>)}</optgroup>
    </select>
  );
}

function detailOf(r: HrRequest, T: Tr) {
  const t5 = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");
  if (r.type === "forgot_punch") return "";
  if (r.type === "advance") return `${Number(r.amount ?? 0).toLocaleString("en-US")} SAR`;
  if (PERM_LIKE.has(r.type) || r.type === "overtime" || r.type === "mission")
    return `${fD(r.on_date)}${r.time_from ? " " + t5(r.time_from) : ""}${r.hours ? " | " + Number(r.hours) + T(" ساعة", " h") : ""}${r.amount ? " | " + Number(r.amount).toLocaleString("en-US") + " SAR" : ""}`;
  return `${fD(r.from_date)} ← ${fD(r.to_date)} | ${Number(r.days ?? 0)} ${T("يوم", "days")}`;
}

type RowProps = { can: boolean; setDlg: (d: Dlg) => void; att: (r: HrRequest) => React.ReactNode };

function Pending({ list: all, can, busy, type, onType, setDlg, att }: RowProps & { list: HrRequest[]; busy: string; type: string; onType: (v: string) => void }) {
  const { en, T, ty } = useT();
  const list = type ? all.filter((r) => r.type === type) : all;
  const KIND: Record<string, string> = { in: T("دخول", "Check-in"), out: T("خروج", "Check-out"), both: T("دخول وخروج", "Check-in & out") };
  return (
    <div id="lv1">
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="ch">
          <div className="ct"><i className="ti ti-clock" /> <span>{T("طلبات الموظفين المعلقة", "Pending Employee Requests")}</span></div>
          <TypeSelect value={type} onChange={onType} />
        </div>
        <div id="LVP">
          {!list.length && <div style={{ color: "var(--mu)", textAlign: "center", padding: 24, fontSize: 13 }}>✓ {T("لا توجد طلبات موظفين معلقة", "No pending employee requests")}</div>}
          {list.map((r) => {
            const st = STAGE[r.stage] ?? ["مكتمل", "Completed"];
            const t5 = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");
            return (
              <div key={r.id} style={{ padding: "12px 14px", borderBottom: "1px solid rgba(36,48,68,.5)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{short(r.employee_name)} <span className="b ba">{ty(r.type)}</span></div>
                    <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 4 }}>{detailOf(r, T)}</div>
                    {r.type === "forgot_punch" ? (
                      <div style={{ marginTop: 6, padding: "8px 10px", background: "rgba(14,165,233,.08)", borderRadius: 8, fontSize: 12, lineHeight: 1.8 }}>
                        <b>{KIND[r.punch_kind ?? ""] ?? ""}</b> — {fD(r.on_date)} — <span dir="ltr">{r.punch_kind === "both" ? t5(r.time_from) + " → " + t5(r.time_to) : t5(r.time_from)}</span>
                        {r.notes && <><br />{T("السبب", "Reason")}: {r.notes}</>}
                        <br /><span style={{ color: "#0f766e" }}>{T("عند الموافقة يتسجل تلقائيًا في سجل حضور الموظف.", "On approval it is recorded automatically in the employee attendance.")}</span>
                      </div>
                    ) : (
                      r.notes && <div style={{ fontSize: 11, color: "var(--dm)" }}>{r.notes}</div>
                    )}
                    {r.law_note && <div style={{ fontSize: 11, color: "var(--am)", marginTop: 2 }}><i className="ti ti-scale" aria-hidden /> {r.law_note}</div>}
                    <div style={{ fontSize: 10, color: "var(--dm)", marginTop: 3 }}>{en ? st[1] : st[0]}</div>
                  </div>
                  {att(r)}
                  {can && (
                    <>
                      <button type="button" className="btn bgl bsm" disabled={busy === r.id} title={r.stage === "manager" || r.stage === "ceo" ? T("الموارد البشرية تعتمد الطلب بالنيابة عن صاحب المرحلة الحالية", "HR approves on behalf of the current stage") : undefined} onClick={() => setDlg({ kind: "approve", r })}>
                        ✓ {en ? "Approve" : r.stage === "manager" ? "موافقة نيابة عن المدير المباشر" : r.stage === "ceo" ? "موافقة نيابة عن الرئيس التنفيذي" : "موافقة"}
                      </button>
                      {(r.stage === "manager" || r.stage === "hr") && (
                        <button type="button" className="btn bsm" style={{ background: "#0a5c9e", color: "#fff" }} disabled={busy === r.id} title={T("اعتماد الطلب نهائياً بالنيابة عن كل المراحل المتبقية", "Approve finally on behalf of every remaining stage")} onClick={() => setDlg({ kind: "final", r })}>
                          {T("اعتماد نهائي", "Final approval")}
                        </button>
                      )}
                      <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} disabled={busy === r.id} onClick={() => setDlg({ kind: "reject", r })}>✗ {T("رفض", "Reject")}</button>
                      {r.stage === "hr" && (
                        <button type="button" className="btn bsm" style={{ color: "var(--am)", opacity: isReady("lvReturn") ? 1 : 0.6 }} title={T("إرجاع للمدير المباشر بملاحظة", "Return to the direct manager with a note")} onClick={() => setDlg({ kind: "return", r })}>
                          ↩ {T("إرجاع للمدير", "Return to manager")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AllRequests({ reqs, emps, can, initialType, setDlg, att, onRefresh }: RowProps & { reqs: HrRequest[]; emps: EmployeeListItem[]; initialType: string; onRefresh: () => void }) {
  const { en, T, ty } = useT();
  const [fe, setFe] = useState("");
  const [ft, setFt] = useState(initialType);
  const [fs, setFs] = useState("");
  const list = reqs
    .filter((r) => (!fe || r.employee_id === fe) && (!ft || r.type === ft) && (!fs || r.status === fs))
    .sort((a, b) => String(b.from_date || b.on_date || b.created_at).localeCompare(String(a.from_date || a.on_date || a.created_at)));
  const stB: Record<string, React.ReactNode> = {
    pending: <span className="b ba">{T("معلق", "Pending")}</span>,
    approved: <span className="b bg">{T("موافق", "Approved")}</span>,
    rejected: <span className="b br">{T("مرفوض", "Rejected")}</span>,
    cancelled: <span className="b" style={{ background: "rgba(120,120,120,.18)" }}>{T("ملغاة", "Cancelled")}</span>,
  };
  const stL = (v: string) => ({ pending: T("معلق", "Pending"), approved: T("موافق", "Approved"), rejected: T("مرفوض", "Rejected"), cancelled: T("ملغاة", "Cancelled") })[v] ?? v;
  const toCell = (r: HrRequest) => (r.to_date ? fD(r.to_date) : r.type === "forgot_punch" ? (r.time_from ?? "").slice(0, 5) : detailOf(r, T).replace(fD(r.on_date), "").replace(/^ \| /, "").trim() || "—");
  const archive = reqs.filter((r) => r.attachment_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div id="lv2">
      <div className="card">
        <div className="sbar">
          <select id="LFE" value={fe} onChange={(e) => setFe(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="">{T("كل الموظفين", "All employees")}</option>
            {emps.map((e) => <option key={e.id} value={e.id}>{en ? e.name_en || e.name_ar : e.name_ar}</option>)}
          </select>
          <TypeSelect id="LFT" value={ft} onChange={setFt} />
          <select id="LFS" value={fs} onChange={(e) => setFs(e.target.value)} style={{ maxWidth: 130 }}>
            <option value="">{T("كل الحالات", "All statuses")}</option>
            {["pending", "approved", "rejected", "cancelled"].map((s) => <option key={s} value={s}>{stL(s)}</option>)}
          </select>
          <button type="button" className="btn bpl bsm" id="LV_SEARCH" title={T("تحديث / بحث", "Refresh")} onClick={onRefresh}><i className="ti ti-search" /></button>
        </div>
        <div className="tw">
          <table id="LAT">
            <tbody>
              <tr>{[T("الموظف", "Employee"), T("النوع", "Type"), T("من", "From"), T("إلى", "To"), T("الأيام", "Days"), T("الحالة", "Status"), T("إجراء", "Action")].map((h) => <th key={h}>{h}</th>)}</tr>
              {list.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{short(r.employee_name)}</td>
                  <td>{ty(r.type)}</td>
                  <td>{fD(r.from_date || r.on_date)}</td>
                  <td>{toCell(r)}</td>
                  <td>{r.days != null ? Number(r.days) : r.hours != null ? Number(r.hours) + T(" ساعة", " h") : "—"}</td>
                  <td>{stB[r.status]}{r.rejection_reason && <div style={{ fontSize: 10, color: "var(--rd)" }}>{r.rejection_reason}</div>}</td>
                  <td>
                    {att(r)}{" "}
                    {can && r.status === "approved" && (
                      <><button type="button" className="btn bsm" style={{ color: "var(--am)", opacity: isReady("lvCancel") ? 1 : 0.6 }} title={T("إلغاء الإجازة وإرجاع الرصيد", "Cancel the leave and restore the balance")} onClick={() => setDlg({ kind: "cancel", r })}><i className="ti ti-arrow-back-up" /> {T("إلغاء/استرجاع", "Cancel")}</button>{" "}</>
                    )}
                    {can && <button type="button" className="btn bsm" style={{ color: "var(--rd)", opacity: 0.8 }} title={T("حذف", "Delete")} onClick={() => setDlg({ kind: "delete", r })}><i className="ti ti-trash" /></button>}
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--mu)", padding: 22 }}>{T("لا توجد طلبات", "No requests")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {archive.length > 0 && (
        <div className="card" id="ariba117Atts" style={{ marginTop: 12 }}>
          <div className="ct" style={{ padding: "10px 12px" }}><i className="ti ti-paperclip" /> {T("أرشيف مرفقات الطلبات (كل الحالات)", "Request attachments archive (all statuses)")}</div>
          <div className="tw">
            <table>
              <tbody>
                <tr>{[T("الموظف", "Employee"), T("نوع الطلب", "Request"), T("حالة الطلب", "Status"), T("التاريخ", "Date"), ""].map((h, i) => <th key={i}>{h}</th>)}</tr>
                {archive.map((r) => (
                  <tr key={r.id}>
                    <td>{short(r.employee_name)}</td><td>{ty(r.type)}</td><td>{stL(r.status)}</td><td>{r.created_at.slice(0, 10)}</td>
                    <td style={{ whiteSpace: "nowrap" }}><button type="button" className="btn bpl bsm" onClick={() => openDocument(r.attachment_id!).catch((e) => console.error(e))}>{T("عرض", "View")}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Optional request attachment: PDF / Word / JPG / PNG, max 12 MB (stored as an employee document). */
async function attach(employeeId: string, file: File | null, T: Tr): Promise<string | null> {
  if (!file) return null;
  if (file.size > 12582912) throw new Error(T("حجم المرفق يتجاوز 12 MB", "The attachment is over 12 MB"));
  const d = await uploadDocument(employeeId, "other", file);
  return d.id;
}

/** The design's per-field «↺» undo button. */
function Undo({ on, clear, title }: { on: unknown; clear: () => void; title: string }) {
  return on ? <button type="button" className="undo-f" title={title} onClick={clear}>↺</button> : null;
}

function NewRequest({ emps, hols, bal, onDone }: { emps: EmployeeListItem[]; hols: Holiday[]; bal: BalanceRow[]; onDone: () => void }) {
  const toast = useToast();
  const { en, T, ty } = useT();
  const [type, setType] = useState("annual");
  const [empId, setEmpId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fkey, setFkey] = useState(0);
  const [busy, setBusy] = useState(false);
  const e = emps.find((x) => x.id === empId);
  const balance = bal.find((b) => b.employee_id === empId)?.current ?? 0;
  const days = from && to ? (type === "annual" ? countWorkdays(from, to, hols) : Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1) : 0;
  const dirty = !!(empId || from || to || notes || file || type !== "annual");
  const resetAll = () => { setType("annual"); setEmpId(""); setFrom(""); setTo(""); setNotes(""); setFile(null); setFkey((k) => k + 1); };
  const ut = T("تراجع عن التعديل", "Undo");

  async function submit() {
    if (!empId || !from || !to) return toast(T("يرجى تعبئة جميع الحقول", "Fill required fields"), "err");
    if (to < from) return toast(T("تاريخ النهاية قبل البداية", "The end date is before the start"), "err");
    if (type === "annual" && e && EXEMPT.has(e.category)) return toast(T("الاستشاري/التمهير/التدريب لا يستحق إجازات سنوية", "Consultants, Tamheer and trainees have no annual leave"), "err");
    if (type === "annual" && days > balance) return toast(T("يتجاوز الرصيد المتاح", "Exceeds available balance"), "err");
    setBusy(true);
    try {
      const attachment_id = await attach(empId, file, T);
      await createRequest({ employee_id: empId, type, from_date: from, to_date: to, notes: notes || null, attachment_id });
      toast("✓ " + T("تم إرسال الطلب", "Request submitted") + (attachment_id ? T(" — تم إرفاق الملف", " — file attached") : ""), "ok");
      resetAll();
      onDone();
    } catch (er) {
      toast(er instanceof Error ? er.message : String(er), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="lv3">
      <div className="card" style={{ maxWidth: 640 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 12 }} id="LTG">
          {HR_TYPES.map((k) => {
            const v = LVL[k], on = type === k;
            return (
              <div key={k} id={"lt_" + k} onClick={() => setType(k)} style={{ padding: "10px 6px", textAlign: "center", borderRadius: 10, cursor: "pointer", fontSize: 12, border: `1.5px solid ${on ? v.color : "var(--bd)"}`, background: on ? v.color + "22" : "var(--c2)", color: on ? v.color : "var(--tx)" }}>
                <i className={"ti " + v.icon} style={{ display: "block", fontSize: 18, marginBottom: 3 }} />{ty(k)}
              </div>
            );
          })}
        </div>
        <div className="fg">
          <div>
            <label>{T("الموظف *", "Employee *")}<Undo on={empId} clear={() => setEmpId("")} title={ut} /></label>
            <select id="NLE" value={empId} onChange={(ev) => setEmpId(ev.target.value)}>
              <option value="">{T("اختر...", "Choose...")}</option>
              {emps.map((x) => <option key={x.id} value={x.id}>{en ? x.name_en || x.name_ar : x.name_ar}</option>)}
            </select>
          </div>
          <div id="LBI">{e && <div className="al alb" style={{ marginTop: 0, padding: "7px 10px" }}><i className="ti ti-info-circle" /><span>{T("المتاح اليوم:", "Available today:")} <strong>{balance.toFixed(1)} {T("يوم", "days")}</strong></span></div>}</div>
          <div><label>{T("من تاريخ *", "From *")}<Undo on={from} clear={() => setFrom("")} title={ut} /></label><DateField id="NLF" value={from} onChange={(v) => setFrom(v)} /></div>
          <div><label>{T("إلى تاريخ *", "To *")}<Undo on={to} clear={() => setTo("")} title={ut} /></label><DateField id="NLT" value={to} onChange={(v) => setTo(v)} /></div>
          <div className="ff" id="LVI">
            {from && to && (type === "annual"
              ? days > balance
                ? <div className="al alr"><i className="ti ti-x" />{T(`يتجاوز الرصيد (${balance.toFixed(1)} يوم)`, `Exceeds balance (${balance.toFixed(1)} days)`)}</div>
                : <div className="al alg"><i className="ti ti-check" />{T(`أيام العمل: ${days} | سيتبقى: ${(balance - days).toFixed(1)} يوم`, `Working days: ${days} | Remaining: ${(balance - days).toFixed(1)}`)}</div>
              : <div className="al alb"><i className="ti ti-info-circle" />{T(`الأيام: ${days}`, `Days: ${days}`)}</div>)}
          </div>
          <div className="ff"><label>{T("ملاحظات", "Notes")}<Undo on={notes} clear={() => setNotes("")} title={ut} /></label><textarea id="NLN" rows={2} value={notes} onChange={(ev) => setNotes(ev.target.value)} /></div>
          <div className="ff" style={{ gridColumn: "1/-1" }}>
            <label><i className="ti ti-paperclip" /> {T("مرفق الطلب", "Request attachment")} <span style={{ color: "var(--mu)", fontWeight: 400 }}>{T("(اختياري)", "(optional)")}</span><Undo on={file} clear={() => { setFile(null); setFkey((k) => k + 1); }} title={ut} /></label>
            <input key={fkey} id="HR_NLATT" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} />
            <div style={{ fontSize: 10, color: "var(--mu)", marginTop: 4 }}>{T("المرفق اختياري — PDF / Word / JPG / PNG — حد أقصى 12 MB.", "Optional — PDF / Word / JPG / PNG — max 12 MB.")}</div>
          </div>
        </div>
        <button type="button" className="btn bpl" style={{ marginTop: 10 }} disabled={busy} onClick={submit}><i className="ti ti-send" /> <span>{T("إرسال الطلب", "Submit")}</span></button>
        <button type="button" className="btn bsm" style={{ marginInlineStart: 8 }} disabled={!dirty} onClick={resetAll}>↺ {T("تراجع عن الكل", "Undo all")}</button>
      </div>
    </div>
  );
}

function Balances({ bal, emps, can, onSaved }: { bal: BalanceRow[]; emps: EmployeeListItem[]; can: boolean; onSaved: () => void }) {
  const toast = useToast();
  const { en, T } = useT();
  const [sel, setSel] = useState("");
  const [detail, setDetail] = useState<BalanceDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const yr = new Date().getFullYear();
  const se = emps.find((x) => x.id === sel);

  useEffect(() => {
    let alive = true;
    if (sel) balanceDetail(sel).then((d) => alive && setDetail(d)).catch(() => alive && setDetail(null));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else setDetail(null);
    return () => {
      alive = false;
    };
  }, [sel, bal]);

  // the design keeps the all-employees list for printing only; the screen shows one employee in detail
  function printAll() {
    const head = ["#", T("الموظف", "Employee"), T("المرحّل من السابق", "Carry in"), T("الرصيد الحالي", "Current"), T("رصيد نهاية العام", "Year end"), T("المستحق من بداية الخدمة", "Accrued since joining"), T("المستخدم من بداية الخدمة", "Used since joining"), T("المتبقي من بداية الخدمة", "Remaining since joining"), T("نهاية الخدمة", "End of service")];
    const rows = bal.map((b, i) => [String(i + 1), b.name_ar, f2(b.carry), f2(b.current), f2(b.year_end), f2(b.accrued_since_join), f2(b.used_since_join), f2(b.remaining_since_join), f2(b.eos)]);
    printHtml(T("أرصدة الإجازات", "Leave balances"), tableHtml({ title: T("أرصدة الإجازات", "Leave balances"), headers: head, rows, sub: new Date().toLocaleDateString("en-GB"), dir: en ? "ltr" : "rtl" }));
  }

  const cur = detail?.years.find((y) => y.year === yr);
  const cards: [string, string, number, string][] = detail
    ? [
        ["الرصيد المرحل من العام السابق", "Previous Carry Forward", detail.summary.carry, "var(--cy)"],
        ["الرصيد المتاح حتى اليوم", "Available Balance Today", detail.summary.current, "var(--gr)"],
        ["رصيد نهاية العام", "Year End Balance", detail.summary.year_end, "var(--pu)"],
        ["إجمالي المستحق من بداية الخدمة", "Total Accrued Since Joining", detail.summary.accrued_since_join, "var(--bl)"],
        ["إجمالي المستخدم من بداية الخدمة", "Total Used Since Joining", detail.summary.used_since_join, "var(--rd)"],
        ["الرصيد المتبقي من بداية الخدمة", "Cumulative Remaining", detail.summary.remaining_since_join, "var(--gr)"],
        ["رصيد نهاية الخدمة المتراكم (فائض السنوات السابقة فوق حد الترحيل)", "EOS Leave Excess (previous years)", detail.accumulated_eos, "var(--am)"],
        ["الفائض المتوقع هذا العام (يضاف نهاية الخدمة)", "Expected excess this year", cur?.eos ?? 0, "var(--rd)"],
      ]
    : [];
  const eqRow = (k: string, v: string) => <tr key={k}><td style={{ textAlign: "start" }}>{k}</td><td style={{ fontWeight: 800 }}>{v}</td></tr>;

  return (
    <div id="lv4">
      <div id="LB_SYNC" style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: 10, background: "rgba(16,185,129,.12)", color: "#0a7a3f", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
        <i className="ti ti-device-mobile" /><span>{T("✓ تطبيق الموظف يقرأ نفس هذه الأرصدة من نفس الخادم مباشرة — لا تحتاج مزامنة.", "✓ The Employee App reads these same balances from the same server — no sync needed.")}</span>
      </div>
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="ch">
          <div className="ct"><i className="ti ti-user-search" /><span>{T("تفاصيل رصيد موظف", "Employee balance details")}</span></div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select id="LBE" value={sel} onChange={(ev) => setSel(ev.target.value)} style={{ minWidth: 280 }}>
              <option value="">{T("اختر الموظف", "Select employee")}</option>
              {emps.map((x) => <option key={x.id} value={x.id}>{en ? x.name_en || x.name_ar : x.name_ar}</option>)}
            </select>
            {can && <button type="button" className="btn bsm" id="LB_EDIT" onClick={() => (se ? setEditing(true) : toast(T("اختر الموظف أولاً", "Select an employee first"), "err"))}><i className="ti ti-edit" /> {T("تعديل الرصيد", "Edit balance")}</button>}
            <button type="button" className="btn bsm" id="LB_PRINT" title={T("طباعة أرصدة الإجازات", "Print all balances")} onClick={printAll}><i className="ti ti-printer" /></button>
          </div>
        </div>
        <div id="LBD">
          {!detail || !se ? (
            <div className="al alb"><i className="ti ti-user-search" />{T("اختر الموظف لعرض تفاصيل رصيده بالتفصيل.", "Select an employee to view detailed balances.")}</div>
          ) : (
            <>
              {EXEMPT.has(se.category) && <div className="al alo" style={{ marginBottom: 8 }}><i className="ti ti-info-circle" />{T("استشاري / تمهير / تدريب: لا يستحق إجازات سنوية (الرصيد صفر).", "Consultant / Tamheer / Trainee: no annual leave entitlement.")}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 8, marginBottom: 12 }}>
                {cards.map((c) => (
                  <div key={c[1]} style={{ padding: 12, border: "1px solid var(--bd)", borderRadius: 10, background: "var(--c2)" }}>
                    <div style={{ fontSize: 10, color: "var(--mu)" }}>{en ? c[1] : c[0]}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: c[3] }}>{f2(c[2])} <span style={{ fontSize: 11, fontWeight: 500 }}>{T("يوم", "days")}</span></div>
                  </div>
                ))}
              </div>
              <div className="al alb" style={{ marginBottom: 8 }}><i className="ti ti-info-circle" />{T("الاستحقاق يُحسب على أيام العمل من الأحد إلى الخميس مع استبعاد الإجازات الرسمية. السنة الكاملة = 21 يومًا، والسنة الأولى تُحسب تناسبيًا من تاريخ المباشرة. يرحل بحد أقصى 10 أيام للسنة التالية، وما زاد يبقى ضمن رصيد نهاية الخدمة.", "Accrual counts working days Sunday to Thursday, official holidays excluded. A full year is 21 days; the first year is prorated from the joining date. At most 10 days carry to the next year; the excess stays as end-of-service leave balance.")}</div>
              <div className="tw">
                <table>
                  <tbody>
                    <tr>{[T("السنة", "Year"), T("المرحل", "Carry In"), T("استحقاق السنة", "Entitlement"), T("المستخدم", "Used"), T("التعديلات", "Adjustments"), T("نهاية السنة", "Year End"), T("مرحل للعام التالي", "Carry Next"), T("فائض نهاية الخدمة", "EOS Excess")].map((t) => <th key={t}>{t}</th>)}</tr>
                    {detail.years.map((l) => (
                      <tr key={l.year}>
                        <td>{l.year}</td><td>{f2(l.opening)}</td><td>{f2(l.entitlement)}</td><td>{f2(l.used)}</td><td>{f2(l.adjustment)}</td>
                        <td style={{ fontWeight: 900 }}>{f2(l.close)}</td><td>{f2(l.carry)}</td><td style={{ fontWeight: 800, color: l.eos > 0 ? "var(--rd)" : "var(--dm)" }}>{f2(l.eos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cur && (
                <div className="card" style={{ marginTop: 12, padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>{T("معادلة الرصيد (السنة الحالية حتى اليوم)", "Balance equation (current year, as of today)")}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.9, marginBottom: 8 }} dir="ltr">Balance = Carry-in + Accrued + Adjustments − Used<br />Carry-in(Y) = min(cap, Closing(Y-1)) | Closing(Y) = Carry-in + Entitlement + Adjustments − Used</div>
                  <div className="tw">
                    <table>
                      <tbody>
                        {eqRow(T("المرحل من السنة السابقة (بعد الحد الأقصى)", "Carry-in from previous year (capped)"), f2(cur.opening))}
                        {eqRow(T("الاستحقاق السنوي بالعقد", "Annual entitlement (contract)"), f2(detail.summary.annual))}
                        {eqRow(T("المستحق حتى اليوم", "Accrued to today"), f2(detail.summary.current - cur.opening - cur.adjustment + cur.used))}
                        {eqRow(T("التعديلات اليدوية", "Manual adjustments"), f2(cur.adjustment))}
                        {eqRow(T("المستخدم هذا العام", "Used this year"), f2(cur.used))}
                        {eqRow(T("الرصيد اليوم", "Balance today"), f2(detail.summary.current))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {editing && se && <BalanceEditor emp={se} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onSaved(); }} />}
    </div>
  );
}

const EDIT_COLS: [string, string, string][] = [
  ["carry", "المرحل للسنة", "Carry In"],
  ["entitlement", "استحقاق السنة", "Entitlement"],
  ["used", "المستخدم", "Used"],
  ["adjustment", "تعديل +/-", "Adjustment +/-"],
  ["current", "الرصيد الحالي", "Current Balance"],
  ["yearEnd", "رصيد نهاية السنة", "Year-End Balance"],
  ["carryNext", "المرحل للعام التالي", "Carry Next"],
  ["eos", "فائض نهاية الخدمة", "EOS Excess"],
];

function BalanceEditor({ emp, onClose, onSaved }: { emp: EmployeeListItem; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { en, T } = useT();
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [orig, setOrig] = useState<Record<string, string>[] | null>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [busy, setBusy] = useState(false);
  // the design's leaveBalanceHistory: how many earlier saves can still be undone (Stage 12, L3)
  const [saves, setSaves] = useState(0);
  const yNow = new Date().getFullYear();

  useEffect(() => {
    let alive = true;
    balanceHistory(emp.id).then((h) => alive && setSaves(h.items.length)).catch(() => alive && setSaves(0));
    balanceDetail(emp.id).then((d) => {
      if (!alive) return;
      const r = d.years.map((l) => ({
        year: String(l.year), carry: f2(l.opening), entitlement: f2(l.entitlement), used: f2(l.used), adjustment: f2(l.adjustment),
        current: f2(l.year === yNow ? l.current ?? l.close : l.close), yearEnd: f2(l.close), carryNext: f2(l.carry), eos: f2(l.eos),
      }));
      setOrig(r);
      setRows(r);
    });
    return () => {
      alive = false;
    };
  }, [emp.id, yNow]);

  const chg = (i: number, k: string) => !!rows && !!orig && Math.abs((parseFloat(rows[i][k]) || 0) - (parseFloat(orig[i][k]) || 0)) > 0.004;
  const anyCh = !!rows && rows.some((_, i) => EDIT_COLS.some(([k]) => chg(i, k)));
  const set = (i: number, k: string, v: string) => setRows((rs) => rs && rs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  async function undoLast() {
    if (!saves || !window.confirm(T("استرجاع الأرصدة لما قبل آخر حفظ؟", "Restore the balances to before the last save?"))) return;
    setBusy(true);
    try {
      await undoBalance(emp.id);
      toast("↩ " + T("رجعت الأرصدة لما قبل آخر حفظ", "Balances restored to before the last save"), "ok");
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!rows) return;
    setBusy(true);
    try {
      await saveBalance(emp.id, {
        date,
        note,
        years: rows.map((r) => {
          const o: Record<string, number | null> = { year: Number(r.year) };
          for (const [k] of EDIT_COLS) {
            const v = parseFloat(r[k]);
            o[k] = Number.isFinite(v) ? v : null;
          }
          return o;
        }),
      });
      toast("✓ " + T("تم حفظ واستبدال أرصدة كل السنوات ومزامنتها", "Yearly leave balances saved"), "ok");
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={T("تعديل أرصدة الإجازة — ", "Edit leave balances — ") + (en ? emp.name_en || emp.name_ar : emp.name_ar)} width={1000} onClose={onClose}>
      <div className="fg" style={{ marginBottom: 10 }}>
        <div><label>{T("تاريخ التعديل", "Date")}</label><DateField id="LBMDate" value={date} onChange={(v) => setDate(v)} /></div>
        <div><label>{T("ملاحظة", "Note")}</label><input id="LBMN" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <div id="LBMY" className="tw" style={{ maxHeight: "55vh", overflow: "auto" }}>
        {!rows ? (
          <div style={{ padding: 12, color: "var(--mu)" }}>…</div>
        ) : (
          <table className="lb-edit-table">
            <tbody>
              <tr><th>{T("السنة", "Year")}</th>{EDIT_COLS.map((c) => <th key={c[0]}>{en ? c[2] : c[1]}</th>)}</tr>
              {rows.map((r, i) => (
                <tr key={r.year} data-lby={r.year}>
                  <td className="lb-year">
                    <b>{r.year}</b>
                    {EDIT_COLS.some(([k]) => chg(i, k)) && <button type="button" className="undo-f" title={T("استرجاع هذه السنة", "Restore this year")} onClick={() => setRows((rs) => rs && rs.map((x, j) => (j === i ? orig![i] : x)))}>↺</button>}
                  </td>
                  {EDIT_COLS.map(([k]) => (
                    <td key={k}>
                      <input type="number" step="0.01" value={r[k]} disabled={k === "current" && Number(r.year) !== yNow} onChange={(e) => set(i, k, e.target.value)} style={{ width: 90 }} />
                      {chg(i, k) && <button type="button" className="undo-f" title={T("استرجاع: ", "Restore: ") + orig![i][k]} onClick={() => set(i, k, orig![i][k])}>↺</button>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ padding: 8, color: "var(--mu)", fontSize: 11 }}>{T("عدّل كل سنة من سنوات الخدمة بشكل مستقل. رصيد نهاية السنة = المرحل + الاستحقاق + التعديل − المستخدم، ما لم تدخل قيمة يدوية له. يرحل بحد أقصى 10 أيام؛ وما زاد يُحفظ كرصيد نهاية خدمة.", "Edit each service year separately. Year-end = carry in + entitlement + adjustment − used unless you enter it yourself. At most 10 days carry; the excess is kept as end-of-service balance.")}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className="btn bpl" disabled={busy || !rows} onClick={save}><i className="ti ti-check" /> {busy ? "…" : T("حفظ", "Save")}</button>
        <button type="button" className="btn" onClick={onClose}>{T("إلغاء", "Cancel")}</button>
        <button type="button" className="btn bsm" disabled={!anyCh} onClick={() => { setRows(orig); setNote(""); }}>↺ {T("استرجاع الكل", "Restore all")}</button>
        <button type="button" className="btn bsm" disabled={busy || !saves} title={saves ? T(`محفوظ ${saves} من آخر 10 حفظات`, `${saves} of the last 10 saves kept`) : T("لا يوجد حفظ سابق", "No earlier save")} onClick={undoLast}>↩ {T("تراجع عن آخر حفظ", "Undo last save")}</button>
      </div>
    </Modal>
  );
}

function Holidays({ hols, can, onChange }: { hols: Holiday[]; can: boolean; onChange: () => void }) {
  const toast = useToast();
  const { en, T } = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [days, setDays] = useState("1");
  const [rec, setRec] = useState("0");
  const [del, setDel] = useState<Holiday | null>(null);

  async function save() {
    if (!name || !date) return toast(T("يرجى تعبئة الحقول", "Fill required fields"), "err");
    try {
      await addHoliday({ name_ar: name, start_date: date, days: parseInt(days) || 1, is_recurring: rec === "1" });
      setOpen(false);
      setName("");
      setDate("");
      setDays("1");
      toast("✓", "ok");
      onChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }
  // the Eids follow the Hijri calendar, so each year's dates must be entered; a missing year counts its Eid days
  // against the annual leave balance (docs/LOGIC_AUDIT.md section 4, I)
  const missingEids = useMemo(() => {
    const y = new Date().getFullYear();
    const norm = (x: string) => x.replace(/[أإآ]/g, "ا");
    const out: string[] = [];
    for (const yr of [y, y + 1])
      for (const [key, label] of [["فطر", "عيد الفطر"], ["اضحى", "عيد الأضحى"]] as const)
        if (!hols.some((h) => h.start_date.startsWith(String(yr)) && norm(h.name_ar).includes(key))) out.push(`${label} ${yr}`);
    return out;
  }, [hols]);

  async function remove(h: Holiday) {
    try {
      await deleteHoliday(h.id);
      toast(T("تم الحذف", "Deleted"), "ok");
      onChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  return (
    <div id="lv5">
      <div className="card">
        <div className="ch">
          <div className="ct"><i className="ti ti-calendar-event" /> <span>{T("الإجازات الرسمية", "Official holidays")}</span></div>
          {can && <button type="button" className="btn bpl bsm" onClick={() => setOpen(true)}><i className="ti ti-plus" /></button>}
        </div>
        {missingEids.length > 0 && (
          <div style={{ margin: "0 0 10px", padding: "8px 12px", borderRadius: 8, fontSize: 12, color: "var(--am)", border: "1px solid color-mix(in srgb, var(--am) 40%, transparent)" }}>
            <i className="ti ti-alert-triangle" aria-hidden /> {T("غير مسجّل: ", "Not entered: ")}{missingEids.join("، ")}. {T("أضف تواريخها حسب تقويم أم القرى، وإلا تنحسب أيام العيد من رصيد الإجازة السنوية.", "Add their dates (Umm al-Qura calendar), otherwise the Eid days count against the annual leave balance.")}
          </div>
        )}
        <div className="tw">
          <table id="HLT">
            <tbody>
              <tr><th>{T("الإجازة", "Holiday")}</th><th>{T("التاريخ", "Date")}</th><th>{T("الأيام", "Days")}</th><th>{T("متكررة", "Recurring")}</th><th /></tr>
              {hols.map((h) => (
                <tr key={h.id}>
                  <td style={{ fontWeight: 600 }}>{en ? h.name_en || h.name_ar : h.name_ar}</td><td>{fD(h.start_date)}</td><td>{h.days}</td><td>{h.is_recurring ? T("نعم", "Yes") : T("لا", "No")}</td>
                  <td>{can && <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => setDel(h)}><i className="ti ti-trash" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="al alb" style={{ marginTop: 10 }}><i className="ti ti-info-circle" /><span>{T("الإجازات الرسمية لا تُحسب من رصيد الإجازة السنوية", "Official holidays are not deducted from the annual leave balance")}</span></div>
      </div>
      {open && (
        <Modal title={T("إضافة إجازة رسمية", "Add an official holiday")} width={420} onClose={() => setOpen(false)}
          footer={<><button type="button" className="btn" onClick={() => setOpen(false)}>{T("إلغاء", "Cancel")}</button><button type="button" className="btn bpl" onClick={save}>{T("حفظ", "Save")}</button></>}>
          <div className="fg">
            <div><label>{T("اسم الإجازة", "Holiday name")}</label><input id="HN" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label>{T("التاريخ", "Date")}</label><DateField id="HD" value={date} onChange={(v) => setDate(v)} /></div>
            <div><label>{T("الأيام", "Days")}</label><input type="number" id="HDY" min={1} value={days} onChange={(e) => setDays(e.target.value)} /></div>
            <div><label>{T("متكررة سنوياً", "Recurring yearly")}</label><select id="HRC" value={rec} onChange={(e) => setRec(e.target.value)}><option value="0">{T("لا", "No")}</option><option value="1">{T("نعم", "Yes")}</option></select></div>
          </div>
        </Modal>
      )}
      {del && <PromptModal noInput danger title={T("حذف إجازة رسمية", "Delete official holiday")} message={T("حذف هذه الإجازة الرسمية؟", "Delete this official holiday?")} confirmText={T("حذف", "Delete")} cancelText={T("إلغاء", "Cancel")} onClose={() => setDel(null)} onConfirm={() => { const h = del; setDel(null); void remove(h); }} />}
    </div>
  );
}

function Overtime({ emps, can, reqs, setDlg, att, onDone }: RowProps & { emps: EmployeeListItem[]; reqs: HrRequest[]; onDone: () => void }) {
  const toast = useToast();
  const { en, T } = useT();
  const [emp, setEmp] = useState("");
  const [date, setDate] = useState(todayIso());
  const [hours, setHours] = useState("1");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const h = parseFloat(hours) || 0;
    if (!emp || !date || h <= 0) return toast(T("حدد الموظف والتاريخ وعدد الساعات", "Choose the employee, date and hours"), "err");
    setBusy(true);
    try {
      const attachment_id = await attach(emp, file, T);
      await createRequest({ employee_id: emp, type: "overtime", on_date: date, hours: h, notes: notes || null, attachment_id });
      setFile(null);
      setNotes("");
      toast("✓ " + T("تم إرسال طلب العمل الإضافي", "Overtime request submitted"), "ok");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }
  const stage = (r: HrRequest) => (r.status === "pending" ? (en ? STAGE[r.stage]?.[1] : STAGE[r.stage]?.[0]) ?? "" : ({ approved: T("موافق", "Approved"), rejected: T("مرفوض", "Rejected"), cancelled: T("ملغاة", "Cancelled") } as Record<string, string>)[r.status] ?? T("مكتمل", "Completed"));

  return (
    <div id="lv6">
      {can && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="ch"><div className="ct"><i className="ti ti-clock-plus" /><span>{T("طلب عمل إضافي", "Overtime request")}</span></div></div>
          <div className="fg">
            <div><label>{T("الموظف *", "Employee *")}</label><select id="HR_OT_EMP" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">{T("اختر...", "Choose...")}</option>{emps.map((e) => <option key={e.id} value={e.id}>{en ? e.name_en || e.name_ar : e.name_ar}</option>)}</select></div>
            <div><label>{T("التاريخ *", "Date *")}</label><DateField id="HR_OT_DATE" value={date} onChange={(v) => setDate(v)} /></div>
            <div><label>{T("عدد الساعات *", "Hours *")}</label><input type="number" id="HR_OT_HOURS" min={0.5} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} /></div>
            <div className="ff"><label>{T("السبب / المهمة", "Reason / task")}</label><textarea id="HR_OT_NOTES" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <div className="ff"><label>{T("مرفق اختياري", "Optional attachment")}</label><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <button type="button" className="btn bpl" style={{ marginTop: 10 }} disabled={busy} onClick={submit}><i className="ti ti-send" /> {T("إرسال الطلب", "Submit")}</button>
        </div>
      )}
      <div className="card">
        <div className="ch">
          <div className="ct"><i className="ti ti-list-check" /><span>{T("طلبات العمل الإضافي", "Overtime requests")}</span></div>
          <button type="button" className="btn bpl bsm" onClick={onDone}>{T("تحديث", "Refresh")}</button>
        </div>
        <div id="HR_OT_LIST">
          {!reqs.length && <div style={{ padding: 25, textAlign: "center", color: "var(--mu)" }}>✓ {T("لا توجد طلبات عمل إضافي", "No overtime requests")}</div>}
          {reqs.map((r) => {
            const pend = r.status === "pending" && r.stage === "hr";
            return (
              <div key={r.id} style={{ padding: "12px 14px", borderBottom: "1px solid rgba(36,48,68,.5)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{r.employee_name}</div>
                    <div style={{ fontSize: 11, color: "var(--mu)" }}>{fD(r.on_date)} | {Number(r.hours ?? 0)} {T("ساعة", "h")}{r.notes ? " | " + r.notes : ""}</div>
                    <div style={{ fontSize: 10, color: "var(--dm)" }}>{stage(r)}</div>
                  </div>
                  {can && pend && (
                    <>
                      <button type="button" className="btn bgl bsm" onClick={() => setDlg({ kind: "approve", r })}>✓ {T("موافقة", "Approve")}</button>
                      <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => setDlg({ kind: "reject", r })}>✗ {T("رفض", "Reject")}</button>
                    </>
                  )}
                </div>
                {att(r)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
