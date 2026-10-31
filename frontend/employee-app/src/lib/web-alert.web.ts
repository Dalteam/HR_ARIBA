// Web (PWA): React Native Web's Alert.alert does nothing, so the trash buttons and the «approve with signature» confirmation
// never ran. This puts a real dialog in its place, keeping the same call shape (title, message, buttons[{text,style,onPress}]).
// Plain DOM on purpose: it works above every screen and modal, in light and dark, right-to-left.
import { Alert, type AlertButton, type AlertOptions } from "react-native";
import { getLang, tr } from "@/i18n";

const dark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

function show(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
  const list: AlertButton[] = buttons && buttons.length ? buttons : [{ text: "حسنًا" }];
  const d = dark();
  const c = { bg: d ? "#013D31" : "#FFFFFF", tx: d ? "#E8F2ED" : "#231F20", mu: d ? "#9DB5AB" : "#587066", bd: d ? "#176A58" : "#D3DDD6", green: "#29B35E", red: "#B3342B", ink: "#012A21" };
  const prev = document.activeElement as HTMLElement | null;

  const overlay = document.createElement("div");
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.dir = getLang() === "en" ? "ltr" : "rtl";
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:24px;font-family:AribaTwoMedium,-apple-system,'Segoe UI',Tahoma,Arial,sans-serif";
  const box = document.createElement("div");
  box.style.cssText = `width:100%;max-width:360px;background:${c.bg};color:${c.tx};border:1px solid ${c.bd};border-radius:18px;padding:20px 18px 14px;box-shadow:0 18px 50px rgba(0,0,0,.35)`;
  const h = document.createElement("div");
  h.textContent = tr(title);
  h.style.cssText = "font-size:17px;font-weight:800;line-height:1.5;margin-bottom:6px";
  box.appendChild(h);
  if (message) {
    const p = document.createElement("div");
    p.textContent = tr(message);
    p.style.cssText = `font-size:14px;line-height:1.7;color:${c.mu};white-space:pre-line;margin-bottom:14px`;
    box.appendChild(p);
  }
  const row = document.createElement("div");
  row.style.cssText = `display:flex;gap:10px;flex-direction:${list.length > 2 ? "column" : "row-reverse"};margin-top:6px`;

  let done = false;
  const close = (b?: AlertButton) => {
    if (done) return;
    done = true;
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
    try { prev?.focus?.(); } catch { /* the element is gone */ }
    if (b?.onPress) setTimeout(() => b.onPress?.(), 0);
  };
  const cancelBtn = list.find((b) => b.style === "cancel");
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(cancelBtn); } };
  document.addEventListener("keydown", onKey, true);

  let focus: HTMLButtonElement | null = null;
  list.forEach((b) => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = tr(b.text ?? "") || "حسنًا";
    const primary = b.style !== "cancel";
    const bg = b.style === "destructive" ? c.red : primary ? c.green : "transparent";
    const fg = b.style === "destructive" ? "#FFFFFF" : primary ? c.ink : c.tx;
    el.style.cssText = `flex:1;min-height:46px;border-radius:12px;border:1px solid ${primary ? bg : c.bd};background:${bg};color:${fg};font:inherit;font-size:15px;font-weight:800;cursor:pointer;padding:0 12px`;
    el.addEventListener("click", () => close(b));
    row.appendChild(el);
    if (!focus || b.style === "cancel") focus = el;   // a destructive dialog starts on «cancel»
  });
  box.appendChild(row);
  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => { if (e.target === overlay && options?.cancelable !== false) { close(cancelBtn); options?.onDismiss?.(); } });
  document.body.appendChild(overlay);
  (focus as HTMLButtonElement | null)?.focus();
}

Alert.alert = show;
