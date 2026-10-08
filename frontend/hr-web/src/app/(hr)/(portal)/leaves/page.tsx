"use client";

// Leaves (الإجازات) — port of #pg-lv: معلقة · كل الطلبات · طلب جديد · الأرصدة · الإجازات الرسمية · عمل إضافي
// (js/main/08-leaves-ui-pending-all.js, 09-leaves-ui-balances-holidays-requests.js, requests/014 secure workflow).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/hr/modal";
import { PageState } from "@/components/hr/not-built";
import { useToast } from "@/components/common/toast";
import { listAllEmployees, openDocument, uploadDocument } from "@/lib/employees";
import { ddmmyyyy, todayIso } from "@/lib/format";
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
  overrideRequest,
  rejectRequest,
  saveBalance,
  typeLabel,
  type BalanceDetail,
  type BalanceRow,
  type Holiday,
  type HrRequest,
} from "@/lib/leave";

type Tab = "lv1" | "lv2" | "lv3" | "lv4" | "lv5" | "lv6";
const fD = (d: string | null) => (d ? ddmmyyyy(d) : "—");
const f2 = (n: number) => Number(n || 0).toFixed(2);
const STAGE: Record<string, string> = { manager: "بانتظار المدير", ceo: "بانتظار الرئيس التنفيذي", hr: "معلق" };
const STB: Record<string, React.ReactNode> = {
  pending: <span className="b ba">معلق</span>,
  approved: <span className="b bg">موافق</span>,
  rejected: <span className="b br">مرفوض</span>,
  cancelled: <span className="b bk">ملغي</span>,
};
const PERM_LIKE = new Set(["permission", "maternity_permission", "early_leave", "advance"]);

function detailOf(r: HrRequest) {
  if (PERM_LIKE.has(r.type) || r.type === "overtime" || r.type === "forgot_punch")
    return `${fD(r.on_date)}${r.time_from ? " " + r.time_from.slice(0, 5) : ""}${r.hours ? ` (${Number(r.hours)} ساعة)` : ""}${r.amount ? ` — ${Number(r.amount).toLocaleString("en-US")} ر.س` : ""}`;
  return `${fD(r.from_date)} ← ${fD(r.to_date)} (${Number(r.days ?? 0)} أيام)`;
}

/** Legacy optional request attachment: PDF / Word / JPG / PNG, max 12 MB (stored as an employee document). */
async function attach(employeeId: string, file: File | null): Promise<string | null> {
  if (!file) return null;
  if (file.size > 12582912) throw new Error("حجم المرفق يتجاوز 12 MB");
  const d = await uploadDocument(employeeId, "other", file);
  return d.id;
}

function AttachField({ onFile }: { onFile: (f: File | null) => void }) {
  return (
    <div className="ff" style={{ gridColumn: "1/-1" }}>
      <label>📎 مرفق الطلب <span style={{ color: "var(--mu)", fontWeight: 400 }}>(اختياري)</span></label>
      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <div style={{ fontSize: 10, color: "var(--mu)", marginTop: 4 }}>المرفق اختياري — PDF / Word / JPG / PNG — حد أقصى 12 MB.</div>
    </div>
  );
}

