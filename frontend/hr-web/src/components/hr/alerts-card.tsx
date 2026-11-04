"use client";

// Settings ▸ التنبيهات — port of the design's pages/settings/AlertsCard.jsx on OUR /settings/alerts (Stage 13).
//
// Per kind: the dashboard window («تنبيه قبل N يوم») and the bell (from N days before, daily until renewed, on the
// chosen channels, to HR and / or the employee), the default probation length, «تشغيل الآن» and the newest alerts.
// E-mail stays off: the channel is kept for the day sending is switched on, nothing is mailed now.
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/common/toast";
import { ApiError, request } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/i18n/locale";

type Kind = "probation" | "contract" | "iqama" | "passport" | "insurance" | "natAddr" | "gosiCert";
type Bell = { on: boolean; before: number; ch: string[]; to: string[] };
type Cfg = Record<Kind, { on: boolean; before: number; n: Bell }> & { probation_default: number };
type Status = { sent_at: string; kind: Kind; label: string; expiry: string; employee_name: string | null; recipient_name: string | null; recipient: string };

const ROWS: [Kind, string, string][] = [
  ["probation", "انتهاء فترة التجربة", "Probation end"],
  ["contract", "انتهاء العقد", "Contract end"],
  ["iqama", "انتهاء الهوية / الإقامة", "Iqama / ID expiry"],
  ["passport", "انتهاء جواز السفر", "Passport expiry"],
  ["insurance", "انتهاء التأمين الطبي", "Medical insurance expiry"],
  ["natAddr", "انتهاء العنوان الوطني", "National address expiry"],
  ["gosiCert", "انتهاء شهادة التأمينات الاجتماعية", "Social insurance certificate expiry"],
];
const CH: [string, string, string][] = [["program", "إشعار البرنامج", "Program"], ["app", "إشعار التطبيق", "App"], ["email", "الإيميل", "Email"]];
const TO: [string, string, string][] = [["hr", "الموارد البشرية", "HR"], ["employee", "الموظف نفسه", "The employee"]];
const err = (e: unknown) => (e instanceof ApiError ? e.message : String(e));
const dmy = (s: string) => { const a = String(s || "").slice(0, 10).split("-"); return a.length === 3 ? `${a[2]}/${a[1]}/${a[0]}` : ""; };

