// Web (PWA): HTML → a real A4 PDF file inside the app, so the employee never leaves it (window.open sent the installed app to a
// browser tab that could only be left by quitting the app). The libraries load only when a PDF is asked for.
import { stripEmojiHtml } from "./clean";
const ONE_PAGE_UP_TO = 1.35;   // up to this many pages tall still goes on a single page (the text shrinks at most to ~74%)
const A4_W = 794;   // A4 at 96 dpi, in CSS pixels

export async function htmlToPdfBlob(html: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_W}px;height:1123px;border:0;background:#fff`;
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
    doc.open(); doc.write(stripEmojiHtml(html)); doc.close();
    doc.body.style.cssText += `;margin:0;padding:36px 40px;width:${A4_W}px;box-sizing:border-box;background:#fff`;
    await Promise.race([(doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 2000))]);
    await Promise.all(Array.from(doc.images).map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(null); }))));
    const w = Math.max(A4_W, doc.documentElement.scrollWidth, doc.body.scrollWidth);   // wide content is scaled to the page, never cut
    const canvas = await html2canvas(doc.body, { scale: 2, backgroundColor: "#ffffff", width: w, windowWidth: w, useCORS: true });
    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pw) / canvas.width, data = canvas.toDataURL("image/jpeg", 0.92);
    if (imgH <= ph * ONE_PAGE_UP_TO) {   // a page and a little: shrink to one full page instead of a second page with a sliver
      const k = Math.min(1, ph / imgH), w = pw * k;
      pdf.addImage(data, "JPEG", (pw - w) / 2, 0, w, imgH * k);
    } else {
      for (let y = 0, page = 0; y < imgH - 1; y += ph, page++) {   // a really long document continues on the next page
        if (page) pdf.addPage();
        pdf.addImage(data, "JPEG", 0, -y, pw, imgH);
      }
    }
    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}