export default function Page() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("lv1");
  const [emps, setEmps] = useState<EmployeeListItem[]>([]);
  const [reqs, setReqs] = useState<HrRequest[] | null>(null);
  const [hols, setHols] = useState<Holiday[]>([]);
  const [bal, setBal] = useState<BalanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
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

  const today = todayIso();
  const pending = useMemo(
    () => (reqs ?? []).filter((r) => r.status === "pending" && (r.to_date || r.on_date || today) >= today),
    [reqs, today],
  );

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast(ok, "ok");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }
  const approve = (r: HrRequest) => act(() => approveRequest(r.id), "✓ تمت الموافقة");
  const reject = (r: HrRequest) => {
    const reason = window.prompt("سبب الرفض:");
    if (reason === null) return;
    if (!reason.trim()) return toast("سبب الرفض مطلوب", "err");
    act(() => rejectRequest(r.id, reason), "تم رفض الطلب");
  };
  const onBehalf = (r: HrRequest) => {
    const reason = window.prompt("سبب الاعتماد نيابة عن المدير:");
    if (reason === null) return;
    if (!reason.trim()) return toast("السبب مطلوب", "err");
    act(() => overrideRequest(r.id, reason), "✓ تم الاعتماد نيابة");
  };
  const finalApprove = (r: HrRequest) => {
    if (!window.confirm("اعتماد نهائي لكل المراحل المتبقية؟")) return;
    act(() => finalApproveRequest(r.id), "✓ تم الاعتماد النهائي");
  };
  const remove = (r: HrRequest) => {
    if (!window.confirm(r.status === "approved" && r.type === "annual" ? "حذف الإجازة المعتمدة؟ سيرجع رصيدها للموظف." : "حذف الطلب؟")) return;
    act(() => deleteRequest(r.id), "تم حذف الطلب");
  };

  const att = (r: HrRequest) =>
    r.attachment_id ? (
      <button type="button" className="btn bsm" style={{ color: "var(--cy)" }} onClick={() => openDocument(r.attachment_id!).catch(() => toast("المرفق غير موجود", "err"))}>
        <i className="ti ti-paperclip" /> مرفق
      </button>
    ) : null;
  const actions = (r: HrRequest, compact = false) => {
    if (r.status !== "pending")
      return (
        <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => remove(r)} title="حذف">
          <i className="ti ti-trash" />
        </button>
      );
    return (
      <>
        {att(r)}{" "}
        {r.stage === "hr" ? (
          <>
            <button type="button" className="btn bgl bsm" onClick={() => approve(r)}>
              ✓{compact ? "" : " موافقة"}
            </button>{" "}
            <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => reject(r)}>
              ✗{compact ? "" : " رفض"}
            </button>
          </>
        ) : (
          <>
            <span className="b ba">{STAGE[r.stage] ?? "معلق"}</span>{" "}
            <button type="button" className="btn bsm" onClick={() => onBehalf(r)}>
              اعتماد نيابة عن المدير
            </button>{" "}
            <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => reject(r)}>
              ✗
            </button>
          </>
        )}{" "}
        <button type="button" className="btn bsm" style={{ background: "var(--gr)", color: "#fff" }} onClick={() => finalApprove(r)}>
          اعتماد نهائي
        </button>{" "}
        <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => remove(r)} title="حذف">
          <i className="ti ti-trash" />
        </button>
      </>
    );
  };

  const tabs: [Tab, React.ReactNode][] = [
    ["lv1", <>معلقة <span className="b ba" id="LVB">{pending.length}</span></>],
    ["lv2", "كل الطلبات"],
    ["lv3", "طلب جديد"],
    ["lv4", "الأرصدة"],
    ["lv5", "الإجازات الرسمية"],
    ["lv6", "⏱️ عمل إضافي"],
  ];

  return (
    <div className="pg on" id="pg-lv">
      <div className="tbar">
        {tabs.map(([k, label]) => (
          <div key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
            {label}
          </div>
        ))}
      </div>
      {!reqs ? (
        <PageState loading={!error} error={error} onRetry={reload} />
      ) : (
        <>
          {tab === "lv1" && <Pending list={pending.filter((r) => r.type !== "overtime")} actions={actions} />}
          {tab === "lv2" && <AllRequests reqs={reqs} emps={emps} actions={actions} />}
          {tab === "lv3" && <NewRequest emps={emps} hols={hols} bal={bal} onDone={reload} />}
          {tab === "lv4" && <Balances bal={bal} emps={emps} onSaved={reload} />}
          {tab === "lv5" && <Holidays hols={hols} onChange={reload} />}
          {tab === "lv6" && <Overtime emps={emps} reqs={reqs.filter((r) => r.type === "overtime")} actions={actions} onDone={reload} />}
        </>
      )}
    </div>
  );
}

