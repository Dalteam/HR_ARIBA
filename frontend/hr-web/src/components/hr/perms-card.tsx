"use client";

// «الصلاحيات والأشخاص» — port of the design's pages/settings/PermsCard.jsx on OUR /permissions (Stage 11).
//
// The matrix: one row per module, one column per edited role (hr, admin_manager, finance, ceo), each cell
// none / view / edit, plus the fixed «رئيس المجلس / Admin» column that is always full. Only admin and chairman
// may change a cell (the API answers can_edit); `permissions` itself stops at «اطلاع» for every role (P1).
// Every change is saved at once and written to the audit log by the API.
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/common/toast";
import { ApiError } from "@/lib/api";
import { useLocale } from "@/lib/i18n/locale";
import { LEVEL_LABEL, MODULE_LABEL, ROLE_LABEL, getMatrix, setLevel, type Level, type Matrix, type Module } from "@/lib/permissions";

const sel: React.CSSProperties = { background: "var(--c2)", border: "1px solid var(--bd)", borderRadius: 6, color: "var(--tx)", padding: "3px 6px", fontSize: 11.5 };
const th: React.CSSProperties = { padding: "6px 8px", borderBottom: "2px solid var(--bl)", fontSize: 11, textAlign: "center", whiteSpace: "nowrap", background: "var(--c2)" };
const td: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid rgba(36,48,68,.25)", fontSize: 11.5, textAlign: "center" };
const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2 };

export function PermsCard({ onChanged }: { onChanged?: () => void }) {
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (ar: string, e: string) => (en ? e : ar);
  const toast = useToast();
  const [mt, setMt] = useState<Matrix | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // the cell just saved ("role.module"), marked with a green ✓ for a few seconds: there is no save button
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    try {
      setMt(await getMatrix());
      setErr("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the matrix's first read
    void load();
  }, [load]);

  async function change(role: string, module: Module, level: Level) {
    setBusy(true);
    try {
      await setLevel(role, module, level);
      toast("✓ " + T("اتحفظت الصلاحية", "Permission saved"), "ok");
      const key = role + "." + module;
      setSaved(key);
      setTimeout(() => setSaved((current) => (current === key ? "" : current)), 4000);
      onChanged?.();
    } catch (e) {
      toast(T("تعذر الحفظ: ", "Could not save: ") + (e instanceof ApiError ? e.message : String(e)), "err");
    } finally {
      setBusy(false);
      await load();
    }
  }

  const lab = (o: Record<string, [string, string]>, k: string) => (o[k] ? o[k][en ? 1 : 0] : k);
  return (
    <div className="card" style={{ marginTop: 12, maxWidth: 1000 }} id="PM_CARD">
      <div className="ct" style={{ marginBottom: 8 }}><i className="ti ti-shield-lock" /> {T("الصلاحيات والأشخاص", "Permissions & people")}</div>
      <div style={{ fontSize: 12, color: "var(--mu)", lineHeight: 1.8, marginBottom: 10 }}>
        {T("اختر لكل دور ما يراه ويعدّله. الحماية مفروضة على الخادم (ليست إخفاء أزرار فقط). Admin ورئيس المجلس صلاحياتهما كاملة دائماً، وهما فقط من يعدّل هذا الجدول. أي تغيير يُسجَّل في سجل التعديلات.",
          "Choose what each role can see and change. Enforced on the server, not only by hiding buttons. Admin and Chairman always have full access and are the only ones who edit this table. Every change is recorded in the audit log.")}
      </div>
      {mt?.can_edit && (
        <div className="al alb" style={{ marginBottom: 10, fontSize: 12 }}>
          <i className="ti ti-device-floppy" />
          <div>{T("لا يوجد زر حفظ: كل تغيير يُحفظ فوراً عند اختياره، وتظهر علامة ✓ خضراء بجانبه.", "There is no save button: each change is saved as soon as you pick it, and a green ✓ appears next to it.")}</div>
        </div>
      )}
      {err && <div style={{ color: "var(--rd)", fontSize: 12 }}>{err}</div>}
      {!mt && !err && <div style={{ color: "var(--mu)" }}>…</div>}
      {mt && (
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: en ? "left" : "right" }}>{T("الوحدة", "Module")}</th>
                {mt.roles.map((r) => <th key={r} style={th}>{lab(ROLE_LABEL, r)}</th>)}
                <th style={th}>{T("رئيس المجلس / Admin", "Chairman / Admin")}</th>
              </tr>
            </thead>
            <tbody>
              {mt.modules.map((m) => (
                <tr key={m}>
                  <td style={{ ...td, textAlign: en ? "left" : "right", fontWeight: 600 }}>{lab(MODULE_LABEL, m)}</td>
                  {mt.roles.map((r) => {
                    const cap = mt.capped[m];
                    return (
                      <td key={r} style={td}>
                        <select
                          style={sel}
                          className="pm-sel"
                          data-r={r}
                          data-m={m}
                          disabled={!mt.can_edit || busy}
                          value={mt.matrix[r]?.[m] || "none"}
                          onChange={(e) => void change(r, m, e.target.value as Level)}
                        >
                          {mt.levels.filter((k) => !cap || RANK[k] <= RANK[cap]).map((k) => <option key={k} value={k}>{lab(LEVEL_LABEL, k)}</option>)}
                        </select>
                        {saved === r + "." + m && <span style={{ color: "var(--gr)", fontWeight: 800, marginInlineStart: 4 }} title={T("تم الحفظ", "Saved")}>✓</span>}
                      </td>
                    );
                  })}
                  <td style={{ ...td, color: "var(--gr)", fontWeight: 700 }}>{lab(LEVEL_LABEL, "edit")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mt && !mt.can_edit && (
        <div style={{ fontSize: 11, color: "var(--mu)", marginTop: 8 }}>{T("للاطلاع فقط — التعديل للمدير (Admin) ورئيس المجلس.", "View only — editing is for Admin and the Chairman.")}</div>
      )}
    </div>
  );
}
