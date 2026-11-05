"use client";

// The updated design's targets and evaluation pages (its pages/goals/index.jsx, goals/TargetsEditor.jsx,
// goals/EvalForm.jsx, goals/PeriodPick.jsx) on OUR Stage 3 routes. HR adds, edits and deletes targets (never its own);
// HR approves submitted evaluations when HR is the configured approver (the default), and since Stage 15 writes them
// too (owner, 4 Nov 2026): HR's evaluation is final at once, with no approval after HR, and never its own. Refusals of
// the API are shown as they come (an unknown or unseen evaluation is «not found»).
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/common/toast";
import { PageState } from "@/components/hr/not-built";
import { PromptModal } from "@/components/hr/prompt-modal";
import { ApiError, type EmployeeListItem } from "@/lib/api";
import { listAllEmployees } from "@/lib/employees";
import { approveEvaluation, curKey, deleteTarget, getEvaluation, keyLabel, listTargets, MONTHS, pct, PT, ratingOf, saveEvaluation, saveTarget, type Evaluation, type PeriodType, type Target } from "@/lib/goals";

function PeriodPick({ type, keyv, onChange }: { type: PeriodType; keyv: string; onChange: (t: PeriodType, k: string) => void }) {
  const y = keyv.slice(0, 4);
  const now = new Date().getFullYear();
  const yrs: string[] = [];
  for (let i = now - 2; i <= now + 1; i++) yrs.push(String(i));
  const changeType = (t: PeriodType) => onChange(t, y === String(now) ? curKey(t) : t === "annual" ? y : t === "quarterly" ? y + "-Q1" : y + "-01");
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <select id="PP_TYPE" value={type} onChange={(e) => changeType(e.target.value as PeriodType)} style={{ minWidth: 90 }}>{(Object.keys(PT) as PeriodType[]).map((k) => <option key={k} value={k}>{PT[k]}</option>)}</select>
      <select id="PP_YEAR" value={y} onChange={(e) => onChange(type, type === "annual" ? e.target.value : e.target.value + keyv.slice(4))} style={{ minWidth: 90 }}>{yrs.map((v) => <option key={v}>{v}</option>)}</select>
      {type === "quarterly" && <select id="PP_Q" value={keyv.slice(-1)} onChange={(e) => onChange(type, y + "-Q" + e.target.value)} style={{ minWidth: 90 }}>{[1, 2, 3, 4].map((q) => <option key={q} value={q}>الربع {q}</option>)}</select>}
      {type === "monthly" && <select id="PP_M" value={keyv.slice(5)} onChange={(e) => onChange(type, y + "-" + e.target.value)} style={{ minWidth: 90 }}>{MONTHS.map((m, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{m}</option>)}</select>}
    </div>
  );
}

const bar = (p: number) => (
  <div style={{ height: 7, background: "rgba(120,140,160,.25)", borderRadius: 5, overflow: "hidden", minWidth: 80 }}>
    <div style={{ width: p + "%", height: "100%", background: p >= 90 ? "#16a34a" : p >= 60 ? "#d99a00" : "#dc2626" }} />
  </div>
);
type Form = { id?: string; title: string; description: string; unit: string; target_value: string; actual_value: string; weight: string; status?: "active" | "done" };
const blank: Form = { title: "", description: "", unit: "", target_value: "", actual_value: "", weight: "1" };
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

