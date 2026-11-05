"use client";

// Settings ▸ the design's ScheduleCard on OUR /settings/schedule (Stage 20, S6) — the rules are
// backend/app/services/schedule.py. The official shift, the Ramadan shift, the late grace and the Ramadan window.
// While the switch is off (the default) attendance keeps today's rule (company work start + tolerance + shift hours),
// so no stored punch moves; with it on, the day's row decides the start, the end, the shift length and the grace of
// every punch taken from then on. Editing needs `settings: edit`; the API checks it itself.
import { useEffect, useState } from "react";
import { DateField, TimeField } from "@/components/common/date-time-field";
import { useToast } from "@/components/common/toast";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/i18n/locale";
import { getSchedule, putSchedule, type ScheduleSettings, type Shift } from "@/lib/settings";

const card: React.CSSProperties = { marginTop: 12, maxWidth: 900 };
const err = (e: unknown) => (e instanceof ApiError ? e.message : String(e));
const hhmm = (t: string) => (t || "").slice(0, 5);
const dmy = (s: string) => { const a = String(s || "").slice(0, 10).split("-"); return a.length === 3 ? `${a[2]}/${a[1]}/${a[0]}` : ""; };
// the server's own limits (schedule.MAX_HOURS / MAX_GRACE), shown on the inputs so a save is never refused
const MAX_HOURS = 16;
const MAX_GRACE = 120;

type T = (ar: string, en: string) => string;

