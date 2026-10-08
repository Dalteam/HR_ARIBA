"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { changePassword } from "@/lib/auth";
import { useLocale } from "@/lib/i18n/locale";
import { useToast } from "./toast";

// Inline styles reproduce the prototypes' V114 change-password window (both apps used the same one).
const INP: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: 10, marginBottom: 8, border: "1px solid #ccc",
  borderRadius: 8, fontSize: 14, background: "#fff", color: "#111",
};
const LETTERS = /[A-Za-zء-ي]/;
const DIGITS = /[0-9٠-٩]/;

/**
 * @param forced  First sign-in with a temporary password: no cancel, no Esc, no click-outside.
 */
export function PasswordDialog({ forced, onClose, onDone }: { forced: boolean; onClose: () => void; onDone: () => void }) {
  const { t, lang } = useLocale();
  const toast = useToast();
  const [old, setOld] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => first.current?.focus(), 50);
    if (forced) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [forced, onClose]);

  async function save() {
    if (!old || !next) return setError(t("pw.errEmpty"));
    if (next !== next2) return setError(t("pw.errMatch"));
    if (next.length < 8) return setError(t("pw.errShort"));
    if (!LETTERS.test(next) || !DIGITS.test(next)) return setError(t("pw.errChars"));
    if (next === old) return setError(t("pw.errSame"));
    setBusy(true);
    setError(null);
    try {
      await changePassword(old, next);
      toast(t("pw.done"), "ok");
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const type = show ? "text" : "password";
  const onEnter = (e: React.KeyboardEvent) => e.key === "Enter" && save();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pw-title"
      dir={lang === "ar" ? "rtl" : "ltr"}
      onMouseDown={(e) => !forced && e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 2147483646, background: "rgba(15,23,42,.72)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div style={{ background: "#fff", color: "#111", maxWidth: 380, width: "100%", borderRadius: 14, padding: 20, boxShadow: "0 20px 50px rgba(0,0,0,.35)" }}>
        <div id="pw-title" style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
          🔒 {forced ? t("pw.forcedTitle") : t("pw.title")}
        </div>
        <div style={{ fontSize: 12.5, color: "#555", lineHeight: 1.7, marginBottom: 14 }}>{forced ? t("pw.forcedIntro") : t("pw.intro")}</div>
        <input ref={first} type={type} placeholder={t("pw.current")} autoComplete="current-password" style={INP} value={old} onChange={(e) => setOld(e.target.value)} onKeyDown={onEnter} />
        <input type={type} placeholder={t("pw.new")} autoComplete="new-password" style={INP} value={next} onChange={(e) => setNext(e.target.value)} onKeyDown={onEnter} />
        <input type={type} placeholder={t("pw.repeat")} autoComplete="new-password" style={INP} value={next2} onChange={(e) => setNext2(e.target.value)} onKeyDown={onEnter} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#444", marginBottom: 10, cursor: "pointer", marginTop: 0 }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} style={{ width: "auto" }} /> {t("pw.show")}
        </label>
        {error && <div role="alert" style={{ color: "#b91c1c", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={save} disabled={busy} style={{ flex: 1, padding: 11, border: 0, borderRadius: 8, background: "#0f766e", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            {busy ? t("pw.saving") : t("pw.save")}
          </button>
          {!forced && (
            <button type="button" onClick={onClose} style={{ padding: "11px 16px", border: "1px solid #ccc", borderRadius: 8, background: "#f3f4f6", color: "#111", fontSize: 14, cursor: "pointer" }}>
              {t("common.cancel")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
