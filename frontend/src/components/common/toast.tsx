"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastKind = "ok" | "err" | "info";
type Show = (message: string, kind?: ToastKind) => void;

const ToastContext = createContext<Show>(() => {});

/**
 * The prototypes' toast:
 * - HR portal: one `.toast` element toggled with `on` and `tok` / `ter` / `tin`.
 * - Employee app: `.toast-wrap > .toast` with a coloured border.
 */
export function ToastProvider({ variant, children }: { variant: "hr" | "emp"; children: React.ReactNode }) {
  const [state, setState] = useState<{ message: string; kind: ToastKind; on: boolean }>({ message: "", kind: "info", on: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<Show>((message, kind = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setState({ message, kind, on: true });
    timer.current = setTimeout(() => setState((s) => ({ ...s, on: false })), 2800);
  }, []);

  const hrClass = { ok: "tok", err: "ter", info: "tin" }[state.kind];
  const empBorder = { ok: "var(--gr)", err: "var(--rd)", info: "var(--bl)" }[state.kind];

  return (
    <ToastContext.Provider value={show}>
      {children}
      {variant === "hr" ? (
        <div className={`toast ${hrClass} ${state.on ? "on" : ""}`} role="status" aria-live="polite">
          {state.message}
        </div>
      ) : (
        <div className="toast-wrap" role="status" aria-live="polite">
          {state.on && (
            <div className="toast" style={{ borderColor: empBorder }}>
              {state.message}
            </div>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
