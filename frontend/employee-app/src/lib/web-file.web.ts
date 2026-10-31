// Web (PWA): give a file to the employee WITHOUT leaving the app. A small dialog offers «مشاركة» (the phone's share sheet: Teams,
// WhatsApp, Mail, Save to Files, Print…) and «تنزيل». Sharing is started from a fresh tap on that dialog, because browsers refuse
// to open the share sheet when the file took a few seconds to build (the PDF) and the original tap has expired. Nothing opens a
// new tab: in the installed app a new tab takes you out of the app and you could only come back by quitting it.
import { getLang, tr } from "@/i18n";

const dark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = file.name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function deliverFile(bytes: Uint8Array, name: string, mime: string): Promise<void> {
  const file = new File([bytes as BlobPart], name, { type: mime || "application/octet-stream" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const canShare = typeof nav.share === "function" && !!nav.canShare?.({ files: [file] });

  const d = dark();
  const c = { bg: d ? "#013D31" : "#FFFFFF", tx: d ? "#E8F2ED" : "#231F20", mu: d ? "#9DB5AB" : "#587066", bd: d ? "#176A58" : "#D3DDD6", green: "#29B35E", ink: "#012A21" };
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.dir = getLang() === "en" ? "ltr" : "rtl";
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:24px;font-family:AribaTwoMedium,-apple-system,'Segoe UI',Tahoma,Arial,sans-serif";
  const box = document.createElement("div");
  box.style.cssText = `width:100%;max-width:360px;background:${c.bg};color:${c.tx};border:1px solid ${c.bd};border-radius:18px;padding:20px 18px 14px;box-shadow:0 18px 50px rgba(0,0,0,.35)`;
  const h = document.createElement("div");
  h.textContent = tr("الملف جاهز");
  h.style.cssText = "font-size:17px;font-weight:800;margin-bottom:6px";
  const p = document.createElement("div");
  p.textContent = name;
  p.style.cssText = `font-size:13px;color:${c.mu};word-break:break-all;direction:ltr;text-align:left;margin-bottom:6px`;
  const hint = document.createElement("div");
  hint.textContent = tr(canShare ? "اختر «مشاركة» ثم Teams أو أي تطبيق آخر، أو نزّل الملف." : "نزّل الملف، ثم أرفقه في Teams أو البريد.");
  hint.style.cssText = `font-size:13px;line-height:1.7;color:${c.mu};margin-bottom:14px`;
  box.append(h, p, hint);

  const close = () => { document.removeEventListener("keydown", onKey, true); overlay.remove(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);

  const col = document.createElement("div");
  col.style.cssText = "display:flex;flex-direction:column;gap:8px";
  const btn = (text: string, primary: boolean, on: () => void) => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = tr(text);
    el.style.cssText = `min-height:46px;border-radius:12px;border:1px solid ${primary ? c.green : c.bd};background:${primary ? c.green : "transparent"};color:${primary ? c.ink : c.tx};font:inherit;font-size:15px;font-weight:800;cursor:pointer;padding:0 12px`;
    el.addEventListener("click", on);
    col.appendChild(el);
    return el;
  };
  let first: HTMLButtonElement | null = null;
  if (canShare) {
    first = btn("مشاركة (Teams وغيرها)", true, async () => {
      try { await nav.share!({ files: [file], title: name }); close(); }
      catch (e) { if ((e as Error).name !== "AbortError") { hint.textContent = tr("تعذرت المشاركة من هذا المتصفح، نزّل الملف بدلًا منها."); } }
    });
  }
  const dl = btn("تنزيل", !canShare, () => { download(file); close(); });
  if (!canShare) {
    btn("فتح Teams", false, () => { window.open("https://teams.microsoft.com/l/chat/0/0?message=" + encodeURIComponent(tr("مرفق:") + " " + name), "_blank", "noopener"); });
  }
  btn("إغلاق", false, close);
  box.appendChild(col);
  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  (first ?? dl).focus();
}