function TargetsEditor({ employee, type, keyv, onPeriod }: { employee: EmployeeListItem; type: PeriodType; keyv: string; onPeriod: (t: PeriodType, k: string) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Target[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Target | null>(null);
  const year = keyv.slice(0, 4);
  const load = useCallback(() => {
    listTargets(employee.id, year).then(setRows).catch((e) => { setRows([]); toast(err(e), "err"); });
  }, [employee.id, year, toast]);
  useEffect(() => load(), [load]);
  const shown = (rows ?? []).filter((t) => t.period_type === type && t.period_key === keyv);
  const others = (rows ?? []).filter((t) => !(t.period_type === type && t.period_key === keyv));
  const num = (v: string) => (v === "" ? null : Number(v));
  async function save() {
    if (!form) return;
    if (!form.title.trim()) return toast("اكتب عنوان المستهدف", "err");
    setBusy(true);
    try {
      await saveTarget({ id: form.id, employee_id: employee.id, period_type: type, period_key: keyv, title: form.title.trim(), description: form.description || null, unit: form.unit || null, target_value: num(form.target_value), actual_value: num(form.actual_value), weight: Number(form.weight) || 1, status: form.status });
      toast("✓ حُفظ المستهدف" + (form.id ? "" : " وأُشعر الموظف"), "ok");
      setForm(null);
      load();
    } catch (e) {
      toast(err(e) || "تعذر الحفظ", "err");
    } finally {
      setBusy(false);
    }
  }
  async function remove(t: Target) {
    try {
      await deleteTarget(t.id);
      load();
    } catch (e) {
      toast(err(e), "err");
    }
  }
  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => p && { ...p, [k]: e.target.value });
  return (
    <div id="TG_BOX">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <PeriodPick type={type} keyv={keyv} onChange={onPeriod} />
        <button type="button" className="btn bpl bsm" id="TG_ADD" style={{ marginInlineStart: "auto" }} onClick={() => setForm({ ...blank })}>+ مستهدف جديد</button>
      </div>
      {rows === null && <div style={{ color: "var(--mu)", padding: 14 }}>…</div>}
      {rows && !shown.length && <div style={{ color: "var(--mu)", textAlign: "center", padding: 18, fontSize: 13 }}>لا مستهدفات ({PT[type]} — {keyLabel(type, keyv)}) لـ {employee.name_ar}</div>}
      {shown.map((t) => {
        const p = pct(t);
        return (
          <div key={t.id} className="tg-row" style={{ padding: "10px 0", borderBottom: "1px solid var(--bd)" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <b style={{ fontSize: 13 }}>{t.title}</b>{t.status === "done" && <span className="b bg" style={{ marginInlineStart: 6 }}>منجز</span>}
                <div style={{ fontSize: 11, color: "var(--mu)" }}>{t.description}</div>
                <div style={{ fontSize: 11, color: "var(--mu)" }}>المطلوب: {t.target_value ?? "—"} {t.unit || ""} · المنجز: {t.actual_value ?? 0} · الوزن {t.weight}</div>
              </div>
              <div style={{ width: 120 }}>{p != null && <><div style={{ fontSize: 11, textAlign: "center" }}>{p}%</div>{bar(p)}</>}</div>
              <button type="button" className="btn bsm" onClick={() => setForm({ id: t.id, title: t.title, description: t.description ?? "", unit: t.unit ?? "", target_value: t.target_value == null ? "" : String(t.target_value), actual_value: t.actual_value == null ? "" : String(t.actual_value), weight: String(t.weight), status: t.status })}>تعديل</button>
              <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => setDel(t)}>حذف</button>
            </div>
          </div>
        );
      })}
      {others.length > 0 && <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 8 }}>مستهدفات أخرى هذا العام: {others.length} (غيّر الفترة لعرضها)</div>}
      {form && (
        <div style={{ marginTop: 12, border: "1px solid var(--bd)", borderRadius: 10, padding: 12, background: "var(--c2)" }} id="TG_FORM">
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>{form.id ? "تعديل مستهدف" : "مستهدف جديد"} — {PT[type]} {keyLabel(type, keyv)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ gridColumn: "1/-1" }}><label>العنوان *</label><input id="TG_TITLE" value={form.title} onChange={f("title")} style={{ width: "100%" }} /></div>
            <div style={{ gridColumn: "1/-1" }}><label>الوصف</label><input value={form.description} onChange={f("description")} style={{ width: "100%" }} /></div>
            <div><label>القيمة المستهدفة</label><input id="TG_TARGET" type="number" step="any" value={form.target_value} onChange={f("target_value")} style={{ width: "100%" }} /></div>
            <div><label>الوحدة (عميل، ريال، %…)</label><input value={form.unit} onChange={f("unit")} style={{ width: "100%" }} /></div>
            <div><label>المنجز حتى الآن</label><input type="number" step="any" value={form.actual_value} onChange={f("actual_value")} style={{ width: "100%" }} /></div>
            <div><label>الوزن (الأهمية)</label><input type="number" min="0.1" step="0.1" value={form.weight} onChange={f("weight")} style={{ width: "100%" }} /></div>
            {form.id && <div><label>الحالة</label><select value={form.status ?? "active"} onChange={f("status")} style={{ width: "100%" }}><option value="active">نشط</option><option value="done">منجز</option></select></div>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="btn bpl" id="TG_SAVE" disabled={busy} onClick={save}>حفظ</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>إلغاء</button>
          </div>
        </div>
      )}
      {del && <PromptModal noInput danger title="حذف المستهدف" message={"حذف المستهدف «" + del.title + "»؟ يصل الموظف إشعار بالحذف."} confirmText="حذف" onClose={() => setDel(null)} onConfirm={() => { const t = del; setDel(null); void remove(t); }} />}
    </div>
  );
}

