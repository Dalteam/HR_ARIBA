"use client";

import { useState } from "react";
import { Modal } from "@/components/hr/modal";

/** The updated design's PromptModal: a title, an optional message, one text field (or none), confirm / cancel. */
export function PromptModal({
  title,
  message,
  label,
  defaultValue = "",
  required,
  noInput,
  danger,
  confirmText,
  cancelText = "إلغاء",
  onClose,
  onConfirm,
}: {
  title: string;
  message?: string;
  label?: string;
  defaultValue?: string;
  required?: boolean;
  noInput?: boolean;
  danger?: boolean;
  confirmText?: string;
  cancelText?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const [v, setV] = useState(defaultValue);
  const blocked = !!required && !noInput && !v.trim();
  return (
    <Modal
      title={title}
      width={440}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>{cancelText}</button>
          <button type="button" className={"btn " + (danger ? "bdr" : "bpl")} style={danger ? { background: "var(--rd)", color: "#fff" } : undefined} disabled={blocked} onClick={() => onConfirm(v.trim())}>
            {confirmText ?? "تأكيد"}
          </button>
        </>
      }
    >
      {message && <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: noInput ? 0 : 10 }}>{message}</div>}
      {!noInput && (
        <div>
          {label && <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>{label}{required ? " *" : ""}</label>}
          <textarea rows={3} value={v} autoFocus onChange={(e) => setV(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
        </div>
      )}
    </Modal>
  );
}
