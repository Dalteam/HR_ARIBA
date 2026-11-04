"use client";

// Attendance (الحضور والانصراف) in the updated design's form (its pages/attendance/index.jsx): the day's KPI cards and
// record list (refreshed every 30 s, add / edit for HR and admin only), the monthly report, then the report builder.
// Days are classified by OUR engine (lib/calc/att-reports.ts) from OUR /attendance routes. Kept from ours: the
// forgot-punch notice, and editing each session of a multi-session day on its own (our API stores sessions, the
// design rewrites the whole day). Changed on purpose: «غائب» counts only staff with no record, no leave and not
// remote (the design subtracts present and late only, so remote and leave staff counted as absent).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/hr/modal";
import { AttendanceReports } from "@/components/hr/attendance-reports";
import { ForgotPunchNotice } from "@/components/hr/forgot-punch-notice";
import { PageState } from "@/components/hr/not-built";
import { useToast } from "@/components/common/toast";
import { useAuth } from "@/lib/auth-context";
import { listAllEmployees } from "@/lib/employees";
import { useLocale } from "@/lib/i18n/locale";
import { listLocations } from "@/lib/locations";
import { listHolidays, listRequests } from "@/lib/leave";
import { getAttendanceSettings, type AttendanceSettings } from "@/lib/settings";
import { todayIso } from "@/lib/format";
import { listAttendance, listAttendanceRange, upsertAttendance, updateAttendance, type AttendanceRecord, type AttendanceStatus } from "@/lib/attendance";
import { computeReport, fmtHM, groupRows, hm, ST_AR, ST_EN, ymd, type Sum } from "@/lib/calc/att-reports";
import type { EmployeeListItem } from "@/lib/api";
import { DateField, TimeField } from "@/components/common/date-time-field";

type E = EmployeeListItem;
const shortName = (s: string) => s.split(" ").slice(0, 3).join(" ");
const Kpi = ({ l, v, s, c }: { l: string; v: number; s?: string; c: string }) => (
  <div className="kpi" style={{ "--ac": c } as React.CSSProperties}><div className="kl">{l}</div><div className="kv">{v}</div>{s && <div className="ks">{s}</div>}</div>
);

type Form = { id: string | null; empId: string; date: string; timeIn: string; timeOut: string; locId: string; status: AttendanceStatus };

function AttModal({ rec, emps, locs, T, onClose, onSaved }: { rec: Form; emps: E[]; locs: { id: string; name: string }[]; T: (a: string, b: string) => string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Form>(rec);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.empId || !f.date) return toast(T("اختر الموظف والتاريخ", "Pick employee and date"), "err");
    const times = { time_in: f.timeIn || null, time_out: f.timeOut || null, location_id: f.locId || null, status: f.status };
    try {
      if (f.id) await updateAttendance(f.id, { ...times, date: f.date });
      else await upsertAttendance({ employee_id: f.empId, work_date: f.date, ...times });
      toast("✓ " + T("تم حفظ سجل الحضور", "Attendance saved"), "ok");
      onSaved();
    } catch (e) {
      toast(T("تعذر حفظ الحضور: ", "Could not save attendance: ") + (e instanceof Error ? e.message : String(e)), "err");
    }
  }
  return (
    <Modal title={T("تسجيل/تعديل حضور", "Record / edit attendance")} width={480} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button type="button" className="btn bpl" id="AT_SAVE" onClick={save}>{T("حفظ", "Save")}</button></>}>
      <div className="fg">
        <div><label>{T("الموظف", "Employee")}</label><select id="AES" value={f.empId} disabled={!!f.id} onChange={(e) => set("empId")(e.target.value)}><option value="">—</option>{emps.map((e) => <option key={e.id} value={e.id}>{e.name_ar || e.name_en}</option>)}</select></div>
        <div><label>{T("التاريخ", "Date")}</label><DateField value={f.date} onChange={set("date")} /></div>
        <div><label>{T("وقت الحضور", "Check-in")}</label><TimeField value={f.timeIn} onChange={set("timeIn")} /></div>
        <div><label>{T("وقت الانصراف", "Check-out")}</label><TimeField value={f.timeOut} onChange={set("timeOut")} /></div>
        <div><label>{T("الموقع", "Location")}</label><select id="AML" value={f.locId} onChange={(e) => set("locId")(e.target.value)}><option value="">—</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div><label>{T("الحالة", "Status")}</label><select id="AMS" value={f.status} onChange={(e) => set("status")(e.target.value as AttendanceStatus)}>{(["present", "late", "absent", "leave", "remote"] as const).map((k) => <option key={k} value={k}>{ST_AR[k]} / {ST_EN[k]}</option>)}</select></div>
      </div>
    </Modal>
  );
}

