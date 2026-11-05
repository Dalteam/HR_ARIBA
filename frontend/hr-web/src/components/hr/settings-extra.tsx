"use client";

// Settings ▸ the design's BrandCard, PunchCard, LetterheadCard and MailCard on OUR Stage 16 routes. Saving needs
// `settings: edit` (my own mailbox: any HR-portal user); the API checks it. Colours by a plain picker with the design's
// presets (owner, 3 Nov 2026: the server never fetches a website). Mailboxes keep no password: it stays on the server.
import { useEffect, useState } from "react";
import { useToast } from "@/components/common/toast";
import { ApiError, request } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { applyBrand, validHex } from "@/lib/brand";
import { useLocale } from "@/lib/i18n/locale";
import { getLetterhead, putLetterhead, setLetterheadCache, type Letterhead, type LetterheadMode } from "@/lib/letterhead";

const card: React.CSSProperties = { marginTop: 12, maxWidth: 900 };
const note: React.CSSProperties = { fontSize: 11.5, color: "var(--mu)", lineHeight: 1.7, marginBottom: 8 };
const err = (e: unknown) => (e instanceof ApiError ? e.message : String(e));
const useT = () => {
  const { lang } = useLocale();
  return (ar: string, en: string) => (lang === "en" ? en : ar);
};

/** A picture as a data URI, scaled to fit `maxW` × `maxH` (PNG keeps transparency; JPEG keeps a page small). */
function readImage(file: File, maxW: number, maxH: number, type: "image/png" | "image/jpeg"): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("تعذر قراءة الصورة"));
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => rej(new Error("تعذر قراءة الصورة"));
      im.onload = () => {
        const sc = Math.min(1, maxW / im.width, maxH / im.height);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.width * sc));
        c.height = Math.max(1, Math.round(im.height * sc));
        c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL(type, 0.86));
      };
      im.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}

// ------------------------------------------------------------------------------------------- brand colours (S1)

const PRESETS: [string, string, string, string][] = [
  ["#014D3D", "#F4F0E4", "الأخضر الأصلي", "Original green"], ["#1E3A8A", "#EAF0FA", "أزرق", "Blue"],
  ["#7C2D12", "#FBF0E6", "بني", "Brown"], ["#581C87", "#F3EBFA", "بنفسجي", "Purple"],
  ["#0F766E", "#E8F5F3", "تركواز", "Teal"], ["#111827", "#EEEFF2", "رمادي داكن", "Slate"],
];
type Colours = { custom: boolean; p: string | null; s: string | null; a: string };

export function BrandColoursCard() {
  const T = useT();
  const toast = useToast();
  const edit = useAuth().can("settings", "edit");
  const [v, setV] = useState({ p: "#014D3D", s: "#F4F0E4", a: "" });
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    request<Colours>("/settings/brand-colors").then((c) => {
      setCustom(c.custom);
      if (c.custom && c.p && c.s) setV({ p: c.p, s: c.s, a: c.a || "" });
    }).catch((e) => toast(err(e), "err"));
  }, [toast]);
  const ok = validHex(v.p) && validHex(v.s) && (!v.a || validHex(v.a));

  async function save(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    try {
      const c = await request<Colours>("/settings/brand-colors", { method: "PUT", body });
      setCustom(c.custom);
      applyBrand(c.custom ? { p: c.p ?? undefined, s: c.s ?? undefined, a: c.a } : null);
      toast("✓ " + msg, "ok");
    } catch (e) {
      toast(err(e), "err");
    } finally {
      setBusy(false);
    }
  }
  const field = (k: "p" | "s" | "a", ar: string, en: string) => (
    <label style={{ display: "grid", gap: 4, fontSize: 11.5, fontWeight: 600 }}>
      {T(ar, en)}
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="color" value={validHex(v[k]) ? v[k] : "#29B35E"} disabled={!edit} onChange={(e) => setV({ ...v, [k]: e.target.value.toUpperCase() })} style={{ width: 44, height: 32, padding: 0 }} />
        <input value={v[k]} disabled={!edit} placeholder={k === "a" ? T("تلقائي", "Auto") : ""} onChange={(e) => setV({ ...v, [k]: e.target.value.trim() })} style={{ width: 96, direction: "ltr" }} />
      </span>
    </label>
  );
  return (
    <div className="card" style={card} id="BR_CARD">
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-palette" /> {T("ألوان الهوية", "Brand colours")}</div>
      <div style={note}>{T("ألوان البوابة وتطبيق الموظف وصفحة الدخول. الحالي: ", "The portal, employee-app and sign-in colours. Now: ")}<b>{custom ? T("ألوان مخصّصة", "custom colours") : T("الألوان الأصلية", "the original colours")}</b></div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {PRESETS.map(([p, s, ar, en]) => (
          <button key={p} type="button" className="btn bsm" disabled={!edit} onClick={() => setV({ p, s, a: "" })} title={T(ar, en)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, background: p, border: "1px solid rgba(0,0,0,.2)" }} />
            <span style={{ width: 16, height: 16, borderRadius: 4, background: s, border: "1px solid rgba(0,0,0,.2)" }} />
            {T(ar, en)}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {field("p", "اللون الأساسي", "Primary")}
        {field("s", "لون الخلفية", "Background")}
        {field("a", "لون التمييز (اختياري)", "Accent (optional)")}
      </div>
      {edit && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn bpl" disabled={busy || !ok} onClick={() => save(v, T("تم حفظ ألوان الهوية — تظهر لدى الجميع", "Brand colours saved — everyone sees them"))}><i className="ti ti-device-floppy" /> {T("حفظ", "Save")}</button>
          <button type="button" className="btn" disabled={busy || !custom} onClick={() => save({ reset: true }, T("أُعيدت الألوان الأصلية", "Original colours restored"))}>{T("رجوع للألوان الأصلية", "Back to the original colours")}</button>
          {!ok && <span style={{ fontSize: 11, color: "var(--rd)" }}>{T("اكتب الألوان بصيغة #RRGGBB", "Write the colours as #RRGGBB")}</span>}
        </div>
      )}
    </div>
  );
}

