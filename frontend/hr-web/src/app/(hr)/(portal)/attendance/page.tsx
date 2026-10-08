"use client";

// Attendance (الحضور والانصراف) — port of #pg-att / js/main/07-attendance.js: today cards, the
// per-day record list with manual add/edit, and the monthly summary.
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/hr/modal";
import { AttendanceReports } from "@/components/hr/attendance-reports";
import { PageState } from "@/components/hr/not-built";
import { useToast } from "@/components/common/toast";
import { listAllEmployees } from "@/lib/employees";
import { listLocations } from "@/lib/locations";
import { todayIso, ddmmyyyy } from "@/lib/format";
import { listAttendance, listAttendanceSummary, upsertAttendance, type AttendanceRecord, type AttendanceStatus } from "@/lib/attendance";
import type { EmployeeListItem } from "@/lib/api";

const STATUS: Record<AttendanceStatus | "none", { cls: string; label: string }> = {
  present: { cls: "b bg", label: "حاضر" },
  late: { cls: "b ba", label: "متأخر" },
  absent: { cls: "b br", label: "غائب" },
  leave: { cls: "b bp", label: "إجازة" },
  remote: { cls: "b bc", label: "عن بعد" },
  none: { cls: "b bk", label: "لم يسجل" },
};

const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 8, marginBottom: 10, border: "1px solid var(--bd)", borderRadius: 8, background: "var(--c2)", color: "var(--tx)", fontSize: 13 };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--mu)", fontWeight: 600, display: "block", marginBottom: 4 };
const kpi = (c: string): React.CSSProperties => ({ background: `color-mix(in srgb, ${c} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 27%, transparent)`, borderRadius: 10, padding: 10, textAlign: "center" });

const today = () => todayIso();
const monthNow = () => today().slice(0, 7);

