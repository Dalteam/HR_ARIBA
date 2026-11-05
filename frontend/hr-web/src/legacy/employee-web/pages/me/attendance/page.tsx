"use client";

// The employee web area's attendance tab, as the design's Att.jsx: the live clock, the phone's location
// against the work locations, today's sessions with the check-in / check-out buttons, the last 31 days, a
// period lookup and «نسيت البصمة». The server decides everything (canonical.py /me/attendance/punch: radius
// or polygon, an approved remote request, the flexible window), so a refusal is shown in its own words.
import { useEffect, useState } from "react";
import { useToast } from "@/components/common/toast";
import { MeState } from "@/legacy/employee-web/components/me/me-shell";
import { ApiError } from "@/lib/api";
import { ddmmyyyy, todayIso } from "@/lib/format";
import { useLocale } from "@/lib/i18n/locale";
import { myAttendance, myAttendanceRange, punch, submitMyRequest, type MySession, type WorkLocation } from "@/legacy/employee-web/lib/me";
import { useApi } from "@/lib/use-api";

const ST: Record<string, [string, string]> = {
  present: ["حاضر", "Present"],
  late: ["متأخر", "Late"],
  remote: ["عن بعد", "Remote"],
  absent: ["غائب", "Absent"],
  leave: ["إجازة", "Leave"],
};

/** Distance in metres between two points on the globe (the design's `hav`). */
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180, dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

const hm = (t: string | null) => (t ? t.slice(0, 5) : "—");