function Pending({ list, actions }: { list: HrRequest[]; actions: (r: HrRequest) => React.ReactNode }) {
  return (
    <div id="lv1">
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="ch">
          <div className="ct">
            <i className="ti ti-clock" /> <span>الطلبات المعلقة</span>
          </div>
        </div>
        <div id="LVP">
          {list.length === 0 ? (
            <div style={{ color: "var(--mu)", textAlign: "center", padding: 24, fontSize: 13 }}>✓ لا توجد طلبات معلقة حالياً</div>
          ) : (
            list.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: "1px solid rgba(36,48,68,.5)", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.employee_name.split(" ").slice(0, 3).join(" ")}</div>
                  <div style={{ fontSize: 11, color: "var(--mu)" }}>
                    {typeLabel(r.type)} | {detailOf(r)}
                  </div>
                  {r.notes && <div style={{ fontSize: 11, color: "var(--dm)" }}>{r.notes}</div>}
                </div>
                <span className="b ba">معلق</span>
                {actions(r)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AllRequests({ reqs, emps, actions }: { reqs: HrRequest[]; emps: EmployeeListItem[]; actions: (r: HrRequest, compact?: boolean) => React.ReactNode }) {
  const [fe, setFe] = useState("");
  const [ft, setFt] = useState("");
  const [fs, setFs] = useState("");
  const list = reqs.filter((r) => (!fe || r.employee_id === fe) && (!ft || r.type === ft) && (!fs || r.status === fs) && r.type in LVL);
  return (
    <div id="lv2">
      <div className="card">
        <div className="sbar">
          <select id="LFE" value={fe} onChange={(e) => setFe(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="">كل الموظفين</option>
            {emps.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name_ar}
              </option>
            ))}
          </select>
          <select id="LFT" value={ft} onChange={(e) => setFt(e.target.value)} style={{ maxWidth: 150 }}>
            <option value="">كل الأنواع</option>
            {Object.entries(LVL).map(([k, v]) => (
              <option key={k} value={k}>
                {v.ar}
              </option>
            ))}
          </select>
          <select id="LFS" value={fs} onChange={(e) => setFs(e.target.value)} style={{ maxWidth: 130 }}>
            <option value="">كل الحالات</option>
            <option value="pending">معلق</option>
            <option value="approved">موافق</option>
            <option value="rejected">مرفوض</option>
          </select>
        </div>
        <div className="tw">
          <table id="LAT">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>النوع</th>
                <th>من</th>
                <th>إلى</th>
                <th>الأيام</th>
                <th>الحالة</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.employee_name.split(" ").slice(0, 3).join(" ")}</td>
                  <td>{typeLabel(r.type)}</td>
                  <td>{fD(r.from_date)}</td>
                  <td>{fD(r.to_date)}</td>
                  <td>{Number(r.days ?? 0)}</td>
                  <td>
                    {STB[r.status]}
                    {r.rejection_reason && <div style={{ fontSize: 10, color: "var(--rd)" }}>{r.rejection_reason}</div>}
                  </td>
                  <td>{actions(r, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NewRequest({ emps, hols, bal, onDone }: { emps: EmployeeListItem[]; hols: Holiday[]; bal: BalanceRow[]; onDone: () => void }) {
  const toast = useToast();
  const [type, setType] = useState("annual");
  const [empId, setEmpId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const balance = bal.find((b) => b.employee_id === empId)?.current ?? 0;
  const days = from && to ? (type === "annual" ? countWorkdays(from, to, hols) : Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1) : 0;

  async function submit() {
    if (!empId || !from || !to) return toast("يرجى تعبئة جميع الحقول", "err");
    if (type === "annual" && days > balance) return toast("يتجاوز الرصيد المتاح", "err");
    setBusy(true);
    try {
      const attachment_id = await attach(empId, file);
      await createRequest({ employee_id: empId, type, from_date: from, to_date: to, notes: notes || null, attachment_id });
      toast("✓ تم إرسال الطلب" + (attachment_id ? " — تم إرفاق الملف" : ""), "ok");
      setFile(null);
      setFrom("");
      setTo("");
      setNotes("");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="lv3">
      <div className="card" style={{ maxWidth: 640 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 12 }} id="LTG">
          {Object.entries(LVL).map(([k, v]) => (
            <div
              key={k}
              onClick={() => setType(k)}
              id={"lt_" + k}
              style={{
                background: type === k ? `${v.color}22` : "var(--c2)",
                border: `1.5px solid ${type === k ? v.color : "var(--bd)"}`,
                borderRadius: 9,
                padding: "8px 6px",
                textAlign: "center",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                color: type === k ? v.color : undefined,
              }}
            >
              <i className={"ti " + v.icon} style={{ fontSize: 18, display: "block", marginBottom: 3, color: v.color }} />
              {v.ar}
            </div>
          ))}
        </div>
        <div className="fg">
          <div>
            <label>الموظف *</label>
            <select id="NLE" value={empId} onChange={(e) => setEmpId(e.target.value)}>
              <option value="">— اختر —</option>
              {emps.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div id="LBI">
            {empId && (
              <div className="al alb" style={{ marginTop: 0, padding: "7px 10px" }}>
                <i className="ti ti-info-circle" />
                <span>
                  المتاح اليوم: <strong>{balance.toFixed(1)} يوم</strong>
                </span>
              </div>
            )}
          </div>
          <div>
            <label>من تاريخ *</label>
            <input type="date" id="NLF" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label>إلى تاريخ *</label>
            <input type="date" id="NLT" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="ff" id="LVI">
            {from && to &&
              (type === "annual" ? (
                days > balance ? (
                  <div className="al alr">
                    <i className="ti ti-x" />
                    يتجاوز الرصيد ({balance.toFixed(1)} يوم)
                  </div>
                ) : (
                  <div className="al alg">
                    <i className="ti ti-check" />
                    أيام العمل: {days} | سيتبقى: {(balance - days).toFixed(1)} يوم
                  </div>
                )
              ) : (
                <div className="al alb">
                  <i className="ti ti-info-circle" />
                  الأيام: {days}
                </div>
              ))}
          </div>
          <div className="ff">
            <label>ملاحظات</label>
            <textarea id="NLN" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <AttachField onFile={setFile} />
        </div>
        <button type="button" className="btn bpl" style={{ marginTop: 10 }} onClick={submit} disabled={busy}>
          <i className="ti ti-send" /> <span>إرسال الطلب</span>
        </button>
      </div>
    </div>
  );
}

function Balances({ bal, emps, onSaved }: { bal: BalanceRow[]; emps: EmployeeListItem[]; onSaved: () => void }) {
  const [sel, setSel] = useState("");
  const [detail, setDetail] = useState<BalanceDetail | null>(null);
  const [editFor, setEditFor] = useState<string | null>(null);
  const yr = new Date().getFullYear();

  useEffect(() => {
    let alive = true;
    if (sel) balanceDetail(sel).then((d) => alive && setDetail(d)).catch(() => alive && setDetail(null));
    return () => {
      alive = false;
    };
  }, [sel, bal]);

  const sum = bal.reduce(
    (s, b) => ({ current: s.current + b.current, yearEnd: s.yearEnd + b.year_end, accrued: s.accrued + b.accrued_since_join, used: s.used + b.used_since_join, eos: s.eos + b.eos }),
    { current: 0, yearEnd: 0, accrued: 0, used: 0, eos: 0 },
  );
  const kpis: [string, string, string][] = [
    ["عدد الموظفين", String(bal.length), "var(--bl)"],
    ["الرصيد الحالي", f2(sum.current) + " يوم", "var(--gr)"],
    ["رصيد 31/12", f2(sum.yearEnd) + " يوم", "var(--pu)"],
    ["المستحق من بداية الخدمة", f2(sum.accrued) + " يوم", "var(--cy)"],
    ["المستخدم من بداية الخدمة", f2(sum.used) + " يوم", "var(--rd)"],
    ["نهاية الخدمة المتراكم/المتوقع", f2(sum.eos) + " يوم", "var(--am)"],
  ];

  function printTable() {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = bal
      .map((b, i) => `<tr><td>${i + 1}</td><td>${b.name_ar}</td><td>${f2(b.carry)}</td><td>${f2(b.current)}</td><td>${f2(b.year_end)}</td><td>${f2(b.accrued_since_join)}</td><td>${f2(b.used_since_join)}</td><td>${f2(b.remaining_since_join)}</td><td>${f2(b.eos)}</td></tr>`)
      .join("");
    w.document.write(`<html dir="rtl"><head><title>أرصدة الإجازات</title><style>body{font-family:Tahoma,Arial;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px 6px;text-align:right}th{background:#014D3D;color:#fff}</style></head><body><h3>أرصدة الإجازات — ${new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn")}</h3><table><tr><th>#</th><th>الموظف</th><th>المرحّل من السابق</th><th>الرصيد الحالي</th><th>الرصيد 31/12/${yr}</th><th>المستحق من بداية الخدمة</th><th>المستخدم من بداية الخدمة</th><th>المتبقي من بداية الخدمة</th><th>نهاية الخدمة</th></tr>${rows}</table></body></html>`);
    w.document.close();
    w.print();
  }

  const cards: [string, number, string][] = detail
    ? [
        ["الرصيد المرحل من العام السابق", detail.summary.carry, "var(--cy)"],
        ["الرصيد المتاح حتى اليوم", detail.summary.current, "var(--gr)"],
        ["الرصيد المتوقع 31/12/" + yr, detail.summary.year_end, "var(--pu)"],
        ["إجمالي المستحق من بداية الخدمة", detail.summary.accrued_since_join, "var(--bl)"],
        ["إجمالي المستخدم من بداية الخدمة", detail.summary.used_since_join, "var(--rd)"],
        ["الرصيد المتبقي من بداية الخدمة", detail.summary.remaining_since_join, "var(--gr)"],
        ["رصيد نهاية الخدمة المتراكم", detail.accumulated_eos, "var(--am)"],
      ]
    : [];

  return (
    <div id="lv4">
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="ch">
          <div className="ct">
            <i className="ti ti-user-search" />
            <span>تفاصيل رصيد موظف</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select id="LBE" value={sel} onChange={(e) => setSel(e.target.value)} style={{ minWidth: 280 }}>
              <option value="">اختر الموظف</option>
              {emps.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name_ar}
                </option>
              ))}
            </select>
            <button type="button" className="btn bsm" onClick={() => (sel ? setEditFor(sel) : null)}>
              <i className="ti ti-edit" /> تعديل الرصيد
            </button>
            <button type="button" className="btn bsm" onClick={printTable} title="طباعة">
              <i className="ti ti-printer" />
            </button>
          </div>
        </div>
        <div id="LBD">
          {!detail ? (
            <div className="al alb">
              <i className="ti ti-user-search" />
              اختر الموظف لعرض تفاصيل رصيده بالتفصيل.
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 8, marginBottom: 12 }}>
                {cards.map((c) => (
                  <div key={c[0]} style={{ padding: 12, border: "1px solid var(--bd)", borderRadius: 10, background: "var(--c2)" }}>
                    <div style={{ fontSize: 10, color: "var(--mu)" }}>{c[0]}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: c[2] }}>
                      {f2(c[1])} <span style={{ fontSize: 11, fontWeight: 500 }}>يوم</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="al alb" style={{ marginBottom: 8 }}>
                <i className="ti ti-info-circle" />
                الاستحقاق يُحسب على أيام العمل من الأحد إلى الخميس مع استبعاد الإجازات الرسمية. السنة الكاملة = 21 يومًا، والسنة الأولى تُحسب تناسبيًا من تاريخ المباشرة. يرحل بحد أقصى 10 أيام للسنة التالية، وما زاد يبقى ضمن رصيد نهاية الخدمة.
              </div>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>السنة</th>
                      <th>المرحل</th>
                      <th>استحقاق السنة</th>
                      <th>المستخدم</th>
                      <th>التعديلات</th>
                      <th>نهاية السنة</th>
                      <th>مرحل للعام التالي</th>
                      <th>فائض نهاية الخدمة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.years.map((l) => (
                      <tr key={l.year}>
                        <td>{l.year}</td>
                        <td>{f2(l.opening)}</td>
                        <td>{f2(l.entitlement)}</td>
                        <td>{f2(l.used)}</td>
                        <td>{f2(l.adjustment)}</td>
                        <td style={{ fontWeight: 900 }}>{f2(l.close)}</td>
                        <td>{f2(l.carry)}</td>
                        <td style={{ fontWeight: 800, color: l.eos > 0 ? "var(--rd)" : "var(--dm)" }}>{f2(l.eos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="kpis" id="LBSUM" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 10 }}>
        {kpis.map(([a, b, c]) => (
          <div key={a} className="kpi" style={{ ["--ac" as string]: c }}>
            <div className="kl">{a}</div>
            <div className="kv" style={{ fontSize: 16 }}>
              {b}
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="tw">
          <table id="LBT">
            <thead>
              <tr>
                <th>#</th>
                <th>الموظف</th>
                <th>المرحّل من السابق</th>
                <th>الرصيد الحالي</th>
                <th>الرصيد 31/12/{yr}</th>
                <th>المستحق من بداية الخدمة</th>
                <th>المستخدم من بداية الخدمة</th>
                <th>المتبقي من بداية الخدمة</th>
                <th>نهاية الخدمة</th>
                <th>تعديل</th>
              </tr>
            </thead>
            <tbody>
              {bal.map((b, i) => (
                <tr key={b.employee_id}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 700 }}>{b.name_ar}</td>
                  <td style={{ color: "var(--cy)", fontWeight: 800 }}>{f2(b.carry)}</td>
                  <td style={{ color: "var(--gr)", fontWeight: 900 }}>{f2(b.current)}</td>
                  <td style={{ color: "var(--pu)", fontWeight: 900 }}>{f2(b.year_end)}</td>
                  <td>{f2(b.accrued_since_join)}</td>
                  <td style={{ color: "var(--rd)" }}>{f2(b.used_since_join)}</td>
                  <td style={{ fontWeight: 800 }}>{f2(b.remaining_since_join)}</td>
                  <td style={{ color: "var(--am)", fontWeight: 900 }}>{f2(b.eos)}</td>
                  <td>
                    <button type="button" className="btn bsm" onClick={() => setEditFor(b.employee_id)}>
                      <i className="ti ti-edit" /> تعديل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editFor && <BalanceEditor employeeId={editFor} emps={emps} onClose={() => setEditFor(null)} onSaved={() => { setEditFor(null); onSaved(); }} />}
    </div>
  );
}

const EDIT_COLS: [string, string][] = [
  ["carry", "المرحل للسنة"],
  ["entitlement", "استحقاق السنة"],
  ["used", "المستخدم"],
  ["adjustment", "تعديل +/-"],
  ["current", "الرصيد الحالي"],
  ["yearEnd", "رصيد نهاية السنة"],
  ["carryNext", "المرحل للعام التالي"],
  ["eos", "فائض نهاية الخدمة"],
];

function BalanceEditor({ employeeId, emps, onClose, onSaved }: { employeeId: string; emps: EmployeeListItem[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [emp, setEmp] = useState(employeeId);
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const yNow = new Date().getFullYear();

  useEffect(() => {
    let alive = true;
    balanceDetail(emp).then((d) => {
      if (!alive) return;
      setRows(
        d.years.map((l) => ({
          year: String(l.year),
          carry: f2(l.opening),
          entitlement: f2(l.entitlement),
          used: f2(l.used),
          adjustment: f2(l.adjustment),
          current: f2(l.year === yNow ? (l.current ?? l.close) : l.close),
          yearEnd: f2(l.close),
          carryNext: f2(l.carry),
          eos: f2(l.eos),
        })),
      );
    });
    return () => {
      alive = false;
    };
  }, [emp, yNow]);

  async function save() {
    if (!rows) return;
    try {
      await saveBalance(emp, {
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
      toast("✓ تم حفظ واستبدال أرصدة كل السنوات ومزامنتها", "ok");
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  return (
    <Modal
      title="تعديل أرصدة الإجازة — سنة بسنة"
      width={1100}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className="btn bpl" onClick={save}>
            <i className="ti ti-device-floppy" /> حفظ التعديلات
          </button>
        </>
      }
    >
      <div className="fg">
        <div className="ff">
          <label>الموظف</label>
          <select id="LBME" value={emp} onChange={(e) => setEmp(e.target.value)}>
            {emps.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name_ar}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>تاريخ التعديل</label>
          <input type="date" id="LBMDate" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="ff">
          <label>سبب / ملاحظة</label>
          <input id="LBMN" placeholder="مثال: تصحيح رصيد 2025" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="al alb" style={{ margin: "8px 0" }}>
        يمكنك تعديل كل سنة بشكل مستقل. يبدأ الترحيل التلقائي من 2024→2025؛ رصيد ما قبل 2024 فوق حد 10 أيام يدخل كسجل افتتاحي لعام 2024، ومن 2024 فصاعدًا يرحل بحد أقصى 10 أيام، وما زاد يُحفظ كرصد نهاية خدمة.
      </div>
      <div id="LBMY" className="tw" style={{ maxHeight: "55vh", overflow: "auto" }}>
        {!rows ? (
          <div style={{ padding: 12, color: "var(--mu)" }}>...</div>
        ) : (
          <table className="lb-edit-table">
            <thead>
              <tr>
                <th>السنة</th>
                {EDIT_COLS.map(([, l]) => (
                  <th key={l}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.year} data-lby={r.year}>
                  <td className="lb-year">
                    <b>{r.year}</b>
                  </td>
                  {EDIT_COLS.map(([k]) => (
                    <td key={k}>
                      <input
                        type="number"
                        step="0.01"
                        value={r[k]}
                        disabled={k === "current" && Number(r.year) !== yNow}
                        onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                        style={{ width: 90 }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

function Holidays({ hols, onChange }: { hols: Holiday[]; onChange: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [days, setDays] = useState("1");
  const [rec, setRec] = useState("0");

  async function save() {
    if (!name || !date) return toast("يرجى تعبئة الحقول", "err");
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
  async function del(h: Holiday) {
    try {
      await deleteHoliday(h.id);
      onChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  return (
    <div id="lv5">
      <div className="card">
        <div className="ch">
          <div className="ct">
            <i className="ti ti-calendar-event" /> <span>الإجازات الرسمية السعودية</span>
          </div>
          <button type="button" className="btn bpl bsm" onClick={() => setOpen(true)}>
            <i className="ti ti-plus" />
          </button>
        </div>
        <div className="tw">
          <table id="HLT">
            <thead>
              <tr>
                <th>الإجازة</th>
                <th>التاريخ</th>
                <th>الأيام</th>
                <th>متكررة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hols.map((h) => (
                <tr key={h.id}>
                  <td style={{ fontWeight: 600 }}>{h.name_ar}</td>
                  <td>{fD(h.start_date)}</td>
                  <td>{h.days}</td>
                  <td>{h.is_recurring ? "نعم" : "لا"}</td>
                  <td>
                    <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => del(h)}>
                      <i className="ti ti-trash" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="al alb" style={{ marginTop: 10 }}>
          <i className="ti ti-info-circle" />
          <span>الإجازات الرسمية لا تُحسب من رصيد الإجازة السنوية</span>
        </div>
      </div>
      {open && (
        <Modal
          title="إضافة إجازة رسمية"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                إلغاء
              </button>
              <button type="button" className="btn bpl" onClick={save}>
                حفظ
              </button>
            </>
          }
        >
          <div className="fg">
            <div className="ff">
              <label>الاسم *</label>
              <input id="HN" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label>التاريخ *</label>
              <input type="date" id="HD" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label>عدد الأيام</label>
              <input type="number" id="HDY" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <div>
              <label>متكررة سنويًا</label>
              <select id="HRC" value={rec} onChange={(e) => setRec(e.target.value)}>
                <option value="0">لا</option>
                <option value="1">نعم</option>
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Overtime({ emps, reqs, actions, onDone }: { emps: EmployeeListItem[]; reqs: HrRequest[]; actions: (r: HrRequest, compact?: boolean) => React.ReactNode; onDone: () => void }) {
  const toast = useToast();
  const [emp, setEmp] = useState("");
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("1");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function submit() {
    if (!emp || !date || !(parseFloat(hours) >= 0.5)) return toast("اختر الموظف والتاريخ وعدد الساعات (0.5 على الأقل)", "err");
    try {
      const attachment_id = await attach(emp, file);
      await createRequest({ employee_id: emp, type: "overtime", on_date: date, hours: parseFloat(hours), notes: notes || null, attachment_id });
      setFile(null);
      toast("✓ تم إرسال طلب العمل الإضافي", "ok");
      setDate("");
      setHours("1");
      setNotes("");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  return (
    <div id="lv6">
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="ch">
          <div className="ct">
            <i className="ti ti-clock-plus" />
            <span>طلب عمل إضافي</span>
          </div>
        </div>
        <div className="fg">
          <div>
            <label>الموظف *</label>
            <select id="HR_OT_EMP" value={emp} onChange={(e) => setEmp(e.target.value)}>
              <option value="">— اختر —</option>
              {emps.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>التاريخ *</label>
            <input type="date" id="HR_OT_DATE" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label>عدد الساعات *</label>
            <input type="number" id="HR_OT_HOURS" min={0.5} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
          <div className="ff">
            <label>السبب / المهمة</label>
            <textarea id="HR_OT_NOTES" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="ff">
            <label>مرفق اختياري</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <button type="button" className="btn bpl" style={{ marginTop: 10 }} onClick={submit}>
          <i className="ti ti-send" /> إرسال الطلب
        </button>
      </div>
      <div className="card">
        <div className="ch">
          <div className="ct">
            <i className="ti ti-list-check" />
            <span>طلبات العمل الإضافي</span>
          </div>
          <button type="button" className="btn bpl bsm" onClick={onDone}>
            تحديث
          </button>
        </div>
        <div id="HR_OT_LIST">
          {reqs.length === 0 ? (
            <div style={{ color: "var(--mu)", textAlign: "center", padding: 18 }}>لا توجد طلبات عمل إضافي</div>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>التاريخ</th>
                    <th>الساعات</th>
                    <th>السبب</th>
                    <th>الحالة</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {reqs.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.employee_name}</td>
                      <td>{fD(r.on_date)}</td>
                      <td>{Number(r.hours ?? 0)}</td>
                      <td>{r.notes ?? ""}</td>
                      <td>{STB[r.status]}</td>
                      <td>{actions(r, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