/** The employee app follows the portal colours: its own palette would widen /public/brand (needs a decision). */
export function AppColoursCard() {
  const T = useT();
  return (
    <div className="card" style={card}>
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-palette" /> {T("ألوان تطبيق الموظف", "Employee-app colours")}</div>
      <div className="al alb" style={{ margin: 0 }}><i className="ti ti-info-circle" /><div>{T("تطبيق الموظف يتبع «ألوان الهوية» في تبويب بيانات الشركة. ألوان منفصلة للتطبيق تحتاج قرارًا (لأنها تُرسَل قبل تسجيل الدخول).", "The employee app follows «Brand colours» under Company. Separate app colours need a decision (they are sent before sign-in).")}</div></div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- punch logo (S2)

export function PunchLogoCard() {
  const T = useT();
  const toast = useToast();
  const edit = useAuth().can("settings", "edit");
  const [data, setData] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    request<{ data: string }>("/settings/punch-logo").then((r) => setData(r.data)).catch((e) => toast(err(e), "err"));
  }, [toast]);
  async function save(next: string, msg: string) {
    setBusy(true);
    try {
      setData((await request<{ data: string }>("/settings/punch-logo", { method: "PUT", body: { data: next } })).data);
      toast("✓ " + msg, "ok");
    } catch (e) {
      toast(err(e), "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card" style={card} id="PW_CARD">
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-fingerprint" /> {T("شعار خلف زر البصمة (تطبيق الموظف)", "Logo behind the punch button (employee app)")}</div>
      <div style={note}>{T("صورة باهتة خلف دائرة الحضور والانصراف في تطبيق الموظف. يفضَّل PNG بخلفية شفافة. يظهر في التطبيق خلال دقائق.", "A faint image behind the check-in circle in the employee app. A transparent PNG works best. Shows in the app within minutes.")}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 96, height: 96, borderRadius: "50%", border: "1px dashed var(--bd)", display: "grid", placeItems: "center", overflow: "hidden", background: "var(--c2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a saved data: URI */}
          {data ? <img src={data} alt="" style={{ maxWidth: "80%", maxHeight: "80%", opacity: 0.55 }} /> : <span style={{ fontSize: 11, color: "var(--mu)" }}>{T("بدون شعار", "No logo")}</span>}
        </div>
        {edit && (
          <>
            <label className="btn bpl bsm" style={{ cursor: "pointer" }}>
              <i className="ti ti-upload" /> {T("اختيار صورة", "Choose an image")}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try { await save(await readImage(f, 520, 520, "image/png"), T("تم تغيير الشعار", "Logo changed")); } catch (x) { toast(err(x), "err"); }
              }} />
            </label>
            <button type="button" className="btn bsm" disabled={busy || !data} onClick={() => save("", T("أُزيل الشعار", "Logo removed"))}>{T("إزالة", "Remove")}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------- letterhead (S3)

export function LetterheadCard() {
  const T = useT();
  const toast = useToast();
  const edit = useAuth().can("settings", "edit");
  const [lh, setLh] = useState<Letterhead | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getLetterhead().then(setLh).catch((e) => toast(err(e), "err"));
  }, [toast]);
  const mode: LetterheadMode | "ariba" = !lh || !lh.mode || (lh.mode === "hf" && lh.preset === "ariba") ? "ariba" : lh.mode;

  async function save(body: Parameters<typeof putLetterhead>[0], msg: string) {
    setBusy(true);
    try {
      const next = await putLetterhead(body);
      setLh(next);
      setLetterheadCache(next); // the next print uses it at once
      toast("✓ " + msg, "ok");
    } catch (e) {
      toast(err(e), "err");
    } finally {
      setBusy(false);
    }
  }
  const upload = (field: "page" | "head" | "foot") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !lh) return;
    try {
      const data = field === "page" ? await readImage(f, 1240, 1754, "image/jpeg") : await readImage(f, 1800, field === "head" ? 700 : 500, "image/png");
      const base = { top: lh.top ?? 42, bottom: lh.bottom ?? 30 };
      if (field === "page") await save({ mode: "page", page: data, ...base }, T("تم حفظ صورة الورقة", "Page image saved"));
      else await save({ mode: "hf", head: field === "head" ? data : lh.head || "", foot: field === "foot" ? data : lh.foot || "", ...base }, T("تم حفظ الصورة", "Image saved"));
    } catch (x) {
      toast(err(x), "err");
    }
  };
  const opt = (m: LetterheadMode | "ariba", ar: string, en: string) => (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, padding: "3px 0" }}>
      <input type="radio" name="LH_MODE" checked={mode === m} disabled={!edit || busy} onChange={() => {
        if (m === "ariba") void save({ mode: "hf", preset: "ariba" }, T("تم تفعيل ورق أريبا الجاهز", "Ariba letterhead enabled"));
        else if (m === "default") void save({ mode: "default" }, T("الطباعة بدون ورق رسمي", "Printing without letterhead"));
        else setLh({ ...(lh ?? { mode: null }), mode: m, preset: null });
      }} /> {T(ar, en)}
    </label>
  );
  const pic = (src?: string, h = 60) => (src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a saved data: URI
    <img src={src} alt="" style={{ maxHeight: h, maxWidth: "100%", border: "1px solid var(--bd)", borderRadius: 4 }} />
  ) : <span style={{ fontSize: 11, color: "var(--mu)" }}>{T("لا توجد صورة", "No image")}</span>);
  const file = (field: "page" | "head" | "foot", ar: string, en: string) => edit && (
    <label className="btn bsm" style={{ cursor: "pointer" }}><i className="ti ti-upload" /> {T(ar, en)}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={upload(field)} /></label>
  );
  return (
    <div className="card" style={card} id="LH_CARD">
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-file-text" /> {T("الورق الرسمي للطباعة (النماذج والخطابات والمخالصة وكشف الراتب)", "Official letterhead (forms, letters, settlement & payslip)")}</div>
      {!lh ? <div style={{ color: "var(--mu)" }}>…</div> : (
        <>
          {opt("ariba", "ورق أريبا الجاهز (ترويسة وتذييل)", "Ariba letterhead (header + footer)")}
          {opt("page", "خلفية ورقة كاملة (A4)", "Full-page background (A4)")}
          {opt("hf", "ترويسة + تذييل من صورك", "Your own header + footer")}
          {opt("default", "بدون ورق رسمي", "No letterhead")}
          {lh.mode === "page" && (
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{pic(lh.page, 140)}{file("page", "صورة الورقة A4", "A4 page image")}</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
                {T("الهامش العلوي (ملم)", "Top margin (mm)")} <input type="number" min={0} max={120} value={lh.top ?? 42} disabled={!edit} onChange={(e) => setLh({ ...lh, top: Number(e.target.value) })} style={{ width: 70 }} />
                {T("السفلي", "Bottom")} <input type="number" min={0} max={120} value={lh.bottom ?? 30} disabled={!edit} onChange={(e) => setLh({ ...lh, bottom: Number(e.target.value) })} style={{ width: 70 }} />
                {edit && <button type="button" className="btn bsm" disabled={busy || !lh.page} onClick={() => save({ mode: "page", page: lh.page, top: lh.top, bottom: lh.bottom }, T("تم حفظ الهوامش", "Margins saved"))}>{T("حفظ الهوامش", "Save margins")}</button>}
              </div>
            </div>
          )}
          {lh.mode === "hf" && lh.preset !== "ariba" && (
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{pic(lh.head)}{file("head", "صورة الترويسة", "Header image")}</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{pic(lh.foot)}{file("foot", "صورة التذييل", "Footer image")}</div>
            </div>
          )}
          <div style={{ ...note, marginTop: 8, marginBottom: 0 }}>{T("يُطبَّق على كل المطبوعات الرسمية. جرّبه من صفحة النماذج أو كشف الراتب.", "Applies to every official print. Try it from the forms or payslip page.")}</div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------- mailboxes (S5)

type Mail = { configured: boolean; host?: string; port?: number; secure?: boolean; username?: string | null; from_name?: string | null; from_email?: string };
const MAIL_PRESETS: Record<string, [string, number, boolean]> = { o365: ["smtp.office365.com", 587, false], gmail: ["smtp.gmail.com", 465, true] };

function MailForm({ scope }: { scope: "company" | "mine" }) {
  const T = useT();
  const toast = useToast();
  const { can } = useAuth();
  const edit = scope === "mine" || can("settings", "edit");
  const [f, setF] = useState({ host: "smtp.office365.com", port: 587, secure: false, username: "", from_name: "", from_email: "" });
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    request<Mail>(`/settings/mail/${scope}`).then((m) => {
      setConfigured(m.configured);
      if (m.configured) setF({ host: m.host || "", port: m.port || 587, secure: !!m.secure, username: m.username || "", from_name: m.from_name || "", from_email: m.from_email || "" });
    }).catch((e) => toast(err(e), "err"));
  }, [scope, toast]);
  async function act(method: "PUT" | "DELETE", msg: string) {
    setBusy(true);
    try {
      const m = await request<Mail>(`/settings/mail/${scope}`, method === "PUT" ? { method, body: f } : { method });
      setConfigured(m.configured);
      toast("✓ " + msg, "ok");
    } catch (e) {
      toast(err(e), "err");
    } finally {
      setBusy(false);
    }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === "port" ? Number(e.target.value) : e.target.value });
  return (
    <div style={{ border: "1px solid var(--bd)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{scope === "company" ? T("بريد الشركة (إشعارات البرنامج)", "Company mailbox (system notices)") : T("بريدي الشخصي (إرسال التقارير)", "My mailbox (sending reports)")} {configured && <span className="b bg">{T("محفوظ", "Saved")}</span>}</div>
      <div className="fg">
        <div><label>{T("نوع البريد", "Provider")}</label>
          <select disabled={!edit} value={f.host === MAIL_PRESETS.o365[0] ? "o365" : f.host === MAIL_PRESETS.gmail[0] ? "gmail" : "custom"} onChange={(e) => { const p = MAIL_PRESETS[e.target.value]; if (p) setF({ ...f, host: p[0], port: p[1], secure: p[2] }); }}>
            <option value="o365">Microsoft 365 / Outlook</option><option value="gmail">Gmail</option><option value="custom">{T("خادم آخر", "Other server")}</option>
          </select></div>
        <div><label>{T("خادم SMTP", "SMTP host")}</label><input dir="ltr" value={f.host} disabled={!edit} onChange={set("host")} /></div>
        <div><label>{T("المنفذ", "Port")}</label><input type="number" value={f.port} disabled={!edit} onChange={set("port")} /></div>
        <div><label>{T("اسم المستخدم", "Username")}</label><input dir="ltr" value={f.username} disabled={!edit} onChange={set("username")} /></div>
        <div><label>{T("اسم المرسل", "Sender name")}</label><input value={f.from_name} disabled={!edit} onChange={set("from_name")} /></div>
        <div><label>{T("بريد المرسل", "Sender address")}</label><input dir="ltr" value={f.from_email} disabled={!edit} onChange={set("from_email")} /></div>
      </div>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, marginTop: 6 }}><input type="checkbox" checked={f.secure} disabled={!edit} onChange={(e) => setF({ ...f, secure: e.target.checked })} /> SSL/TLS</label>
      {edit && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" className="btn bpl bsm" disabled={busy} onClick={() => act("PUT", T("تم حفظ بيانات البريد", "Mailbox saved"))}><i className="ti ti-device-floppy" /> {T("حفظ", "Save")}</button>
          {configured && <button type="button" className="btn bsm" disabled={busy} onClick={() => window.confirm(T("حذف بيانات البريد المحفوظة؟", "Delete the saved mailbox?")) && void act("DELETE", T("تم حذف بيانات البريد", "Mailbox deleted"))}>{T("حذف", "Delete")}</button>}
        </div>
      )}
    </div>
  );
}

export function MailCard() {
  const T = useT();
  return (
    <div className="card" style={card} id="ML_CARD">
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-mail-cog" /> {T("حسابات البريد (الشخصي والشركة)", "Mail accounts (personal and company)")}</div>
      <div className="al alb" style={{ marginTop: 0 }}><i className="ti ti-info-circle" /><div>{T("الإرسال بالبريد غير مفعّل بعد. تُحفظ هنا بيانات الحساب فقط؛ كلمة المرور لا تُحفظ في البرنامج وتُضبط على الخادم عند تفعيل البريد.", "E-mail sending is not on yet. Only the account details are saved here; the password is never stored in the program and is set on the server when e-mail is switched on.")}</div></div>
      <MailForm scope="company" />
      <MailForm scope="mine" />
    </div>
  );
}