const SB: Record<Evaluation["status"], [string, string]> = { draft: ["ba", "مسودة"], pending: ["bb", "بانتظار الاعتماد"], approved: ["bg", "معتمد"] };

/** Stage 15: the evaluation form HR fills (the design's EvalForm) — seeded from the saved evaluation or the period's targets. */
type Row = { target_id?: string; title: string; target?: number | null; unit?: string; actual?: number | null; weight: string; score: string; comment: string };
const seedRows = (ev: Evaluation | null, targets: Target[]): Row[] =>
  ev && ev.items.length
    ? ev.items.map((it) => ({ target_id: it.target_id, title: it.title, target: it.target, unit: it.unit, actual: it.actual, weight: String(it.weight ?? 1), score: String(it.score ?? 0), comment: it.comment || "" }))
    : targets.map((t) => ({ target_id: t.id, title: t.title, target: t.target_value, unit: t.unit || "", actual: t.actual_value, weight: String(t.weight || 1), score: String(Math.min(100, pct(t) ?? 0)), comment: "" }));

function EvalForm({ ev, targets, busy, onSave }: { ev: Evaluation | null; targets: Target[]; busy: boolean; onSave: (rows: Row[], comments: string, submit: boolean) => void }) {
  const [rows, setRows] = useState<Row[]>(() => seedRows(ev, targets));
  const [comments, setComments] = useState(ev?.comments || "");
  const [ask, setAsk] = useState(false);
  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const total = rows.reduce((s, r) => s + (Number(r.weight) || 1), 0);
  const overall = total ? Math.round((rows.reduce((s, r) => s + (Number(r.score) || 0) * (Number(r.weight) || 1), 0) / total) * 10) / 10 : 0;
  return (
    <div id="EV_FORM" style={{ marginTop: 10 }}>
      {rows.map((r, i) => (
        <div key={i} className="ev-item" style={{ border: "1px solid var(--bd)", borderRadius: 10, padding: 10, marginBottom: 8, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {r.target_id ? <b style={{ flex: 1, minWidth: 160, fontSize: 13 }}>{r.title}</b>
              : <input style={{ flex: 1, minWidth: 160 }} placeholder="عنوان البند" value={r.title} onChange={(e) => set(i, "title", e.target.value)} />}
            {r.target_id && <span style={{ fontSize: 11, color: "var(--mu)" }}>المطلوب {r.target ?? "—"} {r.unit} · المنجز {r.actual ?? 0}</span>}
            <label style={{ fontSize: 11 }}>الدرجة % <input type="number" min={0} max={100} value={r.score} onChange={(e) => set(i, "score", e.target.value)} style={{ width: 70 }} /></label>
            <label style={{ fontSize: 11 }}>الوزن <input type="number" min={0} value={r.weight} onChange={(e) => set(i, "weight", e.target.value)} style={{ width: 60 }} /></label>
            {!r.target_id && <button type="button" className="btn bsm" style={{ color: "var(--rd)" }} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>✕</button>}
          </div>
          <input placeholder="ملاحظة على البند (اختياري)" value={r.comment} onChange={(e) => set(i, "comment", e.target.value)} />
        </div>
      ))}
      <button type="button" className="btn bsm" onClick={() => setRows((rs) => [...rs, { title: "", weight: "1", score: "0", comment: "" }])}>+ بند جديد</button>
      <div style={{ marginTop: 10 }}><label>ملاحظات عامة</label><textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} style={{ width: "100%" }} /></div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12 }}>النتيجة: <b style={{ color: "var(--gr)" }}>{overall}%</b> <span className="b bg">{ratingOf(overall)}</span></span>
        <button type="button" className="btn" disabled={busy || !rows.length} onClick={() => onSave(rows, comments, false)}>حفظ كمسودة</button>
        <button type="button" className="btn bpl" id="EV_HR_FINAL" disabled={busy || !rows.length} onClick={() => setAsk(true)}>✓ اعتماد نهائي وإبلاغ الموظف</button>
        <span style={{ fontSize: 11, color: "var(--mu)" }}>تقييم الموارد البشرية نهائي فور اعتماده — لا يحتاج موافقة بعدها.</span>
      </div>
      {ask && <PromptModal noInput title="اعتماد التقييم" message="اعتماد هذا التقييم نهائياً؟ يصل الموظف إشعار بالنتيجة ولا يمكن تعديله بعدها." confirmText="اعتماد" onClose={() => setAsk(false)} onConfirm={() => { setAsk(false); onSave(rows, comments, true); }} />}
    </div>
  );
}

