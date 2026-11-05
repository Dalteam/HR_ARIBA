"use client";

// The employee web area's documents tab, as the design's Docs.jsx: the letters HR sends for my approval, each
// one viewable, approvable, refusable with a reason, or signed. The signature is drawn here and kept in THIS
// browser only (`ariba_sig_v1_<emp no>`, exactly the design's rule) — what leaves is the letter with the
// signature inside it, base64, which the server cleans and files as a signed copy (canonical.py
// /me/letters/{id}/sign). The design's own document store (`ariba_get_document`) does not exist on our
// server, so «وثائقي» on the profile tab stays the way it is.
import { useEffect, useRef, useState } from "react";
import { StatusIcon } from "@/components/common/status-icon";
import { useToast } from "@/components/common/toast";
import { MeState } from "@/components/me/me-shell";
import { ApiError } from "@/lib/api";
import { ddmmyyyy } from "@/lib/format";
import { myEmployee } from "@/lib/employees";
import { useLocale } from "@/lib/i18n/locale";
import { letterHtml, myLetters, mySignStates, respondMyLetter, signMyLetter, type MyLetter } from "@/lib/me";
import { letterLabel } from "@/lib/me-labels";
import { useApi } from "@/lib/use-api";

const SIG_KEY = (owner: string) => "ariba_sig_v1_" + String(owner || "");
const readSig = (owner: string) => {
  try {
    return localStorage.getItem(SIG_KEY(owner)) || "";
  } catch {
    return "";
  }
};
const writeSig = (owner: string, v: string) => {
  try {
    if (v) localStorage.setItem(SIG_KEY(owner), v);
    else localStorage.removeItem(SIG_KEY(owner));
    return true;
  } catch {
    return false;
  }
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** The design's `injectSignature`: into the employee's signature slot, else as an approval block at the end. */
function injectSignature(html: string, sig: string, name: string, label: string) {
  const img = `<img alt="signature" src="${sig}" style="height:38px;max-width:150px;vertical-align:middle">`;
  const date = `<span style="font-size:10px;color:#555">${new Date().toLocaleDateString("en-GB")}</span>`;
  const block = `<div style="margin:18px 12px 0;padding-top:8px;border-top:1px solid #999;font-size:12px"><b>${esc(label)}</b>${name ? " — " + esc(name) : ""}<div style="margin-top:6px">${img} ${date}</div></div>`;
  const slot = '<span data-sig="employee">________________</span>';
  return String(html)
    .split("<!--ARIBA_EN-->")
    .map((part) => {
      if (part.includes(slot)) {
        let n = 0;
        return part.split(slot).join("\u0000").replace(/\u0000/g, () => (n++ === 0 ? img + " " + date : "✓"));
      }
      return /<\/body>/i.test(part) ? part.replace(/<\/body>/i, block + "</body>") : part + block;
    })
    .join("<!--ARIBA_EN-->");
}

/** base64 of the UTF-8 bytes — what the sign route expects in `signed_base64`. */
function b64utf8(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((c) => {
    bin += String.fromCharCode(c);
  });
  return btoa(bin);
}

export default function MeDocuments() {
  const { lang } = useLocale();
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const toast = useToast();
  const emp = useApi(myEmployee, "me");
  const letters = useApi(myLetters, `me-letters:${emp.data?.id ?? ""}`);
  const states = useApi(mySignStates, `me-sign:${emp.data?.id ?? ""}`);
  const [sig, setSig] = useState("");
  const [pad, setPad] = useState(false);
  const [busy, setBusy] = useState("");
  const [rej, setRej] = useState<Record<string, string | undefined>>({});
  const [view, setView] = useState<{ title: string; html: string } | null>(null);
  const [viewBusy, setViewBusy] = useState("");

  const owner = emp.data?.emp_no || emp.data?.id || "";
  // The saved signature lives in this browser, so it is read after mount (the store is not there on the server).
  useEffect(() => {
    if (!owner) return;
    const first = setTimeout(() => setSig(readSig(owner)), 0);
    return () => clearTimeout(first);
  }, [owner]);

  const fail = (e: unknown) => (e instanceof ApiError ? e.message || T("تعذر تنفيذ العملية", "Could not complete the action") : String(e));

  const stageName = (next: string) =>
    next === "manager" ? T("مديرك المباشر", "your direct manager") : next === "hr" ? T("الموارد البشرية", "HR") : T("اكتمل", "done");

  async function open(l: MyLetter) {
    setViewBusy(l.id);
    try {
      const html = await letterHtml(l.id);
      const parts = html.split("<!--ARIBA_EN-->");
      setView({ title: l.title || letterLabel(l.type, lang), html: (lang === "en" && parts[1]) || parts[0] });
    } catch (e) {
      toast(fail(e), "err");
    } finally {
      setViewBusy("");
    }
  }

  async function sign(l: MyLetter) {
    if (!sig) {
      setPad(true);
      toast(T("ارسم توقيعك أولاً ثم أعد المحاولة", "Draw your signature first, then try again"), "err");
      return;
    }
    setBusy(l.id);
    try {
      const html = await letterHtml(l.id);
      const signed = injectSignature(html, sig, emp.data?.name_ar ?? "", T("توقيع الموظف / Employee signature", "Employee signature"));
      const out = await signMyLetter(l.id, b64utf8(signed));
      toast(out.next === "done" ? T("تم التوقيع والإرسال ✓", "Signed and sent ✓") : T("تم التوقيع — بانتظار ", "Signed — waiting for ") + stageName(out.next), "ok");
      letters.reload();
      states.reload();
    } catch (e) {
      toast(fail(e), "err");
    } finally {
      setBusy("");
    }
  }

  async function respond(l: MyLetter, action: "approved" | "rejected", reason?: string) {
    setBusy(l.id);
    try {
      await respondMyLetter(l.id, action, reason);
      toast(action === "approved" ? T("تمت الموافقة بدون توقيع ✓", "Approved without a signature ✓") : T("تم رفض المستند", "The document was rejected"), "ok");
      letters.reload();
      states.reload();
    } catch (e) {
      toast(fail(e), "err");
    } finally {
      setBusy("");
    }
  }

  if (emp.error?.status === 404) return <MeState error={T("لا يوجد سجل موظف مرتبط بهذا الحساب.", "No employee record is linked to this account.")} />;
  if (!emp.data) return <MeState loading={emp.loading} error={emp.error?.message} />;
  const list = letters.data ?? [];
  const stOf = (id: string) => states.data?.find((s) => s.request_id === id) ?? null;

  return (
    <>
      <div className="card">
        <div className="card-title">✍️ {T("توقيعي", "My signature")}</div>
        <div style={{ fontSize: 11, color: "var(--mu)", lineHeight: 1.7 }}>
          {T(
            "يُحفظ توقيعك داخل هذا المتصفح فقط ولا يظهر للموارد البشرية ولا لأي جهة. عند «موافق مع التوقيع» يُدمج في المستند، وما يُرسل هو المستند الموقّع فقط.",
            "Your signature is kept in this browser only and is not shown to HR or anyone else. «Approve with signature» draws it into the document; only the signed document is sent.",
          )}
        </div>
        {sig ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sig} alt={T("توقيعي", "My signature")} style={{ maxHeight: 64, background: "#fff", border: "1px solid var(--bd)", borderRadius: 8, marginTop: 8, padding: 4 }} />
        ) : (
          <div style={{ fontSize: 11.5, color: "var(--mu)", marginTop: 8 }}>{T("لم ترسم توقيعاً بعد.", "You have not drawn a signature yet.")}</div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" className="btn btn-primary" onClick={() => setPad(true)}>{sig ? T("تغيير التوقيع", "Replace the signature") : T("رسم التوقيع", "Draw the signature")}</button>
          {sig && (
            <button
              type="button"
              className="btn"
              style={{ background: "transparent", border: "1px solid var(--bd)", color: "var(--rd)" }}
              onClick={() => {
                writeSig(owner, "");
                setSig("");
                toast(T("حُذف التوقيع من هذا المتصفح", "The signature was removed from this browser"), "ok");
              }}
            >
              {T("حذف", "Delete")}
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">📄 {T("مستندات بانتظار توقيعي", "Documents awaiting my signature")}</div>
        {letters.error && <div style={{ color: "var(--rd)", fontSize: 12 }}>{letters.error.message}</div>}
        {letters.data && !list.length && (
          <div style={{ padding: 14, color: "var(--mu)", textAlign: "center", fontSize: 12 }}>{T("لا توجد مستندات بانتظار توقيعك حاليًا ✓", "No documents are awaiting your signature ✓")}</div>
        )}

        {list.map((l) => {
          const st = stOf(l.id);
          const mine = l.status === "pending" && !st;
          const why = rej[l.id];
          const reason = l.rejection_reason || st?.reject_reason || "";
          return (
            <div key={l.id} style={{ border: "1px solid var(--bd)", borderRadius: 12, padding: 12, marginBottom: 10, background: "var(--c2)", textAlign: "start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <i className="ti ti-file-text" style={{ fontSize: 18, color: "var(--bl)" }} aria-hidden />
                <strong style={{ fontSize: 12.5 }}>{l.title || letterLabel(l.type, lang)}</strong>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--mu)", marginBottom: 8 }}>{ddmmyyyy(l.created_at)}</div>

              <div style={{ marginBottom: 8 }}>
                {l.status === "rejected" ? (
                  <span className="b br">{T("مرفوض", "Rejected")}</span>
                ) : mine ? (
                  <span className="b ba">{T("بانتظار توقيعك", "Awaiting your signature")}</span>
                ) : st?.stage === "manager" ? (
                  <span className="b ba">{T("بانتظار توقيع مديرك", "With your manager")}</span>
                ) : st?.stage === "hr" ? (
                  <span className="b ba">{T("بانتظار الموارد البشرية", "With HR")}</span>
                ) : st?.stage === "done" || l.status === "approved" ? (
                  <span className="b bg">{T("اكتمل", "Completed")}</span>
                ) : (
                  <span className="b ba">{l.status}</span>
                )}
                {l.status === "rejected" && reason && <div style={{ fontSize: 11, color: "var(--rd)", marginTop: 4 }}><StatusIcon name="rejected" />{reason}</div>}
                {st?.mgr_signed_at && (
                  <div style={{ fontSize: 10.5, color: "var(--mu)", marginTop: 4 }}>{T("توقيع المدير: ", "Manager signed: ")}{ddmmyyyy(st.mgr_signed_at)}</div>
                )}
              </div>

              <button type="button" className="btn" style={{ width: "100%", marginBottom: 6, border: "1px solid var(--bd)", background: "transparent" }} disabled={viewBusy === l.id} onClick={() => void open(l)}>
                <i className="ti ti-eye" /> {viewBusy === l.id ? "…" : T("عرض المستند", "View the document")}
              </button>

              {mine && (
                <>
                  <button type="button" className="btn btn-primary" style={{ width: "100%", marginBottom: 6, justifyContent: "center" }} disabled={busy === l.id} onClick={() => void sign(l)}>
                    <i className="ti ti-signature" /> {busy === l.id ? "…" : T("موافق مع التوقيع", "Approve with signature")}
                  </button>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="btn btn-success" style={{ flex: 1 }} disabled={busy === l.id} onClick={() => void respond(l, "approved")}>
                      <i className="ti ti-check" /> {T("موافقة بدون توقيع", "Approve (no signature)")}
                    </button>
                    <button type="button" className="btn btn-danger" style={{ flex: 1 }} disabled={busy === l.id} onClick={() => setRej((p) => ({ ...p, [l.id]: p[l.id] === undefined ? "" : undefined }))}>
                      <i className="ti ti-x" /> {T("رفض", "Reject")}
                    </button>
                  </div>
                  {why !== undefined && (
                    <div style={{ marginTop: 8 }}>
                      <textarea rows={2} value={why} placeholder={T("اكتب سبب الاعتراض (3 أحرف على الأقل)…", "Write the reason for the objection (3 characters at least)…")} onChange={(e) => setRej((p) => ({ ...p, [l.id]: e.target.value }))} style={{ width: "100%", fontSize: 11.5 }} />
                      <button type="button" className="btn btn-danger" style={{ width: "100%", marginTop: 6, opacity: why.trim().length >= 3 ? 1 : 0.5 }} disabled={why.trim().length < 3 || busy === l.id} onClick={() => void respond(l, "rejected", why)}>
                        {T("تأكيد الاعتراض", "Confirm the objection")}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>


      {view && (
        <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "#fff", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 10, background: "var(--c2)", borderBottom: "1px solid var(--bd)" }}>
            <strong style={{ fontSize: 13 }}>{view.title}</strong>
            <button type="button" className="btn btn-primary" onClick={() => setView(null)}>{T("إغلاق", "Close")}</button>
          </div>
          <iframe title={view.title} srcDoc={view.html} sandbox="" style={{ flex: 1, width: "100%", border: 0, background: "#fff" }} />
        </div>
      )}

      {pad && (
        <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
          <div className="card" style={{ width: "100%", maxWidth: 430, margin: 0 }}>
            <div className="card-title">✍️ {T("ارسم توقيعك", "Draw your signature")}</div>
            <div style={{ fontSize: 11, color: "var(--mu)", marginBottom: 8 }}>{T("بإصبعك أو بالماوس داخل المربع، ثم «حفظ».", "With your finger or the mouse inside the box, then «Save».")}</div>
            <SigPad
              onSave={(data) => {
                if (!writeSig(owner, data)) {
                  toast(T("تعذر الحفظ على هذا الجهاز", "Could not save on this device"), "err");
                  return;
                }
                setSig(data);
                setPad(false);
                toast(T("حُفظ التوقيع في هذا المتصفح ✓", "The signature was saved in this browser ✓"), "ok");
              }}
              onCancel={() => setPad(false)}
              T={T}
            />
          </div>
        </div>
      )}
    </>
  );
}

/** The signature pad: a white canvas, the finger or the mouse, and one PNG at the end (the design's SigPad). */
function SigPad({ onSave, onCancel, T }: { onSave: (dataUrl: string) => void; onCancel: () => void; T: (ar: string, en: string) => string }) {
  const cv = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const c = cv.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#14231d";
  }, []);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = cv.current as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = cv.current?.getContext("2d");
    if (!ctx) return;
    const p = at(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawing.current = true;
    cv.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = cv.current?.getContext("2d");
    if (!ctx) return;
    const p = at(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!dirty) setDirty(true);
  };
  const up = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = cv.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    setDirty(false);
  };

  return (
    <>
      <canvas
        ref={cv}
        width={640}
        height={280}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        onPointerCancel={up}
        style={{ width: "100%", height: 150, background: "#fff", border: "1px solid var(--bd)", borderRadius: 8, touchAction: "none" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="btn" style={{ border: "1px solid var(--bd)", background: "transparent" }} onClick={clear}>{T("مسح الرسم", "Clear")}</button>
        <button type="button" className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!dirty} onClick={() => onSave((cv.current as HTMLCanvasElement).toDataURL("image/png"))}>
          {T("حفظ التوقيع", "Save the signature")}
        </button>
        <button type="button" className="btn" style={{ border: "1px solid var(--bd)", background: "transparent" }} onClick={onCancel}>{T("إلغاء", "Cancel")}</button>
      </div>
    </>
  );
}