function ShiftFields({ name, title, hint, value, edit, busy, T, onChange }: {
  name: "official" | "ramadan"; title: string; hint: string; value: Shift;
  edit: boolean; busy: boolean; T: T; onChange: (p: Partial<Shift>) => void;
}) {
  const off = !edit || busy;
  return (
    <div style={{ borderTop: "1px solid var(--bd)", paddingTop: 8, marginTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>{title}</div>
      <div className="fg">
        <div><label>{T("البداية", "Start")}</label>
          <TimeField id={`SC_${name}_START`} value={hhmm(value.start)} disabled={off} onChange={(x) => onChange({ start: x })} />
        </div>
        <div><label>{T("النهاية", "End")}</label>
          <TimeField id={`SC_${name}_END`} value={hhmm(value.end)} disabled={off} onChange={(x) => onChange({ end: x })} />
        </div>
        <div><label>{T("عدد ساعات الدوام", "Shift hours")}</label>
          <input type="number" min={1} max={MAX_HOURS} step={0.5} value={value.hours} disabled={off}
            onChange={(e) => onChange({ hours: Number(e.target.value) || 0 })} />
        </div>
        <div><label>{T("سماح التأخير (دقيقة)", "Late grace (minutes)")}</label>
          <input type="number" min={0} max={MAX_GRACE} value={value.grace} disabled={off}
            onChange={(e) => onChange({ grace: Number(e.target.value) || 0 })} />
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--mu)", marginTop: 4 }}>{hint}</div>
    </div>
  );
}

export function ScheduleCard() {
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (ar: string, e: string) => (en ? e : ar);
  const toast = useToast();
  const { can } = useAuth();
  const edit = can("settings", "edit");
  const [v, setV] = useState<ScheduleSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSchedule().then(setV).catch((e) => toast(err(e), "err"));
  }, [toast]);

  const row = (name: "official" | "ramadan", p: Partial<Shift>) =>
    setV((o) => (o ? { ...o, [name]: { ...o[name], ...p } } : o));

  async function save() {
    if (!v) return;
    setBusy(true);
    try {
      const saved = await putSchedule({
        enabled: v.enabled, official: v.official, ramadan: v.ramadan,
        ramadan_auto: v.ramadan_auto, ramadan_from: v.ramadan_from, ramadan_to: v.ramadan_to,
      });
      setV(saved);
      toast("✓ " + T("اتحفظ جدول الدوام", "Working schedule saved"), "ok");
    } catch (e) {
      toast(err(e), "err");
    } finally {
      setBusy(false);
    }
  }

  const today = v?.today;
  const shift = today?.shift;

  return (
    <div className="card" style={card} id="ATT_SCHEDULE">
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-calendar-time" /> {T("جدول الدوام (رسمي + رمضان)", "Working schedule (official + Ramadan)")}</div>
      <div style={{ fontSize: 11.5, color: "var(--mu)", lineHeight: 1.7, marginBottom: 8 }}>
        {T("الحضور يُحسب على الجدول المُطبَّق: الدوام الرسمي في الأيام العادية، ودوام رمضان تلقائيًا مع دخول رمضان. الحضور المسجّل قبل التفعيل يحتفظ بأرقامه.",
          "Attendance is calculated on the applied schedule: official hours normally, Ramadan hours automatically during Ramadan. Punches recorded before the switch keep their figures.")}
      </div>
      {!v ? <div style={{ color: "var(--mu)" }}>…</div> : (
        <>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, padding: "5px 0" }}>
            <input type="checkbox" checked={v.enabled} disabled={!edit || busy} onChange={(ev) => setV({ ...v, enabled: ev.target.checked })} />
            <b>{T("تفعيل حساب الحضور على الجدول", "Calculate attendance on this schedule")}</b>
          </label>
          <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 2 }}>
            {v.enabled
              ? T("مُفعّل: التأخير والانصراف المبكر يُقاسان على بداية ونهاية الدوام المُطبَّق ذلك اليوم، وسماح التأخير من نفس الجدول.",
                "On: lateness and early leaving are measured against that day's start and end, with the grace from the same row.")
              : T("غير مُفعّل: يبقى وقت بدء العمل وهامش التأخير من إعدادات الشركة (بطاقة إعدادات الشركة) كما هو.",
                "Off: attendance keeps the company's work start and tolerance (the company card) — nothing changes.")}
          </div>
          <ShiftFields name="official" title={T("الدوام الرسمي", "Official hours")}
            hint={T("نهاية الدوام بعد بدايته، والساعات بين 1 و16، وسماح التأخير حتى 120 دقيقة.", "The end is after the start, hours 1–16, grace up to 120 minutes.")}
            value={v.official} edit={edit} busy={busy} T={T} onChange={(p) => row("official", p)} />
          <ShiftFields name="ramadan" title={T("دوام رمضان", "Ramadan hours")}
            hint={T("يُطبَّق داخل رمضان فقط، ثم يرجع الدوام الرسمي تلقائيًا.", "Used inside Ramadan only; official hours return automatically.")}
            value={v.ramadan} edit={edit} busy={busy} T={T} onChange={(p) => row("ramadan", p)} />
          <div style={{ borderTop: "1px solid var(--bd)", paddingTop: 8, marginTop: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>{T("تحديد رمضان", "Ramadan window")}</div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
              <input type="checkbox" checked={v.ramadan_auto} disabled={!edit || busy} onChange={(ev) => setV({ ...v, ramadan_auto: ev.target.checked })} />
              {T("تحديد رمضان تلقائيًا بالتقويم الهجري", "Find Ramadan automatically in the Hijri calendar")}
            </label>
            <div className="fg" style={{ marginTop: 8 }}>
              <div><label>{T("من تاريخ", "From")}</label>
                <DateField id="SC_RAM_FROM" value={v.ramadan_from} disabled={!edit || busy} onChange={(x) => setV({ ...v, ramadan_from: x })} />
              </div>
              <div><label>{T("إلى تاريخ", "To")}</label>
                <DateField id="SC_RAM_TO" value={v.ramadan_to} disabled={!edit || busy} onChange={(x) => setV({ ...v, ramadan_to: x })} />
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--mu)", marginTop: 4 }}>
              {T("اترك التاريخين فارغين للاعتماد على الحساب الهجري (قد يفرق يومًا). وإذا حُدِّد التاريخان معًا فهما المُلزِمان، ولا بد من التاريخين معًا أو تركهما معًا.",
                "Leave both empty to use the Hijri calculation (it can be a day off). Both dates together are authoritative; set both or neither.")}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--mu)", marginTop: 2 }}>
              {v.ramadan_auto
                ? T("الحساب التلقائي مُفعّل — يُستخدم في الأيام التي لا يغطيها التاريخان.", "Automatic is on — it covers the days the two dates do not.")
                : T("الحساب التلقائي موقوف — بدون التاريخين لا يُطبَّق دوام رمضان.", "Automatic is off — without the two dates Ramadan hours never apply.")}
            </div>
          </div>
          <div className="al" style={{ marginTop: 10, fontSize: 11.5 }}>
            <i className="ti ti-info-circle" />
            <div>
              {shift && today ? (
                <>
                  {T("الدوام المُطبَّق اليوم", "Applies today")} <b dir="ltr">{dmy(today.date)}</b>{" — "}
                  {shift.kind === "ramadan" ? T("دوام رمضان", "Ramadan hours") : T("الدوام الرسمي", "Official hours")}{" "}
                  <span dir="ltr">{shift.start} – {shift.end}</span>{" · "}
                  {Number(shift.hours)} {T("ساعة", "h")}{" · "}
                  {T("سماح", "grace")} {Number(shift.grace)} {T("دقيقة", "min")}
                </>
              ) : (
                <>{T("الجدول غير مُفعّل، فالحضور اليوم على إعدادات الشركة.", "The schedule is off, so attendance today follows the company settings.")}</>
              )}
            </div>
          </div>
          {edit && (
            <div style={{ marginTop: 10 }}>
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