export function AlertsCard() {
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (ar: string, e: string) => (en ? e : ar);
  const toast = useToast();
  const { can } = useAuth();
  const edit = can("settings", "edit");
  const [v, setV] = useState<Cfg | null>(null);
  const [lastRun, setLastRun] = useState<{ date: string; sent: number } | null>(null);
  const [st, setSt] = useState<Status[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await request<{ cfg: Cfg; last_run: { date: string; sent: number } | null }>("/settings/alerts");
      setV(r.cfg);
      setLastRun(r.last_run);
      const s = await request<{ rows: Status[] }>("/alerts/status");
      setSt(s.rows);
    } catch (e) {
      toast(err(e), "err");
    }
  }, [toast]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the card's first read
    void load();
  }, [load]);

  const set = (k: Kind, p: Partial<Cfg[Kind]>) => setV((o) => (o ? { ...o, [k]: { ...o[k], ...p } } : o));
  const setN = (k: Kind, p: Partial<Bell>) => setV((o) => (o ? { ...o, [k]: { ...o[k], n: { ...o[k].n, ...p } } } : o));
  const tog = (k: Kind, f: "ch" | "to", x: string) => v && setN(k, { [f]: v[k].n[f].includes(x) ? v[k].n[f].filter((y) => y !== x) : [...v[k].n[f], x] });

  async function save(): Promise<boolean> {
    if (!v) return false;
    setBusy(true);
    try {
      const r = await request<{ cfg: Cfg }>("/settings/alerts", { method: "PUT", body: { cfg: v } });
      setV(r.cfg);
      toast("✓ " + T("اتحفظت إعدادات التنبيهات", "Alert settings saved"), "ok");
      return true;
    } catch (e) {
      toast(err(e), "err");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function runNow() {
    if (!(await save())) return;
    setBusy(true);
    try {
      const r = await request<{ sent: number; duplicates: number }>("/alerts/run", { method: "POST" });
      toast("✓ " + T(`تم التشغيل: أُرسل ${r.sent} تنبيه${r.duplicates ? ` (و${r.duplicates} أُرسل اليوم بالفعل)` : ""}`, `Done: ${r.sent} alert(s) sent${r.duplicates ? ` (${r.duplicates} already sent today)` : ""}`), "ok");
      await load();
    } catch (e) {
      toast(err(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 12, maxWidth: 900 }} id="ALERTS_CARD">
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-bell-ringing" /> {T("التنبيهات (قبل الانتهاء بكم يوم؟)", "Alerts (days before expiry)")}</div>
      <div style={{ fontSize: 11.5, color: "var(--mu)", lineHeight: 1.7, marginBottom: 8 }}>
        {T("تظهر هذه التنبيهات في «تنبيهات عاجلة» بلوحة التحكم. فترة التجربة تُحسب تلقائيًا من تاريخ المباشرة. تنبيه الجرس يظهر كل صباح من (قبل الانتهاء بالعدد المحدد) حتى تجديد التاريخ، وفترة التجربة حتى 15 يومًا بعد انتهائها.",
          "These alerts show in the dashboard's «urgent alerts». Probation is computed from the joining date. The bell rings every morning from (the days you set before the date) until the date is renewed; probation until 15 days after it ends.")}
      </div>
      {!v ? <div style={{ color: "var(--mu)" }}>…</div> : (
        <>
          <div style={{ display: "grid", gap: 6 }}>
            {ROWS.map(([k, ar, e]) => (
              <div key={k} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 190, fontWeight: 600 }}>
                  <input type="checkbox" checked={v[k].on} disabled={!edit} onChange={(ev) => set(k, { on: ev.target.checked })} />{en ? e : ar}
                </label>
                <span>{T("تنبيه قبل", "Alert before")}</span>
                <input type="number" min={0} max={365} value={v[k].before} disabled={!edit || !v[k].on} onChange={(ev) => set(k, { before: Number(ev.target.value) })} style={{ width: 80 }} />
                <span>{T("يوم", "days")}</span>
                <div style={{ flexBasis: "100%", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "4px 10px", margin: "2px 0 6px", borderInlineStart: "3px solid var(--bd)" }}>
                  <label style={{ display: "flex", gap: 5, alignItems: "center", fontWeight: 600 }}>
                    <input type="checkbox" checked={v[k].n.on} disabled={!edit} onChange={(ev) => setN(k, { on: ev.target.checked })} />{T("تنبيه الجرس — يوميًا حتى التجديد", "Daily bell until renewed")}
                  </label>
                  <span>{T("ابدأ قبل", "start")}</span>
                  <input type="number" min={0} max={3650} value={v[k].n.before} disabled={!edit || !v[k].n.on} onChange={(ev) => setN(k, { before: Number(ev.target.value) })} style={{ width: 70 }} />
                  <span>{T("يوم من الانتهاء", "days before")}</span>
                  <span style={{ color: "var(--mu)" }}>|</span>
                  {CH.map(([c, a2, e2]) => (
                    <label key={c} style={{ display: "flex", gap: 4, alignItems: "center", opacity: v[k].n.on ? 1 : 0.5 }}>
                      <input type="checkbox" disabled={!edit || !v[k].n.on} checked={v[k].n.ch.includes(c)} onChange={() => tog(k, "ch", c)} />{en ? e2 : a2}
                      {c === "email" && <span style={{ fontSize: 10, color: "var(--mu)" }}>({T("موقوف حاليًا", "off for now")})</span>}
                    </label>
                  ))}
                  <span style={{ color: "var(--mu)" }}>|</span><span>{T("يصل إلى:", "To:")}</span>
                  {TO.map(([c, a2, e2]) => (
                    <label key={c} style={{ display: "flex", gap: 4, alignItems: "center", opacity: v[k].n.on ? 1 : 0.5 }}>
                      <input type="checkbox" disabled={!edit || !v[k].n.on} checked={v[k].n.to.includes(c)} onChange={() => tog(k, "to", c)} />{en ? e2 : a2}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap", fontSize: 12.5 }}>
            <b>{T("مدة التجربة الافتراضية لكل الموظفين", "Default probation for all employees")}</b>
            <select value={[30, 60, 90, 180].includes(v.probation_default) ? v.probation_default : 90} disabled={!edit} onChange={(ev) => setV({ ...v, probation_default: Number(ev.target.value) })}>
              {[30, 60, 90, 180].map((d) => <option key={d} value={d}>{d} {T("يوم", "days")}</option>)}
            </select>
          </div>
          {edit && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" className="btn bpl bsm" disabled={busy} onClick={() => void save()}><i className="ti ti-device-floppy" /> {T("حفظ", "Save")}</button>
              <button type="button" className="btn bsm" disabled={busy} onClick={() => void runNow()}><i className="ti ti-player-play" /> {T("حفظ وتشغيل الآن", "Save and run now")}</button>
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 8 }}>
            {T("الإرسال تلقائي يوميًا الساعة 7:05 صباحًا بتوقيت الرياض.", "Sent automatically every day at 07:05 Riyadh time.")}
            {lastRun && <> {T("آخر تشغيل: ", "Last run: ")}<b dir="ltr">{lastRun.date}</b> — {lastRun.sent}</>}
          </div>
          {st.length > 0 && (
            <div style={{ marginTop: 10, maxHeight: 220, overflow: "auto", border: "1px solid var(--bd)", borderRadius: 8 }}>
              <table style={{ width: "100%", fontSize: 11.5 }}>
                <thead><tr><th>{T("التاريخ", "Date")}</th><th>{T("الموظف", "Employee")}</th><th>{T("التنبيه", "Alert")}</th><th>{T("الانتهاء", "Expiry")}</th><th>{T("المستلم", "To")}</th></tr></thead>
                <tbody>
                  {st.map((r, i) => (
                    <tr key={i}><td dir="ltr">{dmy(r.sent_at)}</td><td>{r.employee_name || "—"}</td><td>{r.label}</td><td dir="ltr">{dmy(r.expiry)}</td><td>{r.recipient_name || r.recipient}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
