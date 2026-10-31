// Web (PWA) viewer for an HTML document: an iframe sandboxed with NO script permission and WITHOUT `allow-same-origin`, so a
// document is plain content: it cannot run code and can never read the app's storage (the access token lives in localStorage).
// Links open in a new tab (`allow-popups`). Documents are laid out for an A4 sheet (794px); on a phone the sheet is scaled to the
// screen width (nothing cut off), and «حفظ PDF» saves it as a real A4 file without leaving the app.
import { useEffect, useRef, useState } from "react";
import { htmlToPdfBlob } from "@/lib/pdf";
import { stripEmojiHtml } from "@/lib/clean";
import { tr, useLang } from "@/i18n";
import { deliverFile } from "@/lib/web-file";

const SHEET = 794;

export function HtmlView({ html: raw, fileName = "document" }: { html: string; fileName?: string }) {
  const html = stripEmojiHtml(raw);
  useLang();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: SHEET, h: 800 });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const upd = () => setSize({ w: el.clientWidth || SHEET, h: el.clientHeight || 800 });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = Math.min(1, size.w / SHEET);
  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await htmlToPdfBlob(html);
      await deliverFile(new Uint8Array(await blob.arrayBuffer()), `${fileName.replace(/[^\w؀-ۿ.\- ]+/g, "_")}.pdf`, "application/pdf");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div ref={box} style={{ flex: 1, position: "relative", overflow: "hidden", background: "#fff", minHeight: 0 }}>
      <iframe
        title="document"
        srcDoc={html}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        style={{ position: "absolute", top: 0, left: 0, width: SHEET, height: size.h / k, border: 0, background: "#fff", transform: `scale(${k})`, transformOrigin: "top left" }}
      />
      <button onClick={save} disabled={busy}
        style={{ position: "absolute", bottom: 18, left: 14, padding: "10px 16px", borderRadius: 14, border: 0, background: "#014D3D", color: "#fff", font: "700 14px sans-serif", boxShadow: "0 4px 14px rgba(0,0,0,.3)", opacity: busy ? 0.6 : 1 }}>
        {busy ? tr("جاري التجهيز") + "…" : tr("حفظ PDF")}
      </button>
    </div>
  );
}