export default function MeAttendance() {
  const { lang } = useLocale();
  const toast = useToast();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const att = useApi(myAttendance, "me-attendance");
  const [now, setNow] = useState<Date | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoErr, setGeoErr] = useState<number | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // The device's place, read once after mount and again every 20 seconds (the design polled the same way).
  // Both the first reading and the refusals arrive from the browser, never during the effect itself.
  useEffect(() => {
    let alive = true;
    const read = () => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        if (alive) setGeoErr(0);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (!alive) return;
          setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
          setGeoErr(null);
        },
        (e) => alive && setGeoErr(e.code || 0),
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 },
      );
    };
    const first = setTimeout(read, 0);
    const iv = setInterval(read, 20000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(iv);
    };
  }, []);

  const data = att.data;
  const place = (() => {
    if (geoErr === 1) return { state: "denied", text: T("فعّل صلاحية الموقع", "Allow location access") };
    if (geoErr !== null) return { state: "denied", text: T("تعذر تحديد الموقع", "Unable to detect location") };
    const all = (data?.locations ?? []).filter((l) => l && l.type !== "remote" && l.latitude != null && l.longitude != null);
    const circles = all.filter((l) => !(Number(l.latitude) === 0 && Number(l.longitude) === 0));
    if (all.length && !circles.length) return { state: "out", text: T("إحداثيات موقع عملك غير مضبوطة", "Your work location coordinates are not set") };
    if (!pos) return { state: "loading", text: T("جاري تحديد موقعك…", "Locating you…") };
    if (!circles.length) return { state: "gps", text: T("تم تحديد موقعك", "Location detected") };
    let best: WorkLocation | null = null;
    let bestD = Infinity;
    circles.forEach((l) => {
      const d = distanceM(pos.lat, pos.lng, Number(l.latitude), Number(l.longitude));
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    });
    const nearest = best as WorkLocation | null;
    const inside = bestD <= (Number(nearest?.radius_m) || 200);
    const name = nearest ? (lang === "en" ? nearest.name_en || nearest.name : nearest.name) : "";
    const shown = bestD >= 1000 ? (bestD / 1000).toFixed(1) + T(" كم", " km") : Math.round(bestD) + T(" م", " m");
    return inside
      ? { state: "in", text: T("داخل نطاق: ", "Inside: ") + name }
      : { state: "out", text: T("خارج النطاق — أقرب موقع ", "Outside — nearest ") + name + " (" + shown + ")" };
  })();


  // «نسيت البصمة / مهمة خارجية» and the period lookup keep their own little state (no dialogs in this area).
  const [fp, setFp] = useState(false);
  const [fpKind, setFpKind] = useState<"in" | "out" | "both">("in");
  const [fpDate, setFpDate] = useState(todayIso());
  const [fpFrom, setFpFrom] = useState("08:00");
  const [fpTo, setFpTo] = useState("17:00");
  const [fpWhy, setFpWhy] = useState("");
  const [fpBusy, setFpBusy] = useState(false);
  const [rFrom, setRFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [rTo, setRTo] = useState(todayIso());
  const [rRows, setRRows] = useState<MySession[] | null>(null);
  const [rBusy, setRBusy] = useState(false);
  const [rErr, setRErr] = useState("");

  const CODES: Record<string, [string, string]> = {
    OUTSIDE_GEOFENCE: ["أنت خارج نطاق مواقع العمل المسموح بها", "You are outside the allowed work locations"],
    REMOTE_NOT_APPROVED: ["العمل عن بعد يحتاج طلب «عن بعد» معتمداً لهذا اليوم", "Remote work needs an approved remote request for today"],
    TOO_EARLY_FOR_FLEXIBLE_WINDOW: ["لسه بدري — الحضور المرن يبدأ لاحقاً حسب إعدادات الشركة", "Too early — flexible check-in starts later per company settings"],
    TOO_LATE_FOR_FLEXIBLE_WINDOW: ["الوقت متأخر — دوامك مش هيكمل جوه نطاق ساعات العمل المسموح بها", "Too late — your shift will not fit inside the allowed work window"],
    GPS_REQUIRED: ["يجب السماح بتحديد الموقع", "Location access is required"],
    NO_ACTIVE_LOCATION: ["لا يوجد موقع عمل مضبوط", "No work location is set"],
    EMPLOYEE_NOT_ACTIVE: ["الموظف غير نشط", "The employee is not active"],
  };
  const fail = (e: unknown) => {
    if (e instanceof ApiError) {
      const c = CODES[e.code];
      if (c) return T(c[0], c[1]);
      return e.message || T("تعذر تنفيذ العملية", "Could not complete the action");
    }
    return String(e);
  };

  async function doPunch(kind: "in" | "out") {
    if (!pos) {
      toast(T("يجب السماح بتحديد الموقع", "Location access is required"), "err");
      return;
    }
    setBusy(kind);
    try {
      const r = await punch(kind, pos.lat, pos.lng);
      toast(
        kind === "in"
          ? T("تم تسجيل الحضور", "Checked in") + (r.late_minutes > 0 ? " — " + T("تأخير ", "Late ") + r.late_minutes + T(" دقيقة", " min") : "")
          : T("تم تسجيل الانصراف", "Checked out") + (r.early_minutes > 0 ? " — " + T("قبل المتوقع بـ ", "Before the expected time by ") + r.early_minutes + T(" دقيقة", " min") : ""),
        "ok",
      );
      att.reload();
    } catch (e) {
      toast(fail(e), "err");
    } finally {
      setBusy("");
    }
  }

  async function sendForgot() {
    if (!fpDate || !fpFrom || fpWhy.trim().length < 3) {
      toast(T("اختر التاريخ والوقت واكتب السبب (3 أحرف على الأقل)", "Pick the date and time and write the reason (3 characters at least)"), "err");
      return;
    }
    setFpBusy(true);
    try {
      await submitMyRequest({
        type: "forgot_punch",
        on_date: fpDate,
        time_from: fpFrom,
        time_to: fpKind === "both" ? fpTo : undefined,
        punch_kind: fpKind,
        notes: fpWhy.trim(),
      });
      toast(T("أُرسل طلب نسيان البصمة", "Forgot-punch request submitted"), "ok");
      setFpWhy("");
      setFp(false);
      att.reload();
    } catch (e) {
      toast(fail(e), "err");
    } finally {
      setFpBusy(false);
    }
  }

  async function lookup() {
    setRBusy(true);
    setRErr("");
    try {
      setRRows(await myAttendanceRange(rFrom, rTo));
    } catch (e) {
      toast(fail(e), "err");
      setRErr(fail(e));
    } finally {
      setRBusy(false);
    }
  }

  if (att.error) return <MeState error={att.error.message} />;
  if (!data) return <MeState loading={att.loading} error={null} />;

  const today = data.today.filter((r) => r.time_in);
  const open = [...today].reverse().find((r) => r.time_in && !r.time_out) ?? null;
  const by: Record<string, MySession[]> = {};
  data.history
    .filter((r) => r.time_in)
    .forEach((r) => {
      (by[r.work_date] = by[r.work_date] || []).push(r);
    });
  const days = Object.keys(by).sort().reverse();
  const dot = place.state === "in" ? "var(--gr)" : place.state === "out" || place.state === "denied" ? "var(--rd)" : "var(--am)";


  return (
    <>
      <div className="att-big">
        <div className="att-time" dir="ltr" suppressHydrationWarning>
          {now ? now.toLocaleTimeString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Riyadh" }) : "—"}
        </div>
        <div className="att-date" suppressHydrationWarning>
          {now ? now.toLocaleDateString(lang === "en" ? "en-GB" : "ar-SA-u-ca-gregory-nu-latn", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Riyadh" }) : "—"}
        </div>
      </div>
      <div className="loc-badge">
        <div className="loc-dot" style={{ background: dot }} />
        <span style={{ color: dot, fontSize: 12 }}>{place.text}</span>
      </div>

      <div className="card">
        <div className="card-title">📌 {T("حالة الحضور اليوم", "Today's attendance status")}</div>
        {!today.length && (
          <>
            <div className="att-status att-none">{T("لم تسجل حضورك بعد", "You have not checked in yet")}</div>
            <button type="button" className="btn btn-success" disabled={busy === "in"} onClick={() => void doPunch("in")}>📍 {T("تسجيل الحضور", "Check in")}</button>
          </>
        )}
        {!!today.length && open && (
          <>
            <div className="att-status att-in">
              ✅ {T("حضور", "Checked in")} — {hm(today[0].time_in)}
              {today.length > 1 ? " (" + T("الجلسة الحالية من ", "current session from ") + hm(open.time_in) + ")" : ""}
            </div>
            <button type="button" className="btn btn-danger" disabled={busy === "out"} onClick={() => void doPunch("out")}>🚪 {T("تسجيل الانصراف", "Check out")}</button>
          </>
        )}
        {!!today.length && !open && (
          <>
            <div className="att-status att-in">🚪 {T("آخر انصراف", "Last check-out")} — {hm([...today].reverse().find((r) => r.time_out)?.time_out ?? null)}</div>
            <div style={{ fontSize: 11, color: "var(--mu)", textAlign: "center", margin: "4px 0", lineHeight: 1.7 }}>
              {T("انصرفت بالخطأ؟ سجّل حضورك مرة أخرى، ويُحسب انصرافك على آخر تسجيل.", "Checked out by mistake? Check in again — your check-out counts as the last one.")}
            </div>
            <button type="button" className="btn btn-success" disabled={busy === "in"} onClick={() => void doPunch("in")}>↩ {T("رجوع للعمل — تسجيل حضور مرة أخرى", "Back to work — check in again")}</button>
          </>
        )}
        {today.length > 1 && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--mu)" }}>
            {T("جلسات اليوم:", "Today's sessions:")}{" "}
            {today.map((r, i) => (
              <span key={r.id} dir="ltr">
                {i > 0 ? " | " : ""}
                {hm(r.time_in)} → {r.time_out ? hm(r.time_out) : "…"}
              </span>
            ))}
          </div>
        )}
        {data.flexible_enabled && data.expected_checkout && (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--bl)" }}>⏱ {T("الانصراف المتوقع ", "Expected check-out ")}{data.expected_checkout}</div>
        )}
        {data.remote_limit > 0 && (
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--mu)" }}>{T("العمل عن بعد هذا العام: ", "Remote days this year: ")}{data.remote_used} / {data.remote_limit}</div>
        )}
        <button type="button" onClick={() => setFp((v) => !v)} style={{ width: "100%", marginTop: 8, background: "transparent", border: "1px solid var(--bd)", color: "var(--mu)", borderRadius: 8, padding: 8, cursor: "pointer", fontSize: 12 }}>
          ⚠️ {T("نسيت البصمة / مهمة خارجية", "Forgot to punch / external assignment")}
        </button>
      </div>

      {fp && (
        <div className="card">
          <div className="card-title">⚠️ {T("طلب نسيان بصمة", "Forgot-punch request")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label htmlFor="fpKind">{T("النوع", "Type")}</label>
              <select id="fpKind" value={fpKind} onChange={(e) => setFpKind(e.target.value as "in" | "out" | "both")}>
                <option value="in">{T("حضور", "Check-in")}</option>
                <option value="out">{T("انصراف", "Check-out")}</option>
                <option value="both">{T("الاثنان", "Both")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="fpDate">{T("التاريخ", "Date")}</label>
              <input id="fpDate" type="date" value={fpDate} max={todayIso()} onChange={(e) => setFpDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="fpFrom">{T("الوقت", "Time")}</label>
              <input id="fpFrom" type="time" value={fpFrom} onChange={(e) => setFpFrom(e.target.value)} />
            </div>
            {fpKind === "both" && (
              <div>
                <label htmlFor="fpTo">{T("وقت الانصراف", "Check-out time")}</label>
                <input id="fpTo" type="time" value={fpTo} onChange={(e) => setFpTo(e.target.value)} />
              </div>
            )}
          </div>
          <label htmlFor="fpWhy" style={{ display: "block", marginTop: 10 }}>{T("السبب", "Reason")}</label>
          <textarea id="fpWhy" rows={2} value={fpWhy} onChange={(e) => setFpWhy(e.target.value)} />
          <button type="button" className="btn btn-primary" disabled={fpBusy} onClick={() => void sendForgot()} style={{ width: "100%", justifyContent: "center", marginTop: 10 }}>
            {fpBusy ? "…" : T("إرسال الطلب", "Submit request")}
          </button>
        </div>
      )}


      <div className="card">
        <div className="card-title">📅 {T("سجل آخر 31 يوم", "Last 31 days log")}</div>
        {!days.length && <div style={{ textAlign: "center", color: "var(--mu)", padding: 15, fontSize: 12 }}>{T("لا يوجد سجل", "No records")}</div>}
        {days.map((d) => {
          const rows = [...by[d]].sort((a, b) => String(a.time_in).localeCompare(String(b.time_in)));
          const last = rows[rows.length - 1];
          return (
            <div key={d} style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "7px 0", borderBottom: "1px solid var(--bd)", fontSize: 11 }}>
              <span>{ddmmyyyy(d)}</span>
              <span dir="ltr">
                {hm(rows[0].time_in)} → {last.time_out ? hm(last.time_out) : "…"}
                {rows.length > 1 ? " (×" + rows.length + ")" : ""}
              </span>
              <span style={{ color: rows[0].status === "late" ? "var(--rd)" : "var(--gr)" }}>
                {ST[rows[0].status] ? T(ST[rows[0].status][0], ST[rows[0].status][1]) : rows[0].status}
              </span>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title">🔍 {T("استعلام عن حضور بفترة محددة", "Attendance lookup for a period")}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <input type="date" value={rFrom} onChange={(e) => setRFrom(e.target.value)} style={{ flex: 1, minWidth: 120 }} aria-label={T("من", "From")} />
          <input type="date" value={rTo} onChange={(e) => setRTo(e.target.value)} style={{ flex: 1, minWidth: 120 }} aria-label={T("إلى", "To")} />
          <button type="button" className="btn btn-primary" disabled={rBusy} onClick={() => void lookup()}>{rBusy ? "…" : T("بحث", "Search")}</button>
        </div>
        {rErr && <div style={{ textAlign: "center", color: "var(--rd)", padding: 12, fontSize: 12 }}>{rErr}</div>}
        {rRows && !rRows.length && <div style={{ textAlign: "center", color: "var(--mu)", padding: 12, fontSize: 12 }}>{T("لا يوجد سجل حضور في هذه الفترة", "No attendance records in this period")}</div>}
        {rRows?.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--bd)", fontSize: 11.5 }}>
            <span>{ddmmyyyy(a.work_date)}</span>
            <span dir="ltr">{hm(a.time_in)} → {hm(a.time_out)}</span>
            <span style={{ fontWeight: 700, color: a.status === "late" ? "var(--rd)" : "var(--gr)" }}>
              {ST[a.status] ? T(ST[a.status][0], ST[a.status][1]) : a.status}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

