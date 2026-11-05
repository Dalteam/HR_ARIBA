"use client";

// Announcements & greetings (الإعلانات والتهاني) in the updated design's form (its pages/announcements/index.jsx):
// send, automatic greetings, employees' occasions, and the sent log — on OUR Stage 7 routes (/announcements,
// /occasions, /settings/greetings, /settings/announcements). Sending, editing and deleting are HR-only (the API
// refuses anyone else). Adapted to our API: it knows 8 occasions (the design's other occasions are sent as «other» with
// the design's wording); it does not put each employee's name into a greeting, so {name} / {years} are taken out before
// sending; «one company» is sent to that company's current employees by name (our API wants the company's internal id,
// which hr-web does not receive); greeting texts of the automatic run are fixed (custom wording waits, lib/features.ts).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/common/toast";
import { DateField } from "@/components/common/date-time-field";
import { PageState } from "@/components/hr/not-built";
import { PromptModal } from "@/components/hr/prompt-modal";
import { request, type EmployeeListItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { listAllEmployees } from "@/lib/employees";
import { todayIso } from "@/lib/format";

type Occ = { k: string; ar: string; ic: string; t?: string; b?: string; ann?: boolean; auto?: boolean };
/** the design's occasion filter; `api` is what our API stores (it knows 8 occasions) */
const OCCASIONS: Occ[] = [
  { k: "announcement", ar: "إعلان عام", ic: "ti-speakerphone", ann: true },
  { k: "birthday", ar: "عيد ميلاد", ic: "ti-cake", auto: true, t: "كل عام وأنت بخير يا {name}", b: "تتمنى لك إدارة الموارد البشرية عامًا مليئًا بالصحة والنجاح والسعادة. كل عام وأنت بخير." },
  { k: "anniversary", ar: "سنوية التعيين", ic: "ti-confetti", auto: true, t: "{years} سنة معنا يا {name}", b: "نشكرك على جهودك وإخلاصك، ونتمنى لك دوام التوفيق في مسيرتك معنا." },
  { k: "graduation", ar: "تخرج", ic: "ti-school", t: "مبروك التخرج يا {name}", b: "نبارك لك التخرج ونتمنى لك مستقبلًا مشرقًا ومليئًا بالنجاح." },
  { k: "wedding", ar: "زواج", ic: "ti-rings", t: "مبروك الزواج يا {name}", b: "بارك الله لك وبارك عليك وجمع بينكما في خير. نتمنى لكما حياة سعيدة." },
  { k: "newborn", ar: "مولود جديد", ic: "ti-baby-carriage", t: "مبروك المولود الجديد يا {name}", b: "بارك الله لك في الموهوب وشكرت الواهب وبلغ أشدّه ورُزقت برّه." },
  { k: "promotion", ar: "ترقية", ic: "ti-star", t: "مبروك الترقية يا {name}", b: "نبارك لك الترقية، وهي ثمرة جهدك وتميزك. نتمنى لك المزيد من التقدم." },
  { k: "achievement", ar: "إنجاز / تميز", ic: "ti-trophy", t: "شكرًا على إنجازك يا {name}", b: "نقدّر إنجازك المتميز ونشكرك على عطائك." },
  { k: "recovery", ar: "سلامة / شفاء", ic: "ti-flower", t: "سلامتك يا {name}", b: "نسأل الله لك الشفاء العاجل وأن يلبسك ثوب الصحة والعافية." },
  { k: "condolence", ar: "تعزية", ic: "ti-feather", t: "خالص العزاء يا {name}", b: "عظّم الله أجرك وأحسن عزاءك وغفر لفقيدك، وإنا لله وإنا إليه راجعون." },
  { k: "eid_fitr", ar: "عيد الفطر", ic: "ti-moon", t: "عيد فطر مبارك", b: "كل عام وأنتم بخير، تقبّل الله منا ومنكم صالح الأعمال. عيدكم مبارك." },
  { k: "eid_adha", ar: "عيد الأضحى", ic: "ti-building-mosque", t: "عيد أضحى مبارك", b: "كل عام وأنتم بخير، وتقبّل الله طاعاتكم. عيدكم مبارك." },
  { k: "ramadan", ar: "رمضان", ic: "ti-moon-stars", t: "رمضان كريم", b: "نبارككم حلول شهر رمضان المبارك، أعاده الله علينا وعليكم بالخير واليمن والبركات." },
  { k: "national_day", ar: "اليوم الوطني", ic: "ti-flag", t: "كل عام والوطن بخير", b: "نهنئكم باليوم الوطني، حفظ الله الوطن وقيادته وشعبه." },
  { k: "appreciation", ar: "شكر وتقدير", ic: "ti-heart-handshake", t: "شكر وتقدير", b: "نشكر لكم جهودكم المبذولة وتفانيكم في العمل." },
  { k: "other", ar: "مناسبة أخرى", ic: "ti-gift", t: "تهنئة يا {name}", b: "تهنئة من إدارة الموارد البشرية ونتمنى لك دوام التوفيق والسعادة." },
];
const API_OCC = new Set(["birthday", "anniversary", "graduation", "wedding", "newborn", "promotion", "achievement", "other"]);
const occ = (k: string | null) => OCCASIONS.find((o) => o.k === k) ?? OCCASIONS[OCCASIONS.length - 1];
/** occasions HR can register on an employee by date (our API: graduation, wedding, newborn, promotion, achievement, other) */
const REGISTERABLE = OCCASIONS.filter((o) => !o.ann && !o.auto && API_OCC.has(o.k));
/** our API sends one text to everyone, so the design's per-person placeholders are taken out */
const plain = (s: string) => s.replace(/\s*يا \{name\}/g, "").replace(/\{years\} سنة/g, "سنوات").replace(/\{name\}|\{years\}/g, "").replace(/\s{2,}/g, " ").trim();
const fmt = (d: string) => { const x = new Date(d); return isNaN(x.getTime()) ? "" : x.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const INP: React.CSSProperties = { width: "100%", boxSizing: "border-box" };
const Lb = ({ children }: { children: React.ReactNode }) => <label style={{ display: "block", fontSize: 11.5, color: "var(--mu)", margin: "0 0 3px" }}>{children}</label>;

type AnnRow = { id: string; kind: "announcement" | "greeting"; occasion: string | null; title: string; body: string; audience: string; pinned: boolean; expires_on: string | null; source: string; sent_count: number; created_at: string };
type OccRow = { id: string; employee_id: string; name: string; occasion: string; occ_date: string; yearly: boolean; note: string | null };

export default function Page() {
  const { can: may } = useAuth();
  const can = may("employees", "edit");
  const [tab, setTab] = useState("send");
  const [emps, setEmps] = useState<EmployeeListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listAllEmployees({ tab: "active", sort: "name_ar" }).then((p) => setEmps(p.items)).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const employers = useMemo(() => [...new Set((emps ?? []).map((e) => e.workplace?.name_ar).filter(Boolean))] as string[], [emps]);
  const tabs: [string, string, string][] = [["send", "ti-send", "إرسال إعلان / تهنئة"], ["auto", "ti-robot", "التهاني التلقائية"], ["occ", "ti-calendar-heart", "مناسبات الموظفين"], ["log", "ti-history", "سجل المُرسَل"]];
  if (!emps) return <div className="pg on" id="pg-ann"><PageState loading={!error} error={error} /></div>;
  return (
    <div className="pg on" id="pg-ann">
      <div className="tabs" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {tabs.map((t) => <button key={t[0]} type="button" className={"btn bsm" + (tab === t[0] ? " bpl" : "")} id={"ANN_TAB_" + t[0]} onClick={() => setTab(t[0])}><i className={"ti " + t[1]} /> {t[2]}</button>)}
      </div>
      {tab === "send" && <Send can={can} act={emps} employers={employers} />}
      {tab === "auto" && <Auto can={can} />}
      {tab === "occ" && <Occasions can={can} act={emps} />}
      {tab === "log" && <Log can={can} />}
    </div>
  );
}

function EmpPick({ act, ids, setIds }: { act: EmployeeListItem[]; ids: string[]; setIds: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const list = act.filter((e) => !q || `${e.name_ar} ${e.name_en ?? ""} ${e.emp_no}`.toLowerCase().includes(q.toLowerCase()));
  const set = new Set(ids);
  const tog = (id: string) => setIds(set.has(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  return (
    <div style={{ border: "1px solid var(--bd)", borderRadius: 8, padding: 8 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الرقم" style={{ flex: 1, minWidth: 160 }} />
        <button type="button" className="btn bsm" onClick={() => setIds([...new Set([...ids, ...list.map((e) => e.id)])])}>تحديد الكل</button>
        <button type="button" className="btn bsm" onClick={() => setIds([])}>مسح</button>
      </div>
      <div style={{ maxHeight: 180, overflow: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 4 }}>
        {list.map((e) => <label key={e.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, cursor: "pointer" }}><input type="checkbox" checked={set.has(e.id)} onChange={() => tog(e.id)} /> {e.name_ar || e.name_en}</label>)}
      </div>
      <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 4 }}>المحدد: {ids.length}</div>
    </div>
  );
}

function Send({ can, act, employers }: { can: boolean; act: EmployeeListItem[]; employers: string[] }) {
  const toast = useToast();
  const [k, setK] = useState("announcement");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [aud, setAud] = useState("all");
  const [emp, setEmp] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [pin, setPin] = useState(false);
  const [exp, setExp] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [mail, setMail] = useState<boolean | null>(null);
  useEffect(() => {
    request<{ email: boolean }>("/settings/announcements").then((r) => setMail(r.email)).catch(() => setMail(null));
  }, []);
  const isAnn = k === "announcement";
  const pickOcc = (v: string) => {
    setK(v);
    const x = occ(v);
    if (x.t) { setTitle(plain(x.t)); setBody(plain(x.b ?? "")); } else if (v === "announcement") { setTitle(""); setBody(""); }
  };
  const company = emp || employers[0] || "";
  const targets = aud === "all" ? act.map((e) => e.id) : aud === "employer" ? act.filter((e) => e.workplace?.name_ar === company).map((e) => e.id) : ids;
  function check() {
    if (!title.trim()) return toast("اكتب العنوان", "err");
    if (aud === "employer" && !targets.length) return toast("اختر الشركة", "err");
    if (aud === "employees" && !ids.length) return toast("اختر موظفًا واحدًا على الأقل", "err");
    setAsk(true);
  }
  async function send() {
    setAsk(false);
    setBusy(true);
    try {
      const res = await request<{ sent: number }>("/announcements", {
        method: "POST",
        body: {
          kind: isAnn ? "announcement" : "greeting", occasion: isAnn ? null : API_OCC.has(k) ? k : "other",
          title: plain(title), body: plain(body), audience: aud === "all" ? "all" : "employees", employee_ids: aud === "all" ? undefined : targets,
          pinned: isAnn && pin, expires_on: isAnn && exp ? exp : null,
        },
      });
      const what = isAnn ? "الإعلان" : "التهنئة";
      if (res.sent === 0) toast("تعذّر إرسال " + what + " إلى أي موظف — الموظفون المختارون غير مفعّلين أو منتهية خدمتهم", "err");
      else {
        toast("تم إرسال " + what + " إلى " + res.sent + " موظف (إشعار في تطبيق الموظف)", "ok");
        setTitle("");
        setBody("");
      }
    } catch (e) {
      toast((e instanceof Error ? e.message : "تعذر الإرسال"), "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card">
      <div className="ch"><div className="ct"><i className="ti ti-send" /> <span>إرسال إلى تطبيق الموظف</span></div></div>
      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        <div>
          <Lb>النوع / المناسبة (فلتر)</Lb>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {OCCASIONS.map((x) => <button key={x.k} type="button" className={"btn bsm" + (k === x.k ? " bpl" : "")} onClick={() => pickOcc(x.k)}><i className={"ti " + x.ic} aria-hidden /> {x.ar}</button>)}
          </div>
        </div>
        <div>
          <Lb>العنوان {!isAnn && <span style={{ color: "var(--mu)" }}>— نص واحد يصل لكل المستلمين (إدراج اسم كل موظف تلقائيًا غير متاح بعد)</span>}</Lb>
          <input id="ANN_TITLE" style={INP} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={isAnn ? "مثال: إجازة العيد من 28 مارس إلى 5 أبريل" : plain(occ(k).t ?? "")} />
        </div>
        <div><Lb>النص</Lb><textarea id="ANN_BODY" style={{ ...INP, minHeight: 90 }} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="تفاصيل الإعلان أو نص التهنئة" /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
          <div>
            <Lb>المستلمون</Lb>
            <select style={INP} value={aud} onChange={(e) => setAud(e.target.value)} id="ANN_AUD">
              <option value="all">كل الموظفين</option><option value="employer">شركة / نطاق عمل</option><option value="employees">موظفون محددون</option>
            </select>
          </div>
          {aud === "employer" && <div><Lb>الشركة</Lb><select style={INP} value={company} onChange={(e) => setEmp(e.target.value)}>{employers.map((x) => <option key={x}>{x}</option>)}</select></div>}
          {isAnn && <div><Lb>ينتهي عرضه في (اختياري)</Lb><DateField value={exp} onChange={(v) => setExp(v)} style={INP} /></div>}
        </div>
        {aud === "employees" && <EmpPick act={act} ids={ids} setIds={setIds} />}
        {isAnn && <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}><input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> تثبيت الإعلان أعلى الصفحة الرئيسية في تطبيق الموظف حتى ينتهي</label>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn bpl" id="ANN_SEND" disabled={busy || !can} onClick={check}><i className="ti ti-send" /> {busy ? "جاري الإرسال…" : "إرسال الآن"}</button>
          <span style={{ fontSize: 12, color: "var(--mu)" }}>سيصل إلى <b>{targets.length}</b> موظف: إشعار في الجرس + بطاقة في الرئيسية{isAnn ? "" : " (يومًا واحدًا)"}{isAnn ? " + بريد إلكتروني إذا كانت إشعارات البريد مفعّلة" : " (لا تُرسل التهاني بالبريد الإلكتروني)"}.</span>
          {!can && <span className="b br">للاطلاع فقط — لا توجد صلاحية إرسال</span>}
        </div>
        {can && mail !== null && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--mu)" }}>
            <input type="checkbox" checked={mail} onChange={(e) => { const v = e.target.checked; setMail(v); request("/settings/announcements", { method: "PUT", body: { email: v } }).then(() => toast("تم الحفظ", "ok")).catch((x) => toast(String(x instanceof Error ? x.message : x), "err")); }} />
            إرسال الإعلانات بالبريد الإلكتروني أيضًا عند تشغيل البريد (البريد متوقف حاليًا، ولا تُرسل التهاني بالبريد أبدًا)
          </label>
        )}
      </div>
      {ask && <PromptModal noInput title="تأكيد الإرسال" message={"إرسال " + (isAnn ? "الإعلان" : "التهنئة") + " إلى " + targets.length + " موظف؟"} confirmText="إرسال" onClose={() => setAsk(false)} onConfirm={() => void send()} />}
    </div>
  );
}

function Auto({ can }: { can: boolean }) {
  const toast = useToast();
  const [c, setC] = useState<{ enabled: boolean; birthday: boolean; anniversary: boolean; custom: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // Stage 16 (S4): HR's own greeting texts; empty = the built-in text, {name} = first name, {years} = years of service
  type Tpl = Record<"birthday" | "anniversary", { t: string; b: string }>;
  const [tpl, setTpl] = useState<Tpl>({ birthday: { t: "", b: "" }, anniversary: { t: "", b: "" } });
  useEffect(() => {
    request<{ enabled: boolean; birthday: boolean; anniversary: boolean; custom: boolean }>("/settings/greetings").then(setC).catch(() => setC(null));
    request<Tpl>("/settings/greeting-templates").then(setTpl).catch(() => undefined);
  }, []);
  async function save(next: NonNullable<typeof c>) {
    setBusy(true);
    try {
      setC(await request("/settings/greetings", { method: "PUT", body: next }));
      setTpl(await request<Tpl>("/settings/greeting-templates", { method: "PUT", body: tpl }));
      toast("تم حفظ إعداد التهاني التلقائية", "ok");
    } catch (e) {
      toast((e instanceof Error ? e.message : String(e)), "err");
    } finally {
      setBusy(false);
    }
  }
  async function runNow() {
    setBusy(true);
    try {
      const r = await request<{ sent: number }>("/occasions/run-auto", { method: "POST" });
      toast(r.sent ? "أُرسلت " + r.sent + " تهنئة اليوم" : "لا توجد مناسبات اليوم (أو أُرسلت تهانيها مسبقًا، أو الإرسال التلقائي موقوف)", "ok");
    } catch (e) {
      toast((e instanceof Error ? e.message : String(e)), "err");
    } finally {
      setBusy(false);
    }
  }
  if (!c) return <div className="card" style={{ padding: 14 }}>جاري التحميل…</div>;
  return (
    <div className="card">
      <div className="ch"><div className="ct"><i className="ti ti-robot" /> <span>التهاني التلقائية</span></div></div>
      <div style={{ padding: 12, display: "grid", gap: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
          <input type="checkbox" id="OCC_ON" checked={c.enabled} disabled={!can || busy} onChange={(e) => void save({ ...c, enabled: e.target.checked })} /> تفعيل الإرسال التلقائي{" "}
          {c.enabled ? <span className="b bg">مُفعّل</span> : <span className="b br">موقوف — لن يُرسل شيء إلا يدويًا</span>}
        </label>
        <div style={{ fontSize: 12, color: "var(--mu)", lineHeight: 1.8 }}>عند التفعيل تصل كلَّ موظف تهنئة <b>في يوم المناسبة</b> تلقائيًا (مرة واحدة في السنة لكل مناسبة)، وتُنشأ عند أول دخول لأي حساب من الموارد البشرية إلى البوابة في ذلك اليوم.</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {([["birthday", "ti-cake", "عيد الميلاد (من تاريخ الميلاد)"], ["anniversary", "ti-confetti", "سنوية التعيين (من تاريخ المباشرة)"], ["custom", "ti-school", "المناسبات المسجّلة للموظفين (تخرج، زواج، مولود…)"]] as const).map(([k, ic, l]) => (
            <label key={k} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={c[k]} disabled={!can || busy} onChange={(e) => setC({ ...c, [k]: e.target.checked })} /> <i className={"ti " + ic} aria-hidden /> {l}</label>
          ))}
        </div>
        {([["birthday", "ti-cake", "نص تهنئة الميلاد"], ["anniversary", "ti-confetti", "نص سنوية التعيين"]] as const).map(([k, ic, l]) => (
          <div key={k} style={{ border: "1px solid var(--bd)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
            <b style={{ fontSize: 13 }}><i className={"ti " + ic} aria-hidden /> {l}</b>
            <input style={INP} disabled={!can || busy} maxLength={200} value={tpl[k].t} placeholder={occ(k).t} onChange={(e) => setTpl({ ...tpl, [k]: { ...tpl[k], t: e.target.value } })} />
            <textarea style={{ ...INP, minHeight: 60 }} disabled={!can || busy} maxLength={2000} value={tpl[k].b} placeholder={occ(k).b} onChange={(e) => setTpl({ ...tpl, [k]: { ...tpl[k], b: e.target.value } })} />
            <div style={{ fontSize: 11, color: "var(--mu)" }}>{"اتركه فارغًا لاستخدام النص الافتراضي. {name} = الاسم الأول" + (k === "anniversary" ? "، {years} = عدد السنوات" : "") + "."}</div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn bpl" disabled={busy || !can} onClick={() => void save(c)}><i className="ti ti-device-floppy" /> حفظ</button>
          <button type="button" className="btn" disabled={busy || !can} onClick={runNow}><i className="ti ti-player-play" /> تشغيل الآن (تهاني اليوم)</button>
          <button type="button" className="btn" disabled={busy || !can} onClick={() => { setC({ ...c, birthday: false, anniversary: false, custom: false }); setTpl({ birthday: { t: "", b: "" }, anniversary: { t: "", b: "" } }); }}>استرجاع الافتراضي</button>
        </div>
      </div>
    </div>
  );
}

function Occasions({ can, act }: { can: boolean; act: EmployeeListItem[] }) {
  const toast = useToast();
  const [list, setList] = useState<OccRow[] | null>(null);
  const [f, setF] = useState({ emp: "", k: "graduation", d: todayIso(), y: false, note: "" });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const load = useCallback(() => {
    request<{ items: OccRow[] }>("/occasions").then((r) => setList(r.items)).catch(() => setList([]));
  }, []);
  useEffect(() => load(), [load]);
  async function add() {
    if (!f.emp) return toast("اختر الموظف", "err");
    setBusy(true);
    try {
      await request("/occasions", { method: "POST", body: { employee_id: f.emp, occasion: f.k, occ_date: f.d, yearly: f.y, note: f.note || null } });
      toast("تم تسجيل المناسبة — ستُرسل التهنئة تلقائيًا في يومها (إذا كانت التهاني التلقائية مفعّلة)", "ok");
      setF({ ...f, note: "" });
      load();
    } catch (e) {
      toast((e instanceof Error ? e.message : String(e)), "err");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await request(`/occasions/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      toast((e instanceof Error ? e.message : String(e)), "err");
    }
  }
  return (
    <div className="card">
      <div className="ch"><div className="ct"><i className="ti ti-calendar-heart" /> <span>مناسبات الموظفين المسجّلة</span></div></div>
      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 12, color: "var(--mu)", lineHeight: 1.8 }}>سجّل مناسبة لموظف بتاريخها (تخرج، زواج، مولود، ترقية…) وستُرسل له تهنئة <b>تلقائيًا في ذلك اليوم</b> إذا كانت «التهاني التلقائية» مفعّلة. خيار «تتكرر سنويًا» مناسب لمناسبة مثل ذكرى الزواج. أما عيد الميلاد وسنوية التعيين فيُحسبان من بيانات الموظف تلقائيًا، فلا حاجة إلى تسجيلهما.</div>
        {can && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, alignItems: "end" }}>
            <div><Lb>الموظف</Lb><select style={INP} value={f.emp} onChange={(e) => setF({ ...f, emp: e.target.value })}><option value="">— اختر —</option>{act.map((e) => <option key={e.id} value={e.id}>{e.name_ar || e.name_en}</option>)}</select></div>
            <div><Lb>المناسبة</Lb><select style={INP} value={f.k} onChange={(e) => setF({ ...f, k: e.target.value })}>{REGISTERABLE.map((o) => <option key={o.k} value={o.k}>{o.ar}</option>)}</select></div>
            <div><Lb>التاريخ</Lb><DateField value={f.d} onChange={(v) => setF({ ...f, d: v })} style={INP} /></div>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, paddingBottom: 6 }}><input type="checkbox" checked={f.y} onChange={(e) => setF({ ...f, y: e.target.checked })} /> تتكرر سنويًا</label>
            <div style={{ gridColumn: "1/-1" }}><Lb>ملاحظة (اختياري)</Lb><input style={INP} maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            <button type="button" className="btn bpl bsm" disabled={busy} onClick={add}><i className="ti ti-plus" /> تسجيل</button>
          </div>
        )}
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr><th>الموظف</th><th>المناسبة</th><th>التاريخ</th><th>سنوي</th><th>ملاحظة</th><th /></tr></thead>
            <tbody>
              {list === null ? <tr><td colSpan={6} style={{ padding: 14, textAlign: "center" }}>جاري التحميل…</td></tr>
                : !list.length ? <tr><td colSpan={6} style={{ padding: 14, textAlign: "center", color: "var(--mu)" }}>لا توجد مناسبات مسجّلة</td></tr>
                : list.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td><td><i className={"ti " + occ(r.occasion).ic} aria-hidden /> {occ(r.occasion).ar}</td><td>{String(r.occ_date).slice(0, 10)}</td><td>{r.yearly ? "نعم" : "—"}</td><td>{r.note || ""}</td>
                    <td>{can && <button type="button" className="btn bsm" onClick={() => setDel(r.id)}><i className="ti ti-trash" /></button>}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {del && <PromptModal noInput danger title="حذف المناسبة" message="حذف المناسبة؟" confirmText="حذف" onClose={() => setDel(null)} onConfirm={() => { const id = del; setDel(null); void remove(id); }} />}
    </div>
  );
}

function Log({ can }: { can: boolean }) {
  const toast = useToast();
  const [list, setList] = useState<AnnRow[] | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const load = useCallback(() => {
    request<{ items: AnnRow[] }>("/announcements").then((r) => setList(r.items)).catch(() => setList([]));
  }, []);
  useEffect(() => load(), [load]);
  async function remove(id: string) {
    try {
      const r = await request<{ removed: number }>(`/announcements/${id}`, { method: "DELETE" });
      toast("أُزيل من تطبيق الموظف وحُذفت " + r.removed + " إشعارات منه", "ok");
      load();
    } catch (e) {
      toast((e instanceof Error ? e.message : String(e)), "err");
    }
  }
  const aud = (r: AnnRow) => (r.audience === "all" ? "الكل" : r.audience === "employer" ? "شركة" : "موظفون محددون");
  return (
    <div className="card">
      <div className="ch"><div className="ct"><i className="ti ti-history" /> <span>سجل الإعلانات والتهاني المُرسَلة</span></div><button type="button" className="btn bsm" onClick={load}>تحديث</button></div>
      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr><th>التاريخ</th><th>النوع</th><th>العنوان</th><th>المستلمون</th><th>المصدر</th><th /></tr></thead>
          <tbody>
            {list === null ? <tr><td colSpan={6} style={{ padding: 14, textAlign: "center" }}>جاري التحميل…</td></tr>
              : !list.length ? <tr><td colSpan={6} style={{ padding: 14, textAlign: "center", color: "var(--mu)" }}>لا يوجد</td></tr>
              : list.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.created_at)}</td>
                  <td>{r.kind === "greeting" ? <><i className={"ti " + occ(r.occasion).ic} aria-hidden /> {occ(r.occasion).ar}</> : <><i className="ti ti-speakerphone" aria-hidden /> إعلان{r.pinned && <> <i className="ti ti-pin" aria-hidden title="مثبّت" /></>}</>}</td>
                  <td title={r.body}>{r.title}</td>
                  <td>{aud(r)} ({r.sent_count})</td>
                  <td>{r.source === "auto" ? <span className="b bb">تلقائي</span> : "يدوي"}</td>
                  <td>{can && <button type="button" className="btn bsm" title="إخفاء من تطبيق الموظف" onClick={() => setDel(r.id)}><i className="ti ti-eye-off" /></button>}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {del && <PromptModal noInput danger title="إخفاء من تطبيق الموظف" message="يختفي من بطاقة الرئيسية وقائمة الموظفين، وتُحذف إشعاراته من الجرس." confirmText="إخفاء" onClose={() => setDel(null)} onConfirm={() => { const id = del; setDel(null); void remove(id); }} />}
    </div>
  );
}
