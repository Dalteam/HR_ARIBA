"use client";

import { useLocale } from "@/lib/i18n/locale";
import { Modal } from "./modal";

/** Shows a newly issued temporary password once. */
export function PasswordReveal({ password, username, onClose }: { password: string; username: string; onClose: () => void }) {
  const { t } = useLocale();
  return (
    <Modal title={t("form.tempPassword")} width={420} onClose={onClose} footer={<button type="button" className="btn bpl" onClick={onClose}>{t("common.close")}</button>}>
      <div className="di" style={{ textAlign: "center", fontSize: 18, fontWeight: 800, direction: "ltr", userSelect: "all" }}>{password}</div>
      <div style={{ fontSize: 12, color: "var(--mu)", marginTop: 10 }}>{t("form.tempPasswordHint", { user: username })}</div>
    </Modal>
  );
}