export default function Page() {
  const toast = useToast();
  const [emps, setEmps] = useState<EmployeeListItem[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [locs, setLocs] = useState<{ id: string; name: string }[]>([]);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof listAttendanceSummary>>>([]);
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(monthNow());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [empId, setEmpId] = useState("");
  const [workDate, setWorkDate] = useState(today());
  const [timeIn, setTimeIn] = useState("");
  const [timeOut, setTimeOut] = useState("");
  const [locId, setLocId] = useState("");
  const [status, setStatus] = useState<AttendanceStatus>("present");

  useEffect(() => {
    let alive = true;
    Promise.all([listAllEmployees({ tab: "active", sort: "name_ar" }), listLocations(), listAttendance(date), listAttendanceSummary(month)])
      .then(([p, l, r, s]) => {
        if (!alive) return;
        setEmps(p.items);
        setLocs(l.map((x) => ({ id: x.id, name: x.name })));
        setRecords(r);
        setSummary(s);
        setError(null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [date, month, reloadTick]);

  const recByEmp = useMemo(() => {
    const m = new Map<string, AttendanceRecord>();
    for (const r of records) m.set(String(r.employee_id), r);
    return m;
  }, [records]);

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, leave: 0, remote: 0 };
    for (const r of records) c[r.status]++;
    return c;
  }, [records]);

  function openAdd() {
    setEditId(null);
    setEmpId("");
    setWorkDate(date);
    setTimeIn("");
    setTimeOut("");
    setLocId("");
    setStatus("present");
    setOpen(true);
  }

  function openEdit(r: AttendanceRecord) {
    setEditId(r.id);
    setEmpId(r.employee_id);
    setWorkDate(r.work_date);
    setTimeIn(r.time_in ?? "");
    setTimeOut(r.time_out ?? "");
    setLocId(r.location_id ?? "");
    setStatus(r.status);
    setOpen(true);
  }

  async function save() {
    if (!empId) return toast("اختر الموظف", "err");
    const body = { employee_id: empId, work_date: workDate, time_in: timeIn || null, time_out: timeOut || null, location_id: locId || null, status };
    try {
      await upsertAttendance(body);
      toast("✓ تم حفظ سجل الحضور", "ok");
      setOpen(false);
      setReloadTick((t) => t + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
    }
  }

  if (error) return <PageState error={error} onRetry={() => setReloadTick((t) => t + 1)} />;
  if (loading) return <PageState loading />;

  const presentCard = counts.present + counts.late;
  const absentCard = Math.max(0, emps.length - presentCard - counts.remote - counts.leave);

  return (
    <div className="pg on" id="pg-att">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--bd)", background: "var(--c2)", color: "var(--tx)" }} />
        <button type="button" className="btn bgr" onClick={openAdd}><i className="ti ti-plus" /> تسجيل حضور</button>
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ fontSize: 12, maxWidth: 160, marginRight: "auto" }}>
          {Array.from({ length: 6 }, (_, i) => {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() - i);
            const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            return <option key={v} value={v}>{ddmmyyyy(v + "-01")}</option>;
          })}
        </select>
      </div>

      <div id="ATK" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 10 }}>
        <div style={kpi("var(--gr)")}><div style={{ fontSize: 10, color: "var(--mu)" }}>حاضر اليوم</div><div style={{ fontSize: 18, fontWeight: 800, color: "var(--gr)" }}>{presentCard}</div><div style={{ fontSize: 10, color: "var(--dm)" }}>من {emps.length}</div></div>
        <div style={kpi("var(--am)")}><div style={{ fontSize: 10, color: "var(--mu)" }}>متأخر</div><div style={{ fontSize: 18, fontWeight: 800, color: "var(--am)" }}>{counts.late}</div></div>
        <div style={kpi("var(--cy)")}><div style={{ fontSize: 10, color: "var(--mu)" }}>عن بعد</div><div style={{ fontSize: 18, fontWeight: 800, color: "var(--cy)" }}>{counts.remote}</div></div>
        <div style={kpi("var(--rd)")}><div style={{ fontSize: 10, color: "var(--mu)" }}>غائب</div><div style={{ fontSize: 18, fontWeight: 800, color: "var(--rd)" }}>{absentCard}</div></div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="ct" style={{ padding: "12px 14px" }}><i className="ti ti-users" /> سجل الحضور — {ddmmyyyy(date)}</div>
        <div style={{ padding: "0 14px 14px" }}>
          {emps.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--mu)", padding: 20 }}>لا يوجد موظفون</div>
          ) : (
            emps.map((e) => {
              const r = recByEmp.get(String(e.id));
              const st = r ? STATUS[r.status] : STATUS.none;
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(36,48,68,.4)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name_ar.split(" ").slice(0, 3).join(" ")}</div>
                    <div style={{ fontSize: 10, color: "var(--dm)" }}>{r?.location_name || e.workplace?.name_ar || "—"}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "var(--mu)" }}>{r ? `${r.time_in ?? ""} → ${r.time_out ?? "..."}` : "—"}</div>
                    {r?.late_minutes ? <div style={{ fontSize: 10, color: "var(--am)" }}>⏰ تأخير {r.late_minutes} دقيقة</div> : null}
                    {r?.early_minutes ? <div style={{ fontSize: 10, color: "var(--rd)" }}>🚪 خروج مبكر {r.early_minutes} دقيقة</div> : null}
                  </div>
                  <span className={st.cls}>{st.label}</span>
                  {r && <button type="button" className="btn bsm" onClick={() => openEdit(r)}><i className="ti ti-edit" style={{ fontSize: 12 }} /></button>}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0, marginTop: 12 }}>
        <div className="ct" style={{ padding: "12px 14px" }}><i className="ti ti-calendar-stats" /> تقرير شهري</div>
        <div style={{ padding: "0 14px 14px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>{["الموظف", "حاضر", "متأخر", "غائب", "إجازة", "عن بعد"].map((h) => <th key={h} style={{ padding: "6px 8px", textAlign: "right", borderBottom: "2px solid var(--bl)", color: "var(--mu)", fontSize: 10 }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.employee_id}>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(36,48,68,.2)", fontWeight: 600 }}>{s.employee_name.split(" ").slice(0, 3).join(" ")}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(36,48,68,.2)", color: "var(--gr)" }}>{s.present}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(36,48,68,.2)", color: "var(--am)" }}>{s.late}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(36,48,68,.2)", color: "var(--rd)" }}>{s.absent}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(36,48,68,.2)", color: "var(--pu)" }}>{s.leave}</td>
                  <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(36,48,68,.2)", color: "var(--cy)" }}>{s.remote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <Modal title={editId ? "تعديل سجل الحضور" : "تسجيل حضور"} width={440} onClose={() => setOpen(false)}>
          <label style={lbl}>الموظف *</label>
          <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={inp}>
            <option value="">— اختر موظفاً —</option>
            {emps.map((e) => (
              <option key={e.id} value={e.id}>{e.name_ar}</option>
            ))}
          </select>
          <label style={lbl}>التاريخ</label>
          <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} style={inp} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><label style={lbl}>الدخول</label><input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>الانصراف</label><input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} style={inp} /></div>
          </div>
          <label style={lbl}>الموقع</label>
          <select value={locId} onChange={(e) => setLocId(e.target.value)} style={inp}>
            <option value="">—</option>
            {locs.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <label style={lbl}>الحالة</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)} style={inp}>
            <option value="present">حاضر</option>
            <option value="late">متأخر</option>
            <option value="absent">غائب</option>
            <option value="leave">إجازة</option>
            <option value="remote">عن بعد</option>
          </select>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="button" className="btn bgr" onClick={save}><i className="ti ti-check" /> حفظ</button>
            <button type="button" className="btn bsm" onClick={() => setOpen(false)}>إلغاء</button>
          </div>
        </Modal>
      )}
      <AttendanceReports emps={emps} />
    </div>
  );
}
