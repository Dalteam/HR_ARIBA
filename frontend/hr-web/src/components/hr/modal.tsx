"use client";

import { useEffect } from "react";

/** The prototype's modal: `.mw.on > .modal > .mh / .mb / .mf`. */
export function Modal({
  title,
  width,
  onClose,
  children,
  footer,
}: {
  title: React.ReactNode;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="mw on" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width } : undefined}>
        <div className="mh">
          <h3>{title}</h3>
          <button type="button" className="btn bsm" onClick={onClose} aria-label="close">
            <i className="ti ti-x" />
          </button>
        </div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  );
}
