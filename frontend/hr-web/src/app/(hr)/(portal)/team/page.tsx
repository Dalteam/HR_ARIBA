"use client";

// Team availability, tasks & meetings (توفر الفريق والمهام والاجتماعات) in the updated design's form (its
// pages/team/index.jsx), on OUR Stage 4 routes: /team/availability, /tasks (inbox / sent), POST /tasks and
// /tasks/{id}/update. Who appears is decided by the API (the caller's audience); a private leave type reaches this
// screen only as «إجازة», never its reason (BUSINESS_RULES, Stage 4). Refreshed every 90 s, as in the design.
// «Back to work» skips Friday and Saturday only (the design also skips official holidays).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/common/toast";
import { Modal } from "@/components/hr/modal";
import { PromptModal } from "@/components/hr/prompt-modal";
import { request } from "@/lib/api";
import { useLocale } from "@/lib/i18n/locale";

type Leave = { from: string; to: string; days: number; type: string };
type Person = { id: string; name: string; job: string | null; dept: string | null; leaves: Leave[] };
type Task = {
  id: string; kind: "task" | "meeting"; title: string; details: string | null; due_date: string | null; start_at: string | null; end_at: string | null;
  location: string | null; status: string; response_note: string | null; from_name: string | null; to_name: string | null;
};
type Merged = { from: string; to: string; types: string[]; days: number };