function Daily({ T, en, emps, locs, can }: { T: (a: string, b: string) => string; en: boolean; emps: E[]; locs: { id: string; name: string }[]; can: boolean }) {
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [modal, setModal] = useState<Form | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      setRows(await listAttendance(date));
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [date]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);
  const grp = useMemo(() => groupRows(rows), [rows]);
  const sessions = useMemo(() => {
    const m = new Map<string, AttendanceRecord[]>();
    rows.forEach((r) => m.set(r.employee_id, [...(m.get(r.employee_id) ?? []), r]));
    return m;
  }, [rows]);
  const ST: Record<string, [string, string]> = { present: ["bg", T("حاضر", "Present")], late: ["ba", T("متأخر", "Late")], absent: ["br", T("غائب", "Absent")], leave: ["bp", T("إجازة", "Leave")], remote: ["bc", T("عن بعد", "Remote")] };
  const recs = emps.map((e) => grp.get(e.id + "|" + date)).filter((g): g is NonNullable<typeof g> => !!g);
  const pres = recs.filter((g) => g.status === "present" || g.status === "late").length, late = recs.filter((g) => g.status === "late").length, remote = recs.filter((g) => g.status === "remote").length;
  const absent = Math.max(0, emps.length - pres - remote - recs.filter((g) => g.status === "leave").length);
  const blank = (): Form => ({ id: null, empId: "", date, timeIn: "", timeOut: "", locId: "", status: "present" });
  const edit = (r: AttendanceRecord): Form => ({ id: r.id, empId: r.employee_id, date: r.work_date, timeIn: r.time_in ?? "", timeOut: r.time_out ?? "", locId: r.location_id ?? "", status: r.status });
  const arrow = en ? " → " : " ← ";
  return (
    <>
      <div className="kr" id="ATK">
        <Kpi l={T("حاضر اليوم", "Present Today")} v={pres} s={T("من ", "of ") + emps.length} c="var(--gr)" />
        <Kpi l={T("متأخر", "Late")} v={late} c="var(--am)" />
        <Kpi l={T("عمل عن بعد", "Remote")} v={remote} c="var(--cy)" />
        <Kpi l={T("غائب", "Absent")} v={absent} c="var(--rd)" />
      </div>
      <div className="card">
        <div className="ch">
          <div className="ct"><i className="ti ti-map-pin" /> <span>{T("سجل الحضور", "Attendance log")}</span></div>
          <div style={{ display: "flex", gap: 5 }}>
            <DateField value={date} onChange={(v) => setDate(v)} style={{ maxWidth: 155 }} />
            {can && <button type="button" className="btn bpl bsm" id="AT_ADD" title={T("تسجيل حضور", "Record attendance")} onClick={() => setModal(blank())}><i className="ti ti-plus" /></button>}
          </div>
        </div>
        {err && <div style={{ padding: 12, color: "var(--rd)" }}>{err}</div>}
        <div id="ATL" style={{ maxHeight: 380, overflowY: "auto" }}>
          {emps.length === 0 && <div style={{ textAlign: "center", color: "var(--mu)", padding: 20 }}>{T("لا يوجد موظفون", "No employees")}</div>}
          {emps.map((e) => {
            const g = grp.get(e.id + "|" + date), ss = sessions.get(e.id) ?? [];
            const st = g ? ST[g.status] || ST.present : null;
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(36,48,68,.4)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(en ? e.name_en || e.name_ar : e.name_ar)}</div>
                  <div style={{ fontSize: 10, color: "var(--dm)" }}>{(g && g.loc) || (en ? e.workplace?.name_en || e.workplace?.name_ar : e.workplace?.name_ar) || ""}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--mu)" }}>{g ? hm(g.in) + arrow + (g.out ? hm(g.out) : "…") + (g.sessions > 1 ? "  (×" + g.sessions + ")" : "") : "—"}</div>
                  {g && g.status === "late" && g.late > 0 && <div style={{ fontSize: 10, color: "var(--am)" }}>⏰ {T("تأخير ", "Late ")}{fmtHM(g.late, en)}</div>}
                  {g && g.early > 0 && <div style={{ fontSize: 10, color: "var(--rd)" }}>🚪 {T("خروج مبكر ", "Early exit ")}{fmtHM(g.early, en)}</div>}
                  {g && g.periods.length > 1 && <div style={{ fontSize: 10, color: "var(--cy)" }}>{g.periods.map((p) => p.in + (en ? "→" : "←") + (p.out || "…")).join(" ، ")}</div>}
                  {g && g.hours > 0 && <div style={{ fontSize: 10, color: "var(--mu)" }}>⏱ {g.hours}{T(" ساعة", " h")}</div>}
                  {can && ss.length > 1 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                      {ss.map((s, i) => <button key={s.id} type="button" className="btn bsm" title={T("تعديل الجلسة ", "Edit session ") + (i + 1)} onClick={() => setModal(edit(s))}>{hm(s.time_in) || "—"}–{hm(s.time_out) || "…"} <i className="ti ti-edit" aria-hidden /></button>)}
                    </div>
                  )}
                </div>
                {st ? <span className={"b " + st[0]}>{st[1]}</span> : <span className="b bk">{T("لم يسجل", "No record")}</span>}
                {can && ss.length === 1 && <button type="button" className="btn bsm" title={T("تعديل", "Edit")} onClick={() => setModal(edit(ss[0]))}><i className="ti ti-edit" style={{ fontSize: 12 }} /></button>}
              </div>
            );
          })}
        </div>
      </div>
      {modal && <AttModal rec={modal} emps={emps} locs={locs} T={T} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} />}
    </>
  );
}

