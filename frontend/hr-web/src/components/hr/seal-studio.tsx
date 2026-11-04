"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/use-api";
import { getSheet } from "@/lib/settings";
import { useLocale } from "@/lib/i18n/locale";
import {
  defaultPositions,
  docKey,
  MM,
  overlayHtml,
  saveFlags,
  savePositions,
  sealAuto,
  sealState,
  setSealAuto,
  SEAL_H,
  SEAL_W,
  type SealPositions,
  type SealState,
  type SheetSigner,
} from "@/lib/seal";

// The design's seal studio (sealStudio.js): drag the company stamp, the signature and the signer's
// name/title anywhere on an A4 page, then stamp the PDF with them. Same store keys as the design
// (`ariba_seal_pos`, `ariba_seal_flags`, `ariba_seal_auto2`), so a browser keeps each form's places.
//
// One difference, on purpose: the signer is the one saved in Settings. The design could also set any
// employee as the signer, but we store a single signature/stamp (`hr_signer`, V120), so choosing an
// employee there would show a name with no signature of his.

export type SealAnswer = { overlay: string } | "plain" | null;

/** Ask for the seal places and get the overlay back; "plain" = export without it, null = cancelled. */
export function useSealStudio() {
  const { lang } = useLocale();
  const signer = useApi(() => getSheet<SheetSigner>("hr_signer").then((r) => r.data), "seal-signer");
  const [req, setReq] = useState<{ html: string; title: string; resolve: (a: SealAnswer) => void } | null>(null);
  const askSeal = useCallback(
    (html: string, title: string) => new Promise<SealAnswer>((resolve) => setReq({ html, title, resolve })),
    [],
  );
  const sealNode = req ? (
    <SealStudio
      html={req.html}
      title={req.title}
      lang={lang}
      signer={signer.data}
      onDone={(a) => {
        req.resolve(a);
        setReq(null);
      }}
    />
  ) : null;
  return { askSeal, sealNode };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function SealStudio({
  html,
  title,
  lang,
  signer,
  onDone,
}: {
  html: string;
  title: string;
  lang: "ar" | "en";
  signer: SheetSigner | null;
  onDone: (a: SealAnswer) => void;
}) {
  const T = (ar: string, en: string) => (lang === "en" ? en : ar);
  const key = docKey(title);
  const [st, setSt] = useState<SealState>(() => sealState(lang, key, signer, title));
  const [auto, setAuto] = useState(sealAuto);
  const [scale, setScale] = useState(1);
  const holder = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ k: keyof SealPositions; sx: number; sy: number; ox: number; oy: number } | null>(null);

  // The page is 794 px wide; show it as large as the window allows and keep it that way.
  useEffect(() => {
    const fit = () => {
      const w = holder.current?.clientWidth ?? SEAL_W;
      setScale(clamp(w / SEAL_W, 0.25, 1));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = (e.clientX - d.sx) / scale / SEAL_W;
      const dy = (e.clientY - d.sy) / scale / SEAL_H;
      setSt((s) => ({ ...s, pos: { ...s.pos, [d.k]: { ...s.pos[d.k], x: clamp(d.ox + dx, 0, 1), y: clamp(d.oy + dy, 0, 0.99) } } }));
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [scale]);

  const grab = (k: keyof SealPositions, e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { k, sx: e.clientX, sy: e.clientY, ox: st.pos[k].x, oy: st.pos[k].y };
  };

  const num = (k: "stamp" | "sig", f: "w" | "r", v: number) =>
    setSt((s) => ({ ...s, pos: { ...s.pos, [k]: { ...s.pos[k], [f]: v } } }));

  const apply = () => {
    savePositions(key, st.pos);
    saveFlags({ signerId: st.signerId, title: st.title, name: st.name, showStamp: st.showStamp, showSig: st.showSig, showTxt: st.showTxt });
    setSealAuto(auto);
    onDone({ overlay: overlayHtml(st) });
  };

  return (
    <div dir="rtl" style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(10,20,17,.72)", display: "flex", color: "#1a1a1a" }}>
      <div ref={holder} style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
        <div style={{ width: SEAL_W * scale, height: SEAL_H * scale, position: "relative", boxShadow: "0 8px 30px rgba(0,0,0,.45)", background: "#fff", flex: "0 0 auto" }}>
          <div dir="ltr" style={{ position: "absolute", left: 0, top: 0, width: SEAL_W, height: SEAL_H, transform: "scale(" + scale + ")", transformOrigin: "0 0", background: "#fff" }}>
            <iframe title="seal-preview" srcDoc={html} sandbox="" style={{ position: "absolute", left: 0, top: 0, width: SEAL_W, height: SEAL_H, border: 0, background: "#fff", pointerEvents: "none" }} />
            {st.showStamp && st.stamp && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={st.stamp}
                alt=""
                draggable={false}
                onPointerDown={(e) => grab("stamp", e)}
                style={{ position: "absolute", left: st.pos.stamp.x * SEAL_W, top: st.pos.stamp.y * SEAL_H, width: st.pos.stamp.w * MM, cursor: "grab", touchAction: "none", userSelect: "none", transform: "rotate(" + st.pos.stamp.r + "deg)", mixBlendMode: "multiply", opacity: 0.9, outline: "1px dashed rgba(10,122,63,.4)" }}
              />
            )}
            {st.showSig && st.sig && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={st.sig}
                alt=""
                draggable={false}
                onPointerDown={(e) => grab("sig", e)}
                style={{ position: "absolute", left: st.pos.sig.x * SEAL_W, top: st.pos.sig.y * SEAL_H, width: st.pos.sig.w * MM, maxHeight: st.pos.sig.w * 0.6 * MM, objectFit: "contain", cursor: "grab", touchAction: "none", userSelect: "none", transform: "rotate(" + st.pos.sig.r + "deg)", mixBlendMode: "multiply", outline: "1px dashed rgba(10,122,63,.4)" }}
              />
            )}
            {st.showTxt && (st.title || st.name) && (
              <div
                dir={lang === "en" ? "ltr" : "rtl"}
                onPointerDown={(e) => grab("txt", e)}
                style={{ position: "absolute", left: st.pos.txt.x * SEAL_W, top: st.pos.txt.y * SEAL_H, transform: "translateX(-50%)", minWidth: 55 * MM, textAlign: "center", lineHeight: 1.5, fontSize: 13, cursor: "grab", touchAction: "none", userSelect: "none", outline: "1px dashed rgba(10,122,63,.4)" }}
              >
                <div style={{ fontWeight: 800 }}>{st.title}</div>
                {st.name && <div style={{ fontWeight: 700 }}>{st.name}</div>}
              </div>
            )}
          </div>
        </div>
      </div>


      <div style={{ width: 300, flex: "0 0 auto", background: "#fff", padding: 14, overflow: "auto", display: "flex", flexDirection: "column", gap: 9, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: "#014D3D" }}>🖋️ {T("ضبط الختم والتوقيع", "Stamp & signature")}</h3>
          <button type="button" className="btn bsm" onClick={() => onDone(null)} aria-label={T("إغلاق", "Close")}><i className="ti ti-x" /></button>
        </div>
        <div style={{ fontSize: 11.5, color: "#567", lineHeight: 1.7 }}>
          {T("اسحب الختم أو التوقيع أو الاسم إلى أي مكان في الصفحة. الأحجام بالملّيمتر والمواضع تُحفظ لهذا النموذج في هذا المتصفح.", "Drag the stamp, the signature or the name anywhere on the page. Sizes are in mm and the places are kept for this form in this browser.")}
        </div>
        {!st.sig && !st.stamp && (
          <div style={{ fontSize: 11.5, color: "#8a5a00", background: "#fff7e6", border: "1px solid #f0d9a8", borderRadius: 8, padding: 8, lineHeight: 1.7 }}>
            {T("لا يوجد توقيع أو ختم محفوظ. ارفعهما من الإعدادات ← الورق الرسمي والتوقيع، أو اكتب الاسم والصفة فقط.", "No signature or stamp is saved. Upload them in Settings → Letterhead & signature, or set just the name and title.")}
          </div>
        )}
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#456", marginBottom: 2 }}>{T("الصفة", "Title")}</label>
          <input type="text" value={st.title} onChange={(e) => setSt({ ...st, title: e.target.value })} style={{ width: "100%", padding: "6px 8px", border: "1px solid #c5d3cd", borderRadius: 6 }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#456", marginBottom: 2 }}>{T("الاسم", "Name")}</label>
          <input type="text" value={st.name} onChange={(e) => setSt({ ...st, name: e.target.value })} style={{ width: "100%", padding: "6px 8px", border: "1px solid #c5d3cd", borderRadius: 6 }} />
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={st.showStamp} disabled={!st.stamp} onChange={(e) => setSt({ ...st, showStamp: e.target.checked })} /> {T("ختم الشركة", "Company stamp")}</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={st.showSig} disabled={!st.sig} onChange={(e) => setSt({ ...st, showSig: e.target.checked })} /> {T("التوقيع", "Signature")}</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={st.showTxt} onChange={(e) => setSt({ ...st, showTxt: e.target.checked })} /> {T("الاسم والصفة", "Name and title")}</label>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#456" }}>{T("حجم الختم", "Stamp size")} — {Math.round(st.pos.stamp.w)}mm</label>
          <input type="range" min={15} max={80} value={st.pos.stamp.w} onChange={(e) => num("stamp", "w", Number(e.target.value))} style={{ width: "100%" }} />
          <label style={{ display: "block", fontSize: 12, color: "#456" }}>{T("ميل الختم", "Stamp tilt")} — {Math.round(st.pos.stamp.r)}°</label>
          <input type="range" min={-30} max={30} value={st.pos.stamp.r} onChange={(e) => num("stamp", "r", Number(e.target.value))} style={{ width: "100%" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#456" }}>{T("حجم التوقيع", "Signature size")} — {Math.round(st.pos.sig.w)}mm</label>
          <input type="range" min={15} max={70} value={st.pos.sig.w} onChange={(e) => num("sig", "w", Number(e.target.value))} style={{ width: "100%" }} />
          <label style={{ display: "block", fontSize: 12, color: "#456" }}>{T("ميل التوقيع", "Signature tilt")} — {Math.round(st.pos.sig.r)}°</label>
          <input type="range" min={-30} max={30} value={st.pos.sig.r} onChange={(e) => num("sig", "r", Number(e.target.value))} style={{ width: "100%" }} />
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {T("استعمل هذه المواضع تلقائياً في المرات القادمة", "Reuse these places automatically next time")}</label>
        <button type="button" className="btn bsm" onClick={() => setSt((s) => ({ ...s, pos: defaultPositions() }))}>{T("إعادة ضبط المواضع", "Reset the places")}</button>
        <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
          <button type="button" className="btn bpl" style={{ flex: 1 }} onClick={apply}><i className="ti ti-check" /> {T("تطبيق الختم", "Apply the seal")}</button>
          <button type="button" className="btn" onClick={() => onDone("plain")}>{T("بدون ختم", "No seal")}</button>
        </div>
      </div>
    </div>
  );
}