const LT: Record<string, [string, string]> = { annual: ["سنوية", "Annual"], sick: ["مرضية", "Sick"], emergency: ["طارئة", "Emergency"], death: ["وفاة", "Bereavement"], marriage: ["زواج", "Marriage"], maternity: ["وضع", "Maternity"], paternity: ["أبوة", "Paternity"], umrah: ["عمرة", "Umrah"], hajj: ["حج", "Hajj"], remote: ["عمل عن بعد", "Remote"] };
const D = (s: string) => { const p = String(s).slice(0, 10).split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addD = (s: string, n: number) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const fmt = (s: string | null) => { if (!s) return ""; const p = String(s).slice(0, 10).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; };
const isWork = (s: string) => { const w = D(s).getUTCDay(); return w !== 5 && w !== 6; };
const nextWork = (s: string) => { let d = addD(s, 1), i = 0; while (!isWork(d) && i++ < 10) d = addD(d, 1); return d; };
/** consecutive leaves (the next one starting on the next working day) count as one; remote work is not an absence */
function merge(ls: Leave[]): Merged[] {
  const a = ls.filter((l) => l.type !== "remote").map((l) => ({ from: String(l.from).slice(0, 10), to: String(l.to).slice(0, 10), types: [l.type], days: 0 })).sort((x, y) => (x.from < y.from ? -1 : 1));
  const out: Merged[] = [];
  a.forEach((l) => { const p = out[out.length - 1]; if (p && l.from <= nextWork(p.to)) { if (l.to > p.to) p.to = l.to; p.types = p.types.concat(l.types); } else out.push(l); });
  out.forEach((l) => { l.days = Math.round((D(l.to).getTime() - D(l.from).getTime()) / 864e5) + 1; });
  return out;
}
function stateOf(e: Person, day: string) {
  let cur: Merged | null = null, nxt: Merged | null = null;
  merge(e.leaves).forEach((l) => { if (!cur && l.from <= day && day <= l.to) cur = l; else if (!nxt && l.from > day) nxt = l; });
  const c = cur as Merged | null, n = nxt as Merged | null;
  return { cur: c, nxt: n, st: c ? "leave" : n && n.from <= addD(day, 14) ? "soon" : "avail" };
}
const Badge = ({ c, children }: { c: "g" | "r" | "a" | "b"; children: React.ReactNode }) => {
  const bg = { g: "rgba(34,197,94,.15)", r: "rgba(239,68,68,.15)", a: "rgba(245,158,11,.18)", b: "rgba(59,130,246,.15)" }[c];
  const fg = { g: "#16a34a", r: "#dc2626", a: "#d97706", b: "#2563eb" }[c];
  return <span style={{ background: bg, color: fg, padding: "2px 9px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
};
const Btn = ({ pri, style, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pri?: boolean }) => (
  <button type="button" {...p} style={{ cursor: "pointer", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", border: "1px solid " + (pri ? "transparent" : "var(--bd,#ccc)"), background: pri ? "var(--gr,#014D3D)" : "transparent", color: pri ? "#fff" : "var(--tx,#111)", ...style }} />
);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function TeamTasks() {
  const toast = useToast();
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (a: string, b: string) => (en ? b : a);
  const [S, setS] = useState<{ items: Person[] | null; today: string; allowed: boolean; inbox: Task[] | null; sent: Task[] | null; err: string }>({ items: null, today: "", allowed: false, inbox: null, sent: null, err: "" });
  const [tab, setTab] = useState("team");
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [compose, setCompose] = useState<"task" | "meeting" | null>(null);
  const [decl, setDecl] = useState<Task | null>(null);
  const refresh = useCallback(async () => {
    let err = "";
    const patch: Partial<typeof S> = {};
    try {
      const r = await request<{ items: Person[]; today: string; allowed: boolean }>("/team/availability");
      Object.assign(patch, { items: r.items, today: String(r.today).slice(0, 10), allowed: r.allowed });
    } catch (e) {
      err = errText(e);
      patch.items = [];
    }
    try {
      const [a, b] = await Promise.all([request<{ items: Task[] }>("/tasks", { query: { box: "inbox" } }), request<{ items: Task[] }>("/tasks", { query: { box: "sent" } })]);
      patch.inbox = a.items;
      patch.sent = b.items;
    } catch (e) {
      err = err || errText(e);
      patch.inbox = patch.inbox ?? [];
      patch.sent = patch.sent ?? [];
    }
    setS((s) => ({ ...s, ...patch, err }));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const iv = setInterval(() => void refresh(), 90000);
    return () => clearInterval(iv);
  }, [refresh]);
  const day = S.today;
  const rows = useMemo(() => (S.items ?? []).map((e) => ({ e, s: stateOf(e, day) })), [S.items, day]);
  const c = { avail: 0, leave: 0, soon: 0 } as Record<string, number>;
  rows.forEach((r) => { c[r.s.st]++; });
  const shown = rows.filter((r) => (f === "all" || (f === "avail" ? r.s.st !== "leave" : r.s.st === f)) && (!q.trim() || `${r.e.name} ${r.e.job ?? ""} ${r.e.dept ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const ids = Object.keys(sel).filter((k) => sel[k]);
  const lt = (t: string) => (LT[t] ? LT[t][en ? 1 : 0] : T("إجازة", "Leave"));
  const openN = (S.inbox ?? []).filter((t) => t.status === "open").length;
  const tabs: [string, string][] = [["team", T("الفريق والتوفر", "Team availability")], ["inbox", T("الوارد", "Inbox") + (openN ? " (" + openN + ")" : "")], ["sent", T("المرسل", "Sent")]];
  async function act(t: Task, st: string, note?: string) {
    try {
      await request(`/tasks/${t.id}/update`, { method: "POST", body: { status: st, note: note || null } });
      toast("✓ " + T("تم", "Done"), "ok");
      void refresh();
    } catch (e) {
      toast(errText(e), "err");
    }
  }
  const stBadge = (o: string) => (o === "open" ? <Badge c="a">{T("مفتوحة", "Open")}</Badge> : o === "done" ? <Badge c="g">{T("تم", "Done")}</Badge> : o === "accepted" ? <Badge c="g">{T("مقبول", "Accepted")}</Badge> : o === "declined" ? <Badge c="r">{T("اعتذار", "Declined")}</Badge> : <Badge c="r">{T("ملغي", "Cancelled")}</Badge>);
  const whenTxt = (t: Task) => (t.kind === "meeting" && t.start_at ? new Date(t.start_at).toLocaleString(en ? "en-GB" : "ar-EG", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : t.due_date ? T("الموعد: ", "Due: ") + fmt(t.due_date) : "");
  const card = (t: Task, inbox: boolean) => (
    <div key={t.id} style={{ border: "1px solid var(--bd,#ddd)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><div style={{ fontWeight: 800 }}>{t.kind === "meeting" ? "📅 " : "✓ "}{t.title}</div><div>{stBadge(t.status)}</div></div>
      <div style={{ fontSize: 12, color: "var(--mu,#666)", margin: "3px 0" }}>{inbox ? T("من: ", "From: ") + (t.from_name || "") : T("إلى: ", "To: ") + (t.to_name || "")} • {whenTxt(t)}{t.location ? " • " + t.location : ""}</div>
      {t.details && <div style={{ fontSize: 12.5, margin: "4px 0", whiteSpace: "pre-wrap" }}>{t.details}</div>}
      {t.response_note && <div style={{ fontSize: 11.5, color: "var(--mu,#666)" }}>{t.response_note}</div>}
      {inbox && t.status === "open" && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {t.kind === "meeting" ? <><Btn pri onClick={() => act(t, "accepted")}>{T("قبول", "Accept")}</Btn><Btn onClick={() => setDecl(t)}>{T("اعتذار", "Decline")}</Btn></> : <Btn pri onClick={() => act(t, "done")}>{T("تم الإنجاز", "Done")}</Btn>}
        </div>
      )}
      {!inbox && t.status === "open" && <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Btn onClick={() => act(t, "cancelled")}>{T("إلغاء", "Cancel")}</Btn></div>}
    </div>
  );
  const list = (arr: Task[] | null, inbox: boolean) => (!arr ? <div style={{ padding: 30, textAlign: "center", color: "var(--mu,#666)" }}>{T("جارٍ التحميل…", "Loading…")}</div> : !arr.length ? <div style={{ padding: 30, textAlign: "center", color: "var(--mu,#666)" }}>{T("لا شيء هنا", "Nothing here")}</div> : arr.map((t) => card(t, inbox)));
  return (
    <div id="TV_BODY">
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {tabs.map(([k, l]) => <button key={k} type="button" className="TV_TAB" onClick={() => setTab(k)} style={{ cursor: "pointer", padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700, fontFamily: "inherit", border: "1px solid var(--bd,#ccc)", background: tab === k ? "var(--gr,#014D3D)" : "transparent", color: tab === k ? "#fff" : "inherit" }}>{l}</button>)}
        <span style={{ flex: 1 }} /><Btn id="TV_REF" onClick={() => void refresh()}>⟳ {T("تحديث", "Refresh")}</Btn>
      </div>
      {S.err && <div style={{ background: "rgba(239,68,68,.12)", color: "#b91c1c", padding: "8px 10px", borderRadius: 8, fontSize: 12, marginBottom: 8 }}>{S.err}</div>}
      {tab === "team" && (!S.items ? <div style={{ padding: 30, textAlign: "center", color: "var(--mu,#666)" }}>{T("جارٍ التحميل…", "Loading…")}</div> : !S.allowed ? <div style={{ padding: 30, textAlign: "center", color: "var(--mu,#666)" }}>{T("هذه الصفحة للمدراء والإدارة (من لهم موظفون تابعون).", "This view is for managers (people with direct reports).")}</div> : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <Badge c="g">{T("متاح: ", "Available: ")}{c.avail + c.soon}</Badge><Badge c="r">{T("في إجازة: ", "On leave: ")}{c.leave}</Badge><Badge c="a">{T("سيبدأ إجازة خلال 14 يوم: ", "Leaving within 14 days: ")}{c.soon}</Badge>
            <input id="TV_Q" placeholder={T("بحث بالاسم أو الوظيفة…", "Search…")} value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 140, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--bd,#ccc)", background: "transparent", color: "inherit", fontFamily: "inherit" }} />
            <select id="TV_F" value={f} onChange={(e) => setF(e.target.value)} style={{ padding: 7, borderRadius: 8, border: "1px solid var(--bd,#ccc)", background: "var(--c2,#fff)", color: "inherit", fontFamily: "inherit" }}>
              {[["all", T("الكل", "All")], ["avail", T("المتاحون", "Available")], ["leave", T("في إجازة", "On leave")], ["soon", T("سيبدؤون إجازة قريباً", "Leaving soon")]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn id="TV_ALL" onClick={() => setSel(Object.fromEntries(shown.map((r) => [r.e.id, true])))}>{T("تحديد الظاهرين", "Select shown")}</Btn>
            <Btn id="TV_NONE" onClick={() => setSel({})}>{T("إلغاء التحديد", "Clear")}</Btn>
            <Btn pri id="TV_TASK" onClick={() => (ids.length ? setCompose("task") : toast(T("اختر موظفاً على الأقل", "Select at least one employee"), "err"))}>✓ {T("إرسال مهمة", "Send task")}{ids.length ? " (" + ids.length + ")" : ""}</Btn>
            <Btn pri id="TV_MEET" onClick={() => (ids.length ? setCompose("meeting") : toast(T("اختر موظفاً على الأقل", "Select at least one employee"), "err"))}>📅 {T("دعوة اجتماع", "Invite to meeting")}{ids.length ? " (" + ids.length + ")" : ""}</Btn>
          </div>
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {!shown.length && <tr><td style={{ padding: 20, textAlign: "center", color: "var(--mu,#666)" }}>{T("لا نتائج", "No results")}</td></tr>}
                {shown.map(({ e, s }) => (
                  <tr key={e.id} style={{ borderTop: "1px solid var(--bd,#e5e5e5)" }}>
                    <td style={{ padding: "9px 6px", width: 30 }}><input type="checkbox" className="TV_CK" checked={!!sel[e.id]} onChange={(ev) => setSel({ ...sel, [e.id]: ev.target.checked })} /></td>
                    <td style={{ padding: "9px 6px" }}><div style={{ fontWeight: 700 }}>{e.name}</div><div style={{ fontSize: 11.5, color: "var(--mu,#666)" }}>{[e.job, e.dept].filter(Boolean).join(" • ")}</div></td>
                    <td style={{ padding: "9px 6px" }}>{s.st === "leave" ? <Badge c="r">{T("في إجازة", "On leave")}</Badge> : s.st === "soon" ? <Badge c="a">{T("متاح — إجازة قريبة", "Available — leave soon")}</Badge> : <Badge c="g">{T("متاح", "Available")}</Badge>}</td>
                    <td style={{ padding: "9px 6px", fontSize: 12, color: "var(--mu,#555)" }}>
                      {s.cur ? <>{T("من ", "From ")}{fmt(s.cur.from)}{T(" إلى ", " to ")}{fmt(s.cur.to)} — <b>{s.cur.days}{T(" يوم", " days")}</b> ({lt(s.cur.types[0])}) • {T("يعود للعمل: ", "Back on: ")}<b>{fmt(nextWork(s.cur.to))}</b></>
                        : s.nxt ? <>{T("إجازته القادمة: من ", "Next leave: ")}{fmt(s.nxt.from)}{T(" إلى ", " to ")}{fmt(s.nxt.to)} — {s.nxt.days}{T(" يوم", " days")} ({lt(s.nxt.types[0])}) • {T("يعود: ", "Back: ")}{fmt(nextWork(s.nxt.to))}</> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ))}
      {tab === "inbox" && list(S.inbox, true)}
      {tab === "sent" && list(S.sent, false)}
      {compose && <Compose kind={compose} ids={ids} items={S.items ?? []} T={T} onClose={() => setCompose(null)} onSent={() => { setCompose(null); setSel({}); void refresh(); }} />}
      {decl && <PromptModal title={T("سبب الاعتذار", "Decline reason")} label={T("اختياري", "Optional")} confirmText={T("اعتذار", "Decline")} cancelText={T("إلغاء", "Cancel")} onClose={() => setDecl(null)} onConfirm={(v) => { const t = decl; setDecl(null); void act(t, "declined", v); }} />}
    </div>
  );
}

function Compose({ kind, ids, items, T, onClose, onSent }: { kind: "task" | "meeting"; ids: string[]; items: Person[]; T: (a: string, b: string) => string; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: "", details: "", start: "", end: "", loc: "", due: "" });
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const names = ids.map((i) => items.find((x) => x.id === i)?.name || i);
  const bad = kind === "meeting" && f.start ? ids.map((i) => items.find((x) => x.id === i)).filter((e): e is Person => !!e && !!stateOf(e, f.start.slice(0, 10)).cur).map((e) => e.name) : [];
  async function send(force: boolean) {
    if (!f.title.trim()) return toast(T("اكتب العنوان", "Enter a title"), "err");
    const body: Record<string, unknown> = { to: ids, kind, title: f.title.trim(), details: f.details.trim() || null };
    if (kind === "meeting") {
      if (!f.start) return toast(T("حدد وقت الاجتماع", "Pick the meeting time"), "err");
      if (bad.length && !force) return setAsk(true);
      body.start = f.start + ":00+03:00";
      if (f.end) body.end = f.end + ":00+03:00";
      body.location = f.loc.trim() || null;
    } else body.due = f.due || null;
    setBusy(true);
    try {
      const r = await request<{ sent: number }>("/tasks", { method: "POST", body });
      toast("✓ " + T("أُرسلت إلى ", "Sent to ") + (r.sent || ids.length) + T(" موظف", " employee(s)"), "ok");
      onSent();
    } catch (e) {
      setBusy(false);
      toast(errText(e), "err");
    }
  }
  return (
    <>
      <Modal width={460} onClose={onClose} title={kind === "meeting" ? "📅 " + T("دعوة اجتماع", "Meeting invitation") : "✓ " + T("إرسال مهمة", "Send a task")}
        footer={<><button type="button" className="btn" onClick={onClose}>{T("إلغاء", "Cancel")}</button><button type="button" className="btn bpl" id="TC_OK" disabled={busy} onClick={() => void send(false)}>{T("إرسال", "Send")}</button></>}>
        <div style={{ fontSize: 12, color: "var(--mu)", marginBottom: 10 }}>{T("إلى: ", "To: ")}{names.join("، ")}</div>
        <div className="fg">
          <div className="ff"><label>{T("العنوان", "Title")}</label><input id="TC_T" value={f.title} onChange={set("title")} /></div>
          <div className="ff"><label>{T("التفاصيل", "Details")}</label><textarea id="TC_D" rows={3} value={f.details} onChange={set("details")} /></div>
          {kind === "meeting" ? (
            <>
              <div><label>{T("بداية الاجتماع", "Start")}</label><input type="datetime-local" id="TC_S" value={f.start} onChange={set("start")} /></div>
              <div><label>{T("نهاية الاجتماع (اختياري)", "End (optional)")}</label><input type="datetime-local" value={f.end} onChange={set("end")} /></div>
              <div className="ff"><label>{T("المكان / الرابط", "Location / link")}</label><input value={f.loc} onChange={set("loc")} /></div>
            </>
          ) : (
            <div><label>{T("الموعد النهائي (اختياري)", "Due date (optional)")}</label><input type="date" id="TC_DUE" value={f.due} onChange={set("due")} /></div>
          )}
        </div>
        {bad.length > 0 && <div id="TC_W" style={{ fontSize: 12, color: "#b45309", marginTop: 8 }}>{T("⚠️ في إجازة وقت الاجتماع: ", "⚠️ On leave at that time: ")}{bad.join("، ")}</div>}
      </Modal>
      {ask && <PromptModal noInput title={T("تنبيه", "Warning")} message={T("⚠️ بعض المدعوين في إجازة وقت الاجتماع: ", "⚠️ Some invitees are on leave: ") + bad.join("، ") + " — " + T("هل تكمل الإرسال؟", "Send anyway?")} confirmText={T("إرسال", "Send")} cancelText={T("إلغاء", "Cancel")} onClose={() => setAsk(false)} onConfirm={() => { setAsk(false); void send(true); }} />}
    </>
  );
}

export default function Page() {
  const { lang } = useLocale();
  return (
    <div className="pg on" id="pg-team" style={{ padding: "12px 16px" }}>
      <div className="card" style={{ padding: 14 }}>
        <div className="ct" style={{ marginBottom: 10 }}><i className="ti ti-users-group" /> {lang === "en" ? "Team availability, tasks & meetings" : "توفر الفريق والمهام والاجتماعات"}</div>
        <TeamTasks />
      </div>
    </div>
  );
}