function Monthly({ T, en, emps }: { T: (a: string, b: string) => string; en: boolean; emps: E[] }) {
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { v: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"), l: d.toLocaleDateString(en ? "en-US" : "ar-SA-u-nu-latn", { month: "long", year: "numeric" }) };
    });
  }, [en]);
  const [eid, setEid] = useState("");
  const [mon, setMon] = useState(months[0].v);
  const [res, setRes] = useState<Sum<E>[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    setBusy(true);
    setErr("");
    try {
      const p = mon.split("-"), from = mon + "-01", to = ymd(new Date(+p[0], +p[1], 0));
      const [rows, hols, reqs] = await Promise.all([listAttendanceRange(from, to), listHolidays(), listRequests({ status: "approved" })]);
      setRes(computeReport({
        rows, from, to, emps: emps.filter((e) => !eid || e.id === eid), hols, today: ymd(new Date()),
        dayName: (d) => d.toLocaleDateString(en ? "en-US" : "ar-SA", { weekday: "long" }),
        leaves: reqs.map((l) => ({ employee_id: l.employee_id, from_date: l.from_date, to_date: l.to_date, type: l.type })),
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const H = en ? ["Employee", "Present", "Late", "Absent", "Leave", "Remote", "Late", "Hours"] : ["الموظف", "حاضر", "متأخر", "غائب", "إجازة", "عن بعد", "إجمالي التأخير", "الساعات"];
  return (
    <div className="card">
      <div className="ch">
        <div className="ct"><i className="ti ti-calendar-stats" /> <span>{T("تقرير شهري", "Monthly report")}</span></div>
        <div style={{ display: "flex", gap: 5 }}>
          <select id="AME" value={eid} onChange={(e) => setEid(e.target.value)} style={{ maxWidth: 140 }}><option value="">{T("الكل", "All")}</option>{emps.map((e) => <option key={e.id} value={e.id}>{shortName(e.name_ar || "")}</option>)}</select>
          <select id="AMM" value={mon} onChange={(e) => setMon(e.target.value)} style={{ maxWidth: 130 }}>{months.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select>
          <button type="button" className="btn bpl bsm" id="AMS_GO" title={T("عرض", "Show")} onClick={run}><i className="ti ti-search" /></button>
        </div>
      </div>
      <div className="tw">
        <table id="AMT">
          {busy ? <tbody><tr><td style={{ padding: 14, color: "var(--mu)" }}>{T("جارٍ التحميل…", "Loading…")}</td></tr></tbody>
            : err ? <tbody><tr><td style={{ padding: 14, color: "var(--rd)" }}>{err}</td></tr></tbody>
            : res && (
              <tbody>
                <tr>{H.map((x, i) => <th key={i}>{x}</th>)}</tr>
                {res.map((s) => (
                  <tr key={s.e.id}>
                    <td>{shortName(en ? s.e.name_en || s.e.name_ar : s.e.name_ar)}</td>
                    <td style={{ color: "var(--gr)" }}>{s.present}</td><td style={{ color: "var(--am)" }}>{s.late}</td><td style={{ color: "var(--rd)" }}>{s.absent}</td>
                    <td style={{ color: "var(--pu)" }}>{s.leave}</td><td style={{ color: "var(--cy)" }}>{s.remote}</td><td>{fmtHM(s.lateMin, en)}</td><td>{s.hours}</td>
                  </tr>
                ))}
              </tbody>
            )}
        </table>
      </div>
    </div>
  );
}

export default function Page() {
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (a: string, b: string) => (en ? b : a);
  const { hasRole } = useAuth();
  const can = hasRole("hr", "admin");
  const [emps, setEmps] = useState<E[] | null>(null);
  const [terms, setTerms] = useState<E[]>([]);
  const [locs, setLocs] = useState<{ id: string; name: string }[]>([]);
  const [att, setAtt] = useState<AttendanceSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([listAllEmployees({ tab: "active", sort: "name_ar" }), listAllEmployees({ tab: "terminated", sort: "name_ar" }), listLocations(), getAttendanceSettings().catch(() => null)])
      .then(([a, t, l, s]) => {
        if (!alive) return;
        setEmps(a.items);
        setTerms(t.items);
        setLocs(l.map((x) => ({ id: x.id, name: x.name })));
        setAtt(s);
        setError(null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [tick]);

  if (error) return <PageState error={error} onRetry={() => setTick((t) => t + 1)} />;
  if (!emps) return <PageState loading />;

  return (
    <div className="pg on" id="pg-att" style={{ padding: "12px 16px" }}>
      <ForgotPunchNotice />
      <div className="g2">
        <Daily T={T} en={en} emps={emps} locs={locs} can={can} />
        <Monthly T={T} en={en} emps={emps} />
      </div>
      <AttendanceReports emps={emps} terms={terms} att={att} />
    </div>
  );
}
