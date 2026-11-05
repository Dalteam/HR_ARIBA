"use client";

// The design's list of accounts still on a default password (Stage 18) on OUR /accounts/temporary-password: name,
// username, role and since when. Passwords are stored only as hashes, so none is ever shown (owner, decision a).
import { useEffect, useState } from "react";
import { Modal } from "@/components/hr/modal";
import { ApiError, request } from "@/lib/api";
import { dmy } from "@/lib/format";
import { useLocale } from "@/lib/i18n/locale";

type Row = { user_id: string; employee_id: string | null; username: string; role: string; name_ar: string | null; name_en: string | null; since: string | null };

export function TempPasswordList({ onClose }: { onClose: () => void }) {
  const { lang } = useLocale();
  const en = lang === "en";
  const T = (ar: string, e: string) => (en ? e : ar);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    request<Row[]>("/accounts/temporary-password").then(setRows).catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, []);
  return (
    <Modal title={T("الحسابات بكلمة مرور مؤقتة", "Accounts on a temporary password")} width={620} onClose={onClose}>
      <div style={{ fontSize: 11.5, color: "var(--mu)", marginBottom: 8 }}>{T("حسابات صدرت لها كلمة مرور مؤقتة ولم يغيّرها أصحابها بعد. لا تُعرض كلمات المرور أبدًا.", "Accounts given a temporary password that their owners have not changed yet. Passwords are never shown.")}</div>
      {error && <div style={{ color: "var(--rd)" }}>{error}</div>}
      {!rows && !error && <div style={{ color: "var(--mu)" }}>…</div>}
      {rows && (
        <div className="tw">
          <table>
            <thead><tr><th>{T("الاسم", "Name")}</th><th>{T("اسم المستخدم", "Username")}</th><th>{T("الدور", "Role")}</th><th>{T("منذ", "Since")}</th></tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r.user_id}><td>{(en && r.name_en) || r.name_ar || "—"}</td><td dir="ltr">{r.username}</td><td>{r.role}</td><td>{dmy(r.since)}</td></tr>)}
              {!rows.length && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--mu)" }}>{T("لا توجد حسابات بكلمة مؤقتة", "No account is on a temporary password")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