function EvalView({ employee, type, keyv, onPeriod }: { employee: EmployeeListItem; type: PeriodType; keyv: string; onPeriod: (t: PeriodType, k: string) => void }) {
  const toast = useToast();
  const [d, setD] = useState<{ evaluation: Evaluation | null; targets: Target[]; can_approve: boolean; can_write?: boolean } | { missing: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const load = useCallback(() => {
    getEvaluation(employee.id, type, keyv)
      .then(setD)
      .catch((e) => setD({ missing: e instanceof ApiError && e.status === 404 ? "لا يوجد تقييم معتمد أو مرسل للاعتماد لهذه الفترة." : err(e) }));
  }, [employee.id, type, keyv]);
  useEffect(() => load(), [load]);
  async function approve() {
    setAsk(false);
    if (!d || "missing" in d || !d.evaluation) return;
    setBusy(true);
    try {
      await approveEvaluation(d.evaluation.id);
      toast("✅ اعتُمد التقييم وأُرسلت النتيجة للموظف", "ok");
      load();
    } catch (e) {
      toast(err(e) || "تعذر الاعتماد", "err");
    } finally {
      setBusy(false);
    }
  }
  async function hrSave(rows: Row[], comments: string, submit: boolean) {
    setBusy(true);
    try {
      await saveEvaluation(employee.id, type, keyv, {
        items: rows.map((r) => ({ target_id: r.target_id, title: r.title.trim(), target: r.target, unit: r.unit, actual: r.actual, weight: Number(r.weight) || 1, score: Number(r.score) || 0, comment: r.comment.trim() })),
        comments: comments.trim(),
        submit,
      });
      toast(submit ? "✅ اعتُمد التقييم وأُرسلت النتيجة للموظف" : "✓ حُفظ التقييم كمسودة", "ok");
      load();
    } catch (e) {
      toast(err(e) || "تعذر الحفظ", "err");
    } finally {
      setBusy(false);
    }
  }
  const writer = !!d && !("missing" in d) && !!d.can_write && d.evaluation?.status !== "approved";
  return (
    <div id="EV_BOX">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <PeriodPick type={type} keyv={keyv} onChange={onPeriod} />
        {d && !("missing" in d) && d.evaluation && <span className={"b " + SB[d.evaluation.status][0]}>{SB[d.evaluation.status][1]}</span>}
        {d && !("missing" in d) && d.evaluation?.overall != null && (
          <span style={{ marginInlineStart: "auto", fontSize: 12 }}>النتيجة الإجمالية: <b id="EV_OVERALL" style={{ fontSize: 16, color: "var(--gr)" }}>{d.evaluation.overall}%</b> <span className="b bg">{ratingOf(d.evaluation.overall)}</span></span>
        )}
      </div>
      {!d && <div style={{ color: "var(--mu)", padding: 14 }}>…</div>}
      {d && "missing" in d && <div className="al alb">{d.missing}</div>}
      {d && !("missing" in d) && !d.evaluation && !writer && <div className="al alb">لا يوجد تقييم لهذه الفترة {PT[type]} {keyLabel(type, keyv)} بعد — يكتبه المدير المباشر من تطبيقه ثم يرسله للاعتماد.</div>}
      {writer && !("missing" in d!) && <EvalForm key={(d.evaluation?.id ?? "new") + type + keyv} ev={d.evaluation} targets={d.targets} busy={busy} onSave={(r, c, s) => void hrSave(r, c, s)} />}
      {d && !("missing" in d) && d.evaluation && !writer && (
        <>
          {d.evaluation.items.map((it, i) => (
            <div key={i} className="ev-item" style={{ border: "1px solid var(--bd)", borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ flex: 1, minWidth: 160, fontSize: 13 }}>{it.title}</b>
                {it.target_id && <span style={{ fontSize: 11, color: "var(--mu)" }}>المطلوب {it.target ?? "—"} {it.unit} · المنجز {it.actual ?? 0}</span>}
                <span style={{ fontSize: 11 }}>الدرجة <b>{it.score}%</b></span>
                <span style={{ fontSize: 11 }}>الوزن <b>{it.weight}</b></span>
              </div>
              {it.comment && <div style={{ fontSize: 11.5, color: "var(--mu)", marginTop: 6 }}>{it.comment}</div>}
            </div>
          ))}
          {d.evaluation.comments && <div style={{ marginTop: 10 }}><label>ملاحظات عامة</label><div style={{ fontSize: 12.5, padding: 8, border: "1px solid var(--bd)", borderRadius: 8 }}>{d.evaluation.comments}</div></div>}
          {d.evaluation.status === "pending" && d.can_approve && (
            <button type="button" className="btn bgl" id="EV_APPROVE" style={{ marginTop: 10 }} disabled={busy} onClick={() => setAsk(true)}>✓ اعتماد نهائي وإبلاغ الموظف</button>
          )}
          {d.evaluation.status === "approved" && <div className="al alg" style={{ marginTop: 10 }}>التقييم معتمد ومُبلَّغ للموظف.</div>}
        </>
      )}
      {ask && <PromptModal noInput title="اعتماد التقييم" message="اعتماد التقييم نهائياً؟ سيصل الموظف إشعار بالنتيجة." confirmText="اعتماد" onClose={() => setAsk(false)} onConfirm={() => void approve()} />}
    </div>
  );
}

/** The design's Picker: one employee, one period; mode "goals" edits targets, mode "eval" shows the evaluation. */
export function GoalsPage({ mode }: { mode: "goals" | "eval" }) {
  const [emps, setEmps] = useState<EmployeeListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eid, setEid] = useState("");
  const [type, setType] = useState<PeriodType>("quarterly");
  const [key, setKey] = useState(() => curKey("quarterly"));
  useEffect(() => {
    listAllEmployees({ tab: "active", sort: "name_ar" }).then((p) => setEmps(p.items)).catch((e) => setError(err(e)));
  }, []);
  const emp = emps?.find((e) => e.id === eid);
  const onPeriod = (t: PeriodType, k: string) => { setType(t); setKey(k); };
  const id = mode === "eval" ? "pg-eval" : "pg-goals";
  if (!emps) return <div className="pg on" id={id}><PageState loading={!error} error={error} /></div>;
  return (
    <div className="pg on" id={id}>
      <div className="card">
        <div className="ch">
          <div className="ct"><i className={"ti " + (mode === "eval" ? "ti-star" : "ti-target")} /> <span>{mode === "eval" ? "تقييم الموظفين" : "مستهدفات الموظفين"}</span></div>
          <select id="GP_EMP" value={eid} onChange={(e) => setEid(e.target.value)} style={{ minWidth: 260 }}>
            <option value="">اختر الموظف…</option>
            {emps.map((e) => <option key={e.id} value={e.id}>{e.name_ar} — {e.job_title || e.workplace?.name_ar || ""}</option>)}
          </select>
        </div>
        <div style={{ padding: 14 }}>
          {!emp && <div style={{ color: "var(--mu)", textAlign: "center", padding: 24 }}>{mode === "eval" ? "اختر موظفاً لعرض تقييمه للفترة." : "اختر موظفاً لعرض مستهدفاته أو إضافة مستهدفات (سنوية / ربع سنوية / شهرية)."}</div>}
          {emp && mode === "goals" && <TargetsEditor key={emp.id} employee={emp} type={type} keyv={key} onPeriod={onPeriod} />}
          {emp && mode === "eval" && <EvalView key={emp.id + type + key} employee={emp} type={type} keyv={key} onPeriod={onPeriod} />}
        </div>
      </div>
    </div>
  );
}
